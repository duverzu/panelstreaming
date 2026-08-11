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
const { execFile } = require('child_process');
const { query } = require('../config/database');
const clienteModel = require('./../models/clienteModel');
const azuracast = require('./azuracast');
const { partesEnZona, DEFAULT_TZ } = require('./zonaHoraria');

const PLAYLIST = '⏰ Anuncio de hora';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
 * Busca/crea la playlist de anuncios como JINGLE habilitado. El jingle es lo
 * ÚNICO que suena de forma fiable y puntual entre canciones (el "request" a un
 * archivo recién subido no es fiable: tarda en quedar pedible y no suena). Para
 * que NO se repita toda la hora, el anuncio se SACA de la playlist apenas suena
 * una vez (ver retirarTrasSonar). Las playlists viejas quedaron mal: se corrigen.
 */
async function playlistAnuncios(az, stationId) {
  const pls = (await az.getPlaylists(stationId)) || [];
  const existe = pls.find((p) => p.name === PLAYLIST);
  if (existe) {
    if (!existe.is_jingle || !existe.is_enabled) {
      await az.updatePlaylist(stationId, existe.id, { is_jingle: true, is_enabled: true }).catch(() => {});
    }
    return existe.id;
  }
  const pl = await az.createPlaylist(stationId, {
    name: PLAYLIST, type: 'default', source: 'songs',
    is_jingle: true, include_in_requests: false, include_in_on_demand: false, is_enabled: true, weight: 1,
  });
  return pl.id;
}

/**
 * Espera (en segundo plano) a que un archivo suene UNA vez y lo saca de su
 * playlist para que no se repita entre canciones. Detecta que ya sonó mirando
 * el "ahora suena" y el historial reciente. Si no lo detecta, a los ~5 min lo
 * saca igual. `borrarClienteId` además borra los anuncios viejos del cliente.
 */
async function retirarTrasSonar(az, stationId, marcaNombre, mediaNumId, { borrarClienteId = null } = {}) {
  const suena = (s) => String(s?.song?.title || s?.song?.text || '').includes(marcaNombre);
  for (let i = 0; i < 60; i++) {                 // ~60 * 5s = 5 min máx
    await sleep(5000);
    try {
      const np = await az.getNowPlaying(stationId);
      if (suena(np?.now_playing) || (np?.song_history || []).some(suena)) break;
    } catch (_) {}
  }
  if (mediaNumId != null) await az.setFilePlaylists(stationId, mediaNumId, []).catch(() => {});
  if (borrarClienteId) await limpiarViejos(az, stationId, borrarClienteId, mediaNumId);
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

/** Genera la hora y la pone a sonar en una estación. */
async function anunciarEn(cliente, { skip = true, saludo = null, ciudad = null, con_clima = false, zona = null, voz = null } = {}) {
  const az = await azuracast.paraServidorId(cliente.servidor_id);
  const stationId = cliente.azuracast_station_id;
  if (!stationId) return { ok: false, error: 'sin estación' };

  let texto = textoHora(new Date(), { saludo, zona });
  if (con_clima && ciudad) {
    const clima = await climaTexto(ciudad);
    if (clima) texto += `. Ahora mismo ${clima}`;
  }
  const mp3 = await generarVoz(texto, { voz });
  // Nombre ÚNICO cada vez: si se reusa el mismo, AzuraCast puede reproducir la
  // versión vieja (aún sin re-analizar) y decir una hora pasada. Con nombre
  // nuevo, siempre suena el audio fresco.
  const nombre = `anuncio-hora-${cliente.id}-${Date.now()}.mp3`;

  const media = await az.uploadMedia(stationId, nombre, mp3.toString('base64'));
  await limpiarViejos(az, stationId, cliente.id, media.id);      // fuera anuncios viejos ANTES de sonar
  const plId = await playlistAnuncios(az, stationId);            // playlist tipo jingle
  await az.setFilePlaylists(stationId, media.id, [plId]);        // el fresco queda como ÚNICO jingle
  await sleep(4000);                                            // deja que AzuraCast lo procese/recargue
  if (skip) await az.skipSong(stationId).catch(() => {});        // "Probar" → suena de una; programado no corta
  // En segundo plano: cuando suene UNA vez, lo saca de la jingle para que no se
  // repita entre canciones (la causa del "pegado en la misma hora").
  retirarTrasSonar(az, stationId, marca(nombre), media.id, { borrarClienteId: cliente.id })
    .catch((e) => console.error('[anuncio] retiro:', e.message));
  return { ok: true, texto };
}

// ---- Config (tabla anuncio_hora) ---------------------------------
async function verConfig(clienteId) {
  const { rows } = await query('SELECT cliente_id, activo, cada_min, con_saludo, ciudad, con_clima, zona_horaria, voz FROM anuncio_hora WHERE cliente_id = $1', [clienteId]);
  return rows[0] || { cliente_id: clienteId, activo: false, cada_min: 60, con_saludo: false, ciudad: null, con_clima: false, zona_horaria: DEFAULT_TZ, voz: 'masculina' };
}
async function guardarConfig(clienteId, { activo, cada_min, con_saludo, ciudad, con_clima, zona_horaria, voz }) {
  const cada = [15, 30, 60].includes(Number(cada_min)) ? Number(cada_min) : 60;
  const ciu = ciudad !== undefined ? (String(ciudad || '').trim().slice(0, 120) || null) : undefined;
  const zona = (typeof zona_horaria === 'string' && zona_horaria.trim()) ? zona_horaria.trim().slice(0, 64) : null;
  const vz = voz === 'femenina' || voz === 'masculina' ? voz : null;   // null → no cambia
  await query(
    `INSERT INTO anuncio_hora (cliente_id, activo, cada_min, con_saludo, ciudad, con_clima, zona_horaria, voz, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6, COALESCE($7,'America/Bogota'), COALESCE($8,'masculina'), now())
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

module.exports = { iniciar, verConfig, guardarConfig, anunciarEn, textoHora, generarVoz, climaTexto, retirarTrasSonar };
