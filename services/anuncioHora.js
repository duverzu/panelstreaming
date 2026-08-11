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
async function generarVoz(texto) {
  const cmd = process.env.ANUNCIO_TTS_CMD;   // ej: comando que recibe el texto por args y devuelve mp3 por stdout
  if (cmd) {
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
/** Busca/crea la playlist de anuncios (requestable + jingle). Devuelve su id. */
async function playlistAnuncios(az, stationId) {
  const pls = (await az.getPlaylists(stationId)) || [];
  const existe = pls.find((p) => p.name === PLAYLIST);
  if (existe) return existe.id;
  const pl = await az.createPlaylist(stationId, {
    name: PLAYLIST, type: 'default', source: 'songs',
    is_jingle: true, include_in_requests: true, include_in_on_demand: false, is_enabled: true, weight: 1,
  });
  return pl.id;
}

const ultimoAnuncioMedia = new Map();   // cliente_id -> media.id del último anuncio (para borrarlo)

/** Genera la hora y la pone a sonar en una estación. */
async function anunciarEn(cliente, { skip = true, saludo = null, ciudad = null, con_clima = false, zona = null } = {}) {
  const az = await azuracast.paraServidorId(cliente.servidor_id);
  const stationId = cliente.azuracast_station_id;
  if (!stationId) return { ok: false, error: 'sin estación' };

  let texto = textoHora(new Date(), { saludo, zona });
  if (con_clima && ciudad) {
    const clima = await climaTexto(ciudad);
    if (clima) texto += `. Ahora mismo ${clima}`;
  }
  const mp3 = await generarVoz(texto);
  // Nombre ÚNICO cada vez: si se reusa el mismo, AzuraCast puede reproducir la
  // versión vieja (aún sin re-analizar) y decir una hora pasada. Con nombre
  // nuevo, siempre suena el audio fresco.
  const nombre = `anuncio-hora-${cliente.id}-${Date.now()}.mp3`;

  const media = await az.uploadMedia(stationId, nombre, mp3.toString('base64'));
  const plId = await playlistAnuncios(az, stationId);
  await az.setFilePlaylists(stationId, media.id, [plId]);
  await sleep(2500);                                             // deja que AzuraCast lo indexe
  try { await az.request(stationId, media.unique_id || media.id); } catch (e) { console.error('[anuncio] request:', e.message); }
  if (skip) await az.skipSong(stationId).catch(() => {});
  // Borra el anuncio ANTERIOR de este cliente (no acumular archivos en disco)
  const previo = ultimoAnuncioMedia.get(cliente.id);
  if (previo && previo !== media.id) az.deleteMedia(stationId, previo).catch(() => {});
  ultimoAnuncioMedia.set(cliente.id, media.id);
  return { ok: true, texto };
}

// ---- Config (tabla anuncio_hora) ---------------------------------
async function verConfig(clienteId) {
  const { rows } = await query('SELECT cliente_id, activo, cada_min, con_saludo, ciudad, con_clima, zona_horaria FROM anuncio_hora WHERE cliente_id = $1', [clienteId]);
  return rows[0] || { cliente_id: clienteId, activo: false, cada_min: 60, con_saludo: false, ciudad: null, con_clima: false, zona_horaria: DEFAULT_TZ };
}
async function guardarConfig(clienteId, { activo, cada_min, con_saludo, ciudad, con_clima, zona_horaria }) {
  const cada = [15, 30, 60].includes(Number(cada_min)) ? Number(cada_min) : 60;
  const ciu = ciudad !== undefined ? (String(ciudad || '').trim().slice(0, 120) || null) : undefined;
  const zona = (typeof zona_horaria === 'string' && zona_horaria.trim()) ? zona_horaria.trim().slice(0, 64) : null;
  await query(
    `INSERT INTO anuncio_hora (cliente_id, activo, cada_min, con_saludo, ciudad, con_clima, zona_horaria, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6, COALESCE($7,'America/Bogota'), now())
     ON CONFLICT (cliente_id) DO UPDATE SET
       activo = $2, cada_min = $3, con_saludo = $4,
       ciudad = COALESCE($5, anuncio_hora.ciudad), con_clima = $6,
       zona_horaria = COALESCE($7, anuncio_hora.zona_horaria), updated_at = now()`,
    [clienteId, Boolean(activo), cada, Boolean(con_saludo), ciu ?? null, Boolean(con_clima), zona]
  );
  return verConfig(clienteId);
}

// ---- Planificador -------------------------------------------------
let timer = null;
const ultimoSlotPorCliente = new Map();   // cliente_id -> "HH:MM" ya anunciado

async function tick() {
  if (new Date().getSeconds() > 20) return;         // solo al comienzo del minuto
  try {
    const { rows } = await query('SELECT cliente_id, cada_min, con_saludo, ciudad, con_clima, zona_horaria FROM anuncio_hora WHERE activo = true');
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
      anunciarEn(cliente, { skip: false, saludo: cfg.con_saludo ? 'Atención' : null, ciudad: cfg.ciudad, con_clima: cfg.con_clima, zona })
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

module.exports = { iniciar, verConfig, guardarConfig, anunciarEn, textoHora, generarVoz, climaTexto };
