/**
 * services/anuncioHora.js — "da la hora" (estilo Zara/RadioBOSS)
 * ------------------------------------------------------------------
 * Cada hora (o media / cuarto) suena la hora con voz de locutor real.
 *
 * CÓMO FUNCIONA (reescrito 2026-08-12 — ver services/programacion.js para el
 * porqué largo):
 *
 *   • Una playlist por franja: `⏰ Hora :00` (y `:15`/`:30`/`:45` si aplica),
 *     de tipo `once_per_hour` con `play_per_hour_minute` = el minuto de la
 *     franja. AzuraCast la dispara sola, y lo hace evaluando el momento en que
 *     el slot de la cola VA a sonar, así que es puntual pese a que la cola se
 *     arma con 10-20 min de anticipación.
 *
 *   • El audio de cada hora es FIJO (se arma concatenando los fragmentos de
 *     `times/`), así que se sube UNA vez por estación y se reutiliza siempre:
 *     `panel-hora-<voz>-HHMM.mp3`. Lo único que hace el planificador es
 *     cambiar qué archivo está en la playlist, y lo hace con ANTICIPO_MIN de
 *     adelanto para ganarle al pre-armado de la cola.
 *
 *   • No hay "retiro": `once_per_hour` ya garantiza un disparo por hora, así
 *     que el archivo puede quedarse en su playlist sin repetirse. El viejo
 *     `programarRetiro` (temporizador en memoria) era justo lo que impedía que
 *     el anuncio llegara a sonar, y dejaba basura al reiniciar pm2.
 *
 * CONFIG por cliente en la tabla `anuncio_hora` (activo, cada_min, voz, zona).
 * ------------------------------------------------------------------
 */
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { query } = require('../config/database');
const clienteModel = require('./../models/clienteModel');
const azuracast = require('./azuracast');
const prog = require('./programacion');
const { partesEnZona, DEFAULT_TZ } = require('./zonaHoraria');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Minutos de adelanto con que se deja listo el audio de la próxima franja.
 *
 *  Suelo: debe superar el pre-armado de la cola (autodj_queue_length × duración
 *  de canción ≈ 20 min en el peor caso).
 *  Techo: preparar la franja `min` la sobrescribe, y su ventana de disparo dura
 *  15 min desde :min; con ANTICIPO > 45 la estaríamos pisando mientras aún
 *  puede sonar. De ahí el clamp. */
const ANTICIPO_MIN = Math.min(45, Math.max(20, Number(process.env.ANUNCIO_ANTICIPO_MIN) || 30));

/** Nombre de la playlist de una franja. `:00`, `:15`, `:30`, `:45`. */
const nombrePlaylist = (min) => `⏰ Hora :${String(min).padStart(2, '0')}`;

/** Franjas (minutos de la hora) según `cada_min`. */
function franjasDe(cadaMin) {
  if (cadaMin === 15) return [0, 15, 30, 45];
  if (cadaMin === 30) return [0, 30];
  return [0];
}
const TODAS_LAS_FRANJAS = [0, 15, 30, 45];

// ---- Voz de LOCUTOR por fragmentos (carpeta times/) --------------
// Set profesional: HRSxx = "son las xx", HRSxx_O = "son las xx en punto",
// MINmm = "y mm". La hora se arma concatenando con ffmpeg. 3 voces.
const TIMES_DIR = path.join(__dirname, '..', 'times');
const VOZ_CARPETA = {
  hombre: '1hombre', hombre_cantada: '2hombrecantada', mujer: '3mujer',
  // compatibilidad con valores viejos:
  masculina: '1hombre', femenina: '3mujer',
};
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

/**
 * Silencio (en segundos) que se antepone y añade al anuncio.
 *
 * POR QUÉ: la estación aplica un crossfade (2s por defecto) al entrar cada
 * pista, así que los primeros segundos del anuncio se mezclan por debajo de la
 * canción que sale. Y la HORA es justo lo primero que se dice, y es cortísima:
 * el fragmento "las siete" dura 0,68s y el de "en punto" 1,3s — o sea que un
 * anuncio "en punto" entero (1,3s) cabe dentro del crossfade y NO SE OYE NADA.
 * Con este colchón, el crossfade se come silencio y la hora entra limpia.
 *
 * Debe ser mayor que el `crossfade` de la estación (2s). El de cola evita que
 * el fade de salida se coma la última sílaba.
 */
const LEAD_IN_S = Number(process.env.ANUNCIO_LEAD_IN || 3);
const TAIL_S = Number(process.env.ANUNCIO_TAIL || 1);
const SILENCIO = ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo'];

