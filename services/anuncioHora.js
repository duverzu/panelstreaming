/**
 * services/anuncioHora.js — "da la hora" dinámico (estilo Zara/RadioBOSS)
 * ------------------------------------------------------------------
 * Cada tanto (cada hora / media / cuarto) genera con voz la hora actual
 * ("Son las tres y media de la tarde") y la INYECTA al aire de la estación:
 *   1) genera el MP3 con TTS,
 *   2) lo sube a AzuraCast (a una playlist de anuncios, requestable + jingle),
 *   3) lo encola (request) para que suene, y opcionalmente salta la canción
 *      actual para que la hora sea puntual.
 *
 * TTS: por defecto usa la voz de Google Translate (buena en español, sin
 * instalar nada). Se puede cambiar a otra (Piper, Polly…) con ANUNCIO_TTS_CMD.
 *
 * CONFIG por cliente en la tabla `anuncio_hora` (activo, cada_min, con_saludo).
 * ------------------------------------------------------------------
 */
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { query } = require('../config/database');
const clienteModel = require('./../models/clienteModel');
const azuracast = require('./azuracast');
const { partesEnZona, DEFAULT_TZ } = require('./zonaHoraria');

const PLAYLIST = '⏰ Anuncio de hora';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

/** Concatena varios mp3 en un Buffer (re-encodea para evitar cortes/clicks). */
function concatMp3(files) {
  return new Promise((resolve, reject) => {
    const args = ['-hide_banner', '-loglevel', 'error'];
    files.forEach((f) => args.push('-i', f));
    const filtro = files.map((_, i) => `[${i}:a]`).join('') + `concat=n=${files.length}:v=0:a=1[out]`;
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
  return concatMp3(files);
}

// ---- Texto de la hora en español ---------------------------------
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
function textoHora(fecha, { saludo, zona } = {}) {
  // Con zona: la hora del cliente (no la del servidor). Sin zona: la del servidor.
  const { hora: h, minuto: m } = zona ? partesEnZona(zona) : { hora: fecha.getHours(), minuto: fecha.getMinutes() };
  const periodo = h < 12 ? 'de la mañana' : h < 19 ? 'de la tarde' : 'de la noche';
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  const cab = h12 === 1 ? 'Es la una' : `Son las ${HORAS[h12]}`;
  const min = m === 0 ? 'en punto' : m === 15 ? 'y cuarto' : m === 30 ? 'y media' : `y ${minutoTxt(m)}`;
  const base = `${cab} ${min} ${periodo}`.replace(/\s+/g, ' ').trim();
  return saludo ? `${saludo}. ${base}` : base;
}

// ---- Clima (Open-Meteo, gratis, sin API key) ---------------------
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
/** Genera el MP3 de un texto. Devuelve un Buffer. */
async function generarVoz(texto, { voz } = {}) {
  const cmd = process.env.ANUNCIO_TTS_CMD;   // ej: comando que recibe el texto por args y devuelve mp3 por stdout
  // Voz de locutor (Piper) SOLO si el cliente eligió 'masculina' y está configurada.
  // 'femenina' (o sin preferencia) → Google Translate TTS.
  if (cmd && voz === 'masculina') {
    return await new Promise((resolve, reject) => {
      execFile(cmd, [texto], { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 }, (e, out) => e ? reject(e) : resolve(out));
    });
  }
  // Por defecto: voz de Google Translate (español). Texto corto, un request por franja.
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=es&q=${encodeURIComponent(texto)}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`TTS ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// ---- Inyección en AzuraCast --------------------------------------
// Nombre "marca" (sin carpeta ni extensión) para reconocer el archivo en el
// "ahora suena" de AzuraCast (title = nombre del archivo cuando no hay ID3).
const marca = (n) => String(n).split('/').pop().replace(/\.[^.]+$/, '');

/**
 * Busca/crea la playlist de anuncios como JINGLE (suena entre canciones, puntual
 * y fiable — confirmado en vivo). OJO: los cambios de jingle solo se ACTIVAN tras
 * un reinicio de la estación (rebuild de config): eso se hace UNA vez por estación
 * con scripts/activar-jingles.js. Aquí solo se cambia el ARCHIVO de la playlist
 * (eso sí toma efecto sin reiniciar). Para que no se repita, el anuncio se saca
 * tras sonar una vez (ver programarRetiro).
 */
async function playlistAnuncios(az, stationId) {
  const pls = (await az.getPlaylists(stationId)) || [];
  const existe = pls.find((p) => p.name === PLAYLIST);
  if (existe) {
    if (!existe.is_jingle || !existe.is_enabled || existe.play_per_songs !== 1) {
      await az.updatePlaylist(stationId, existe.id, { is_jingle: true, is_enabled: true, play_per_songs: 1, include_in_requests: false }).catch(() => {});
    }
    return existe.id;
  }
  const pl = await az.createPlaylist(stationId, {
    name: PLAYLIST, type: 'default', source: 'songs',
    is_jingle: true, is_enabled: true, play_per_songs: 1, include_in_requests: false, include_in_on_demand: false, weight: 1,
  });
  return pl.id;
}

/**
 * Quita (en segundo plano) el archivo de su playlist tras sonar UNA vez, para que
 * el jingle no se repita entre canciones. Como los jingles NO salen en el "ahora
 * suena", no se puede detectar: se calcula por TIEMPO = lo que le falta a la
 * canción actual (el jingle suena al terminarla) + un margen. Si no hay dato de
 * la canción, usa un tiempo prudente. `borrarClienteId` borra los anuncios viejos.
 */
async function programarRetiro(az, stationId, mediaNumId, { borrarClienteId = null } = {}) {
  let espera = 150000;                                   // fallback ~2.5 min
  try {
    const np = await az.getNowPlaying(stationId);
    const dur = np?.now_playing?.duration || 0;
    const el = np?.now_playing?.elapsed || 0;
    if (dur) espera = (Math.max(0, dur - el) + 25) * 1000;   // fin de canción + margen
  } catch (_) {}
  await sleep(espera);
  if (mediaNumId != null) await az.setFilePlaylists(stationId, mediaNumId, []).catch(() => {});
  if (borrarClienteId) await limpiarViejos(az, stationId, borrarClienteId, null);
}

/**
 * Borra TODOS los anuncios de hora viejos de un cliente (menos `keepId`).
 * Antes solo se recordaba el último en memoria; con los reinicios de pm2 se
 * acumulaban archivos (`anuncio-hora-31-...mp3`) que seguían sonando la hora
 * pasada. Esto barre todos por nombre, sobreviva o no el proceso.
 */
async function limpiarViejos(az, stationId, clienteId, keepId) {
  try {
    const files = (await az.listMedia(stationId)) || [];
    const rx = new RegExp(`(^|/)anuncio-hora-${clienteId}(-|\\.)`);
    for (const f of files) {
      if (f.id !== keepId && rx.test(f.path || f.title || '')) {
        await az.deleteMedia(stationId, f.id).catch(() => {});
      }
    }
  } catch (_) {}
}

/** Genera la hora (voz de locutor por fragmentos) y la pone a sonar. */
async function anunciarEn(cliente, { skip = true, saludo = null, ciudad = null, con_clima = false, zona = null, voz = null } = {}) {
  const az = await azuracast.paraServidorId(cliente.servidor_id);
  const stationId = cliente.azuracast_station_id;
  if (!stationId) return { ok: false, error: 'sin estación' };

  // Hora actual EN LA ZONA del cliente (0-23, 0-59).
  const { hora, minuto } = zona ? partesEnZona(zona) : { hora: new Date().getHours(), minuto: new Date().getMinutes() };
  const texto = textoHora(new Date(), { zona });                 // solo para el mensaje/log
  let mp3;
  try {
    mp3 = await generarHoraFragmentos(hora, minuto, voz);        // voz de locutor real
  } catch (e) {
    return { ok: false, error: `no se pudo armar la hora: ${e.message}` };
  }
  // Nombre ÚNICO cada vez: si se reusa el mismo, AzuraCast puede reproducir la
  // versión vieja (aún sin re-analizar) y decir una hora pasada.
  const nombre = `anuncio-hora-${cliente.id}-${Date.now()}.mp3`;

  const media = await az.uploadMedia(stationId, nombre, mp3.toString('base64'));
  await limpiarViejos(az, stationId, cliente.id, media.id);      // fuera anuncios viejos ANTES
  const plId = await playlistAnuncios(az, stationId);            // playlist jingle
  await az.setFilePlaylists(stationId, media.id, [plId]);        // queda como jingle → suena tras la canción
  // En segundo plano: lo saca tras sonar una vez (por tiempo) para no repetir.
  programarRetiro(az, stationId, media.id, { borrarClienteId: cliente.id })
    .catch((e) => console.error('[anuncio] retiro:', e.message));
  return { ok: true, texto };
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
  return verConfig(clienteId);
}

// ---- Planificador -------------------------------------------------
let timer = null;
const ultimoSlotPorCliente = new Map();   // cliente_id -> "HH:MM" ya anunciado

async function tick() {
  if (new Date().getSeconds() > 20) return;         // solo al comienzo del minuto
  try {
    const { rows } = await query('SELECT cliente_id, cada_min, con_saludo, ciudad, con_clima, zona_horaria, voz FROM anuncio_hora WHERE activo = true');
    for (const cfg of rows) {
      const zona = cfg.zona_horaria || DEFAULT_TZ;
      const { hora, minuto } = partesEnZona(zona);   // hora LOCAL del cliente
      if (minuto % cfg.cada_min !== 0) continue;      // no toca en esta franja
      const slot = `${hora}:${minuto}`;
      if (ultimoSlotPorCliente.get(cfg.cliente_id) === slot) continue;   // ya sonó este minuto
      const cliente = await clienteModel.findById(cfg.cliente_id);
      if (!cliente?.azuracast_station_id || cliente.tipo === 'video' || !cliente.activo) continue;
      ultimoSlotPorCliente.set(cfg.cliente_id, slot);
      // skip:false → NO corta la canción actual; el anuncio suena cuando termina.
      anunciarEn(cliente, { skip: false, saludo: cfg.con_saludo ? 'Atención' : null, ciudad: cfg.ciudad, con_clima: cfg.con_clima, zona, voz: cfg.voz })
        .then((r) => console.log(`[anuncio] ${cliente.nombre_empresa}: ${r.texto || r.error}`))
        .catch((e) => console.error(`[anuncio] ${cliente.nombre_empresa}:`, e.message));
    }
  } catch (e) { console.error('[anuncio] tick:', e.message); }
}

function iniciar() {
  if (timer) return;
  timer = setInterval(() => tick().catch((e) => console.error('[anuncio]', e.message)), 15000);
  console.log('⏰ Anuncio de hora activo (revisa cada 15s las franjas configuradas)');
}

module.exports = { iniciar, verConfig, guardarConfig, anunciarEn, textoHora, generarVoz, climaTexto, programarRetiro, playlistAnuncios };
