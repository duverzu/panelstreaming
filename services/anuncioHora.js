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
function textoHora(fecha, { saludo } = {}) {
  const h = fecha.getHours(); const m = fecha.getMinutes();
  const periodo = h < 12 ? 'de la mañana' : h < 19 ? 'de la tarde' : 'de la noche';
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  const cab = h12 === 1 ? 'Es la una' : `Son las ${HORAS[h12]}`;
  const min = m === 0 ? 'en punto' : m === 15 ? 'y cuarto' : m === 30 ? 'y media' : `y ${minutoTxt(m)}`;
  const base = `${cab} ${min} ${periodo}`.replace(/\s+/g, ' ').trim();
  return saludo ? `${saludo}. ${base}` : base;
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

/** Genera la hora y la pone a sonar en una estación. */
async function anunciarEn(cliente, { skip = true, saludo = null } = {}) {
  const az = await azuracast.paraServidorId(cliente.servidor_id);
  const stationId = cliente.azuracast_station_id;
  if (!stationId) return { ok: false, error: 'sin estación' };

  const texto = textoHora(new Date(), { saludo });
  const mp3 = await generarVoz(texto);
  const nombre = `anuncio-hora-${cliente.id}.mp3`;               // se sobreescribe cada vez

  const media = await az.uploadMedia(stationId, nombre, mp3.toString('base64'));
  const plId = await playlistAnuncios(az, stationId);
  await az.setFilePlaylists(stationId, media.id, [plId]);
  await sleep(2500);                                             // deja que AzuraCast lo indexe
  try { await az.request(stationId, media.unique_id || media.id); } catch (e) { console.error('[anuncio] request:', e.message); }
  if (skip) await az.skipSong(stationId).catch(() => {});
  return { ok: true, texto };
}

// ---- Config (tabla anuncio_hora) ---------------------------------
async function verConfig(clienteId) {
  const { rows } = await query('SELECT cliente_id, activo, cada_min, con_saludo FROM anuncio_hora WHERE cliente_id = $1', [clienteId]);
  return rows[0] || { cliente_id: clienteId, activo: false, cada_min: 60, con_saludo: false };
}
async function guardarConfig(clienteId, { activo, cada_min, con_saludo }) {
  const cada = [15, 30, 60].includes(Number(cada_min)) ? Number(cada_min) : 60;
  await query(
    `INSERT INTO anuncio_hora (cliente_id, activo, cada_min, con_saludo, updated_at)
     VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (cliente_id) DO UPDATE SET activo = $2, cada_min = $3, con_saludo = $4, updated_at = now()`,
    [clienteId, Boolean(activo), cada, Boolean(con_saludo)]
  );
  return verConfig(clienteId);
}

// ---- Planificador -------------------------------------------------
let timer = null;
let ultimoSlot = '';   // evita repetir en el mismo minuto

async function tick() {
  const ahora = new Date();
  if (ahora.getSeconds() > 20) return;              // solo al comienzo del minuto
  const min = ahora.getMinutes();
  const slot = `${ahora.getHours()}:${min}`;
  if (slot === ultimoSlot) return;

  try {
    const { rows } = await query('SELECT cliente_id, cada_min, con_saludo FROM anuncio_hora WHERE activo = true');
    for (const cfg of rows) {
      if (min % cfg.cada_min !== 0) continue;       // no toca en esta franja
      const cliente = await clienteModel.findById(cfg.cliente_id);
      if (!cliente?.azuracast_station_id || cliente.tipo === 'video' || !cliente.activo) continue;
      anunciarEn(cliente, { saludo: cfg.con_saludo ? 'Atención' : null })
        .then((r) => console.log(`[anuncio] ${cliente.nombre_empresa}: ${r.texto || r.error}`))
        .catch((e) => console.error(`[anuncio] ${cliente.nombre_empresa}:`, e.message));
    }
    ultimoSlot = slot;
  } catch (e) { console.error('[anuncio] tick:', e.message); }
}

function iniciar() {
  if (timer) return;
  timer = setInterval(() => tick().catch((e) => console.error('[anuncio]', e.message)), 15000);
  console.log('⏰ Anuncio de hora activo (revisa cada 15s las franjas configuradas)');
}

module.exports = { iniciar, verConfig, guardarConfig, anunciarEn, textoHora };