/** Concatena mp3 en un Buffer, con colchón de silencio al inicio y al final. */
function concatMp3(files, { leadIn = 0, tail = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['-hide_banner', '-loglevel', 'error'];
    let n = 0;
    if (leadIn > 0) { args.push('-t', String(leadIn), ...SILENCIO); n++; }
    files.forEach((f) => { args.push('-i', f); n++; });
    if (tail > 0) { args.push('-t', String(tail), ...SILENCIO); n++; }
    const filtro = Array.from({ length: n }, (_, i) => `[${i}:a]`).join('') + `concat=n=${n}:v=0:a=1[out]`;
    args.push('-filter_complex', filtro, '-map', '[out]', '-ac', '2', '-ar', '44100', '-b:a', '128k', '-f', 'mp3', 'pipe:1');
    const ff = spawn(FFMPEG, args);
    const out = [], err = [];
    ff.stdout.on('data', (d) => out.push(d));
    ff.stderr.on('data', (d) => err.push(d));
    ff.on('error', reject);
    ff.on('close', (c) => c === 0 ? resolve(Buffer.concat(out)) : reject(new Error('ffmpeg: ' + Buffer.concat(err).toString().slice(0, 200))));
  });
}

/** Arma "son las HH y MM" con la voz de locutor elegida. Devuelve un mp3 Buffer. */
async function generarHoraFragmentos(hora, minuto, voz) {
  const carpeta = VOZ_CARPETA[voz] || VOZ_CARPETA.hombre;
  const dir = path.join(TIMES_DIR, carpeta);
  const hh = String(hora).padStart(2, '0');
  const mm = String(minuto).padStart(2, '0');
  const files = minuto === 0
    ? [path.join(dir, `HRS${hh}_O.mp3`)]                          // "…en punto"
    : [path.join(dir, `HRS${hh}.mp3`), path.join(dir, `MIN${mm}.mp3`)];
  for (const f of files) if (!fs.existsSync(f)) throw new Error(`falta fragmento ${path.basename(f)} (${carpeta})`);
  // Siempre por ffmpeg, aunque sea un solo fragmento: hace falta para el
  // colchón de silencio que protege la hora del crossfade (ver LEAD_IN_S).
  return concatMp3(files, { leadIn: LEAD_IN_S, tail: TAIL_S });
}

// ---- Texto de la hora en español ---------------------------------
// Solo para lo que se MUESTRA en el panel (el "ejemplo" y los logs). El audio
// que sale al aire son los fragmentos de locutor, no este texto.
const HORAS = ['', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce'];
const U = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece',
  'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés',
  'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve', 'treinta'];
function minutoTxt(m) {
  if (m <= 30) return U[m];
  const dec = ['treinta', 'cuarenta', 'cincuenta'][Math.floor(m / 10) - 3];
  const u = m % 10;
  return u ? `${dec} y ${U[u]}` : dec;
}

/** "Son las tres y media de la tarde" (o "Es la una en punto de la mañana"). */
function textoHora(fecha, { saludo, zona, hora: hOverride, minuto: mOverride } = {}) {
  const base0 = zona ? partesEnZona(zona) : { hora: fecha.getHours(), minuto: fecha.getMinutes() };
  const h = hOverride ?? base0.hora;
  const m = mOverride ?? base0.minuto;
  const periodo = h < 12 ? 'de la mañana' : h < 19 ? 'de la tarde' : 'de la noche';
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  const cab = h12 === 1 ? 'Es la una' : `Son las ${HORAS[h12]}`;
  const min = m === 0 ? 'en punto' : m === 15 ? 'y cuarto' : m === 30 ? 'y media' : `y ${minutoTxt(m)}`;
  const base = `${cab} ${min} ${periodo}`.replace(/\s+/g, ' ').trim();
  return saludo ? `${saludo}. ${base}` : base;
}

// ---- Clima (Open-Meteo, gratis, sin API key) ---------------------
// NOTA: la config expone `ciudad`/`con_clima`, pero el audio que sale al aire
// son los fragmentos de locutor pregrabados, que no pueden incluir el clima.
// Se conserva el helper para cuando haya una voz sintética aceptable.
const CIELO = {   // códigos WMO → descripción en español (resumen)
  0: 'despejado', 1: 'mayormente despejado', 2: 'parcialmente nublado', 3: 'nublado',
  45: 'con niebla', 48: 'con niebla', 51: 'con llovizna', 53: 'con llovizna', 55: 'con llovizna',
  61: 'con lluvia', 63: 'con lluvia', 65: 'con lluvia fuerte', 71: 'con nieve', 80: 'con chubascos',
  81: 'con chubascos', 82: 'con chubascos fuertes', 95: 'con tormenta', 96: 'con tormenta', 99: 'con tormenta',
};
const geoCache = new Map();   // ciudad -> {lat, lon, nombre}

async function geocodificar(ciudad) {
  if (geoCache.has(ciudad)) return geoCache.get(ciudad);
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ciudad)}&count=1&language=es`);
  const d = await r.json();
  const g = d?.results?.[0];
  const val = g ? { lat: g.latitude, lon: g.longitude, nombre: g.name } : null;
  geoCache.set(ciudad, val);
  return val;
}

/** "26 grados en Cali, cielo despejado" (o null si no se pudo). */
async function climaTexto(ciudad) {
  if (!ciudad) return null;
  try {
    const g = await geocodificar(ciudad);
    if (!g) return null;
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${g.lat}&longitude=${g.lon}&current=temperature_2m,weather_code`);
    const d = await r.json();
    const t = Math.round(d?.current?.temperature_2m);
    if (Number.isNaN(t)) return null;
    const cielo = CIELO[d?.current?.weather_code];
    return `${t} grados en ${g.nombre}${cielo ? `, ${cielo}` : ''}`;
  } catch (e) { console.error('[anuncio] clima:', e.message); return null; }
}

// ---- Voz (TTS) ----------------------------------------------------
/** Genera el MP3 de un texto. Devuelve un Buffer. Lo usan las cuñas de texto. */
async function generarVoz(texto, { voz } = {}) {
  const cmd = process.env.ANUNCIO_TTS_CMD;   // ej: comando que recibe el texto por args y devuelve mp3 por stdout
  if (cmd && (voz === 'masculina' || voz === 'hombre')) {
    return await new Promise((resolve, reject) => {
      execFile(cmd, [texto], { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 }, (e, out) => e ? reject(e) : resolve(out));
    });
  }
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=es&q=${encodeURIComponent(texto)}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`TTS ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// ---- Archivos de hora en AzuraCast --------------------------------
/** `panel-hora-hombre-1430-li3.mp3` — determinista, se sube una vez y se reutiliza.
 *  El sufijo `li<N>` es el colchón de silencio con que se generó: si se cambia
 *  ANUNCIO_LEAD_IN, el nombre cambia y los audios se regeneran solos (y los
 *  viejos los barre `limpiarHorasObsoletas`). */
const SUFIJO = `-li${LEAD_IN_S}`;
const nombreArchivo = (voz, hora, minuto) =>
  `panel-hora-${VOZ_CARPETA[voz] ? voz : 'hombre'}-${String(hora).padStart(2, '0')}${String(minuto).padStart(2, '0')}${SUFIJO}.mp3`;

/** Borra los audios de hora generados con otro colchón (o sin él). */
async function limpiarHorasObsoletas(az, stationId, files) {
  for (const f of files) {
    const n = (f.path || '').split('/').pop();
    if (!/^panel-hora-/.test(n) || n.endsWith(`${SUFIJO}.mp3`)) continue;
    await az.deleteMedia(stationId, f.id).catch(() => {});
  }
}

/**
 * Devuelve el media id del audio de esa hora en esa estación, subiéndolo si
 * aún no está. Como el nombre es determinista, a partir del segundo día ya no
 * se sube nada: solo se consulta.
 */
async function asegurarArchivoHora(az, stationId, voz, hora, minuto, listaPrecargada = null) {
  const nombre = nombreArchivo(voz, hora, minuto);
  const files = listaPrecargada || (await az.listMedia(stationId)) || [];
  const ya = files.find((f) => (f.path || '').split('/').pop() === nombre);
  if (ya) return { id: ya.id, subido: false };

  const mp3 = await generarHoraFragmentos(hora, minuto, voz);
  const media = await az.uploadMedia(stationId, nombre, mp3.toString('base64'));
  return { id: media.id, subido: true };
}

/**
 * Crea/corrige las playlists de franja de una estación y deshabilita las que
 * ya no correspondan (p.ej. el cliente pasó de cada 30 min a cada hora, o
 * apagó la función). Idempotente: se puede llamar en cada guardado.
 */
async function sincronizarPlaylists(az, stationId, cfg) {
  const activas = cfg.activo ? franjasDe(Number(cfg.cada_min)) : [];
  const ids = {};
  for (const min of TODAS_LAS_FRANJAS) {
    const usada = activas.includes(min);
    // Las franjas que no se usan se BORRAN, no se dejan deshabilitadas: así la
    // estación no acumula playlists muertas visibles en la UI de AzuraCast.
    if (!usada) {
      await prog.borrarPlaylistPorNombre(az, stationId, nombrePlaylist(min)).catch(() => {});
      continue;
    }
    ids[min] = await prog.playlistSincronizada(az, stationId, nombrePlaylist(min), {
      type: 'once_per_hour',
      play_per_hour_minute: min,
    });
  }
  return ids;
}

/**
 * Deja listo en AzuraCast el audio de la franja `min` de la hora `hora`.
 * Es la única operación periódica: cambiar qué archivo está en la playlist.
 */
async function prepararFranja(az, stationId, cfg, hora, min) {
  const plId = await prog.playlistSincronizada(az, stationId, nombrePlaylist(min), {
    type: 'once_per_hour',
    play_per_hour_minute: min,
  });
  // Una sola lectura del media de la estación para las dos operaciones (puede
  // ser una biblioteca de miles de archivos).
  let files = (await az.listMedia(stationId)) || [];
  const { id, subido } = await asegurarArchivoHora(az, stationId, cfg.voz, hora, min, files);
  if (subido) {
    await limpiarHorasObsoletas(az, stationId, files);          // fuera los del colchón viejo
    files = (await az.listMedia(stationId)) || [];              // el nuevo aún no estaba en la lista
  }
  await prog.ponerUnicoArchivo(az, stationId, plId, id, files);
  return id;
}

/**
 * Prueba manual desde el panel: hace sonar la hora ACTUAL cuanto antes.
 * A diferencia de la programación normal, aquí sí tiramos la cola pre-armada
 * (`reproducirAhora`) porque el cliente está esperando oírlo.
 */
async function anunciarEn(cliente, { zona = null, voz = null } = {}) {
  const az = await azuracast.paraServidorId(cliente.servidor_id);
  const stationId = cliente.azuracast_station_id;
  if (!stationId) return { ok: false, error: 'sin estación' };

  const { hora, minuto } = zona ? partesEnZona(zona) : { hora: new Date().getHours(), minuto: new Date().getMinutes() };
  const texto = textoHora(new Date(), { zona, hora, minuto });

  let mediaId;
  try {
    mediaId = (await asegurarArchivoHora(az, stationId, voz, hora, minuto)).id;
  } catch (e) {
    return { ok: false, error: `no se pudo armar la hora: ${e.message}` };
  }

  const r = await prog.reproducirAhora(az, stationId, mediaId);
  return { ok: true, texto, segundos: r.segundos };
}

// ---- Config (tabla anuncio_hora) ---------------------------------
async function verConfig(clienteId) {
  const { rows } = await query('SELECT cliente_id, activo, cada_min, con_saludo, ciudad, con_clima, zona_horaria, voz FROM anuncio_hora WHERE cliente_id = $1', [clienteId]);
  return rows[0] || { cliente_id: clienteId, activo: false, cada_min: 60, con_saludo: false, ciudad: null, con_clima: false, zona_horaria: DEFAULT_TZ, voz: 'hombre' };
}

async function guardarConfig(clienteId, { activo, cada_min, con_saludo, ciudad, con_clima, zona_horaria, voz }) {
  const cada = [15, 30, 60].includes(Number(cada_min)) ? Number(cada_min) : 60;
  const ciu = ciudad !== undefined ? (String(ciudad || '').trim().slice(0, 120) || null) : undefined;
  const zona = (typeof zona_horaria === 'string' && zona_horaria.trim()) ? zona_horaria.trim().slice(0, 64) : null;
  const vz = ['hombre', 'hombre_cantada', 'mujer'].includes(voz) ? voz : null;   // null → no cambia
  await query(
    `INSERT INTO anuncio_hora (cliente_id, activo, cada_min, con_saludo, ciudad, con_clima, zona_horaria, voz, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6, COALESCE($7,'America/Bogota'), COALESCE($8,'hombre'), now())
     ON CONFLICT (cliente_id) DO UPDATE SET
       activo = $2, cada_min = $3, con_saludo = $4,
       ciudad = COALESCE($5, anuncio_hora.ciudad), con_clima = $6,
       zona_horaria = COALESCE($7, anuncio_hora.zona_horaria),
       voz = COALESCE($8, anuncio_hora.voz), updated_at = now()`,
    [clienteId, Boolean(activo), cada, Boolean(con_saludo), ciu ?? null, Boolean(con_clima), zona, vz]
  );

  const cfg = await verConfig(clienteId);
  // Aplica el cambio en AzuraCast al momento: si el cliente apagó la función o
  // cambió la frecuencia, no tiene por qué esperar al siguiente tick.
  try {
    const cliente = await clienteModel.findById(clienteId);
    if (cliente?.azuracast_station_id) {
      const az = await azuracast.paraServidorId(cliente.servidor_id);
      await prog.sincronizarZona(az, cliente.azuracast_station_id, cfg.zona_horaria);
      await sincronizarPlaylists(az, cliente.azuracast_station_id, cfg);
    }
  } catch (e) { console.error('[anuncio] sincronizar config:', e.message); }

  return cfg;
}

// ---- Planificador -------------------------------------------------
// Ya no dispara el anuncio: solo deja el archivo correcto en la playlist con
// ANTICIPO_MIN de adelanto. Quien lo pone al aire, puntual, es AzuraCast.
let timer = null;
let corriendo = false;         // el tick puede tardar más de un minuto; no se solapa
const preparado = new Map();   // `${clienteId}:${min}` -> hora ya dejada lista

async function tick() {
  if (corriendo) return;       // una biblioteca de ~1000 archivos tarda ~3s por lectura
  corriendo = true;
  try {
    const { rows } = await query(
      'SELECT cliente_id, cada_min, zona_horaria, voz FROM anuncio_hora WHERE activo = true'
    );

    for (const cfg of rows) {
      try {
        const zona = cfg.zona_horaria || DEFAULT_TZ;
        const { hora, minuto } = partesEnZona(zona);

        // Qué franjas toca preparar. Se calcula ANTES de ir a la BD y a
        // AzuraCast: en la inmensa mayoría de los ticks no hay nada que hacer.
        const pendientes = [];
        for (const min of franjasDe(Number(cfg.cada_min))) {
          // Minutos hasta la PRÓXIMA vez que den las HH:min. Si estamos justo
          // en :min, la próxima es dentro de una hora (60, no 0): si no, al dar
          // la hora sobrescribiríamos el archivo que está a punto de sonar.
          const faltan = (min - minuto + 60) % 60 || 60;
          if (faltan > ANTICIPO_MIN) continue;
          const horaObjetivo = (hora + Math.floor((minuto + faltan) / 60)) % 24;
          if (preparado.get(`${cfg.cliente_id}:${min}`) === horaObjetivo) continue;
          pendientes.push({ min, horaObjetivo, faltan });
        }
        if (!pendientes.length) continue;

        const cliente = await clienteModel.findById(cfg.cliente_id);
        if (!cliente?.azuracast_station_id || cliente.tipo === 'video' || !cliente.activo) continue;
        const az = await azuracast.paraServidorId(cliente.servidor_id);

        for (const { min, horaObjetivo, faltan } of pendientes) {
          await prepararFranja(az, cliente.azuracast_station_id, cfg, horaObjetivo, min);
          preparado.set(`${cfg.cliente_id}:${min}`, horaObjetivo);
          console.log(`[anuncio] ${cliente.nombre_empresa}: listo ${String(horaObjetivo).padStart(2, '0')}:${String(min).padStart(2, '0')} (${faltan} min antes)`);
        }
      } catch (e) {
        console.error(`[anuncio] cliente ${cfg.cliente_id}:`, e.message);
      }
    }
  } finally {
    corriendo = false;
  }
}

/**
 * Al arrancar: barre las playlists de prueba que hayan quedado con un archivo
 * dentro por un pm2 restart a media prueba (si no, sonarían entre cada canción).
 */
async function limpiarAlArrancar() {
  const { rows } = await query(
    `SELECT id, servidor_id, azuracast_station_id FROM clientes
      WHERE activo = true AND tipo IS DISTINCT FROM 'video' AND azuracast_station_id IS NOT NULL`
  );
  for (const c of rows) {
    try {
      const az = await azuracast.paraServidorId(c.servidor_id);
      await prog.limpiarPruebas(az, c.azuracast_station_id);
    } catch (_) { /* estación caída: se reintenta en el próximo arranque */ }
  }
}

function iniciar() {
  if (timer) return;
  timer = setInterval(() => tick().catch((e) => console.error('[anuncio] tick:', e.message)), 60000);
  tick().catch((e) => console.error('[anuncio] tick inicial:', e.message));
  sleep(5000).then(limpiarAlArrancar).catch((e) => console.error('[anuncio] limpieza inicial:', e.message));
  console.log(`⏰ Anuncio de hora activo (prepara cada franja ${ANTICIPO_MIN} min antes; lo dispara AzuraCast)`);
}

module.exports = {
  iniciar, verConfig, guardarConfig, anunciarEn, textoHora, generarVoz, climaTexto,
  sincronizarPlaylists, prepararFranja, franjasDe, nombrePlaylist, asegurarArchivoHora, TODAS_LAS_FRANJAS,
};
