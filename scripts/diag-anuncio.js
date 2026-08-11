/**
 * scripts/diag-anuncio.js — encontrar la forma FIABLE de que el anuncio suene ya.
 * Uso (en el VPS del panel):  node scripts/diag-anuncio.js <short_name-o-id>
 *
 * Prueba dos métodos y dice cuál hace sonar el anuncio de una:
 *   A) JINGLE (la playlist ya existe/está cargada).
 *   B) REQUEST + vaciar la cola preparada + skip.
 * Limpia los archivos de prueba al final.
 */
require('dotenv').config();
const clienteModel = require('../models/clienteModel');
const azuracast = require('../services/azuracast');
const { generarVoz, textoHora } = require('../services/anuncioHora');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const L = (...a) => console.log(...a);
const paso = (n, t) => L(`\n──── ${n}. ${t} ────`);
const tit = (s) => s?.song?.title || s?.song?.text || '';

async function buscarCliente(short) {
  let c = await clienteModel.findByShortName(short);
  if (c) return c;
  const { query } = require('../config/database');
  const { rows } = await query(`SELECT id, short_name, nombre_empresa FROM clientes WHERE tipo IS DISTINCT FROM 'video' ORDER BY id`);
  const m = rows.find((r) => String(r.id) === short || (r.short_name || '').toLowerCase() === short.toLowerCase() || (r.nombre_empresa || '').toLowerCase().includes(short.toLowerCase()));
  if (m) return clienteModel.findById(m.id);
  L(`No encontré "${short}". Disponibles:`); for (const r of rows) L(`  id ${r.id} · ${r.short_name} · ${r.nombre_empresa}`);
  return null;
}

/** Sube un anuncio fresco y devuelve {media, nombre, marca}. */
async function subirAnuncio(az, stationId, clienteId, etiqueta) {
  const texto = textoHora(new Date(), { saludo: 'Prueba', zona: 'America/Bogota' });
  const mp3 = await generarVoz(texto, { voz: 'femenina' });
  const nombre = `anuncio-diag-${etiqueta}-${clienteId}-${Date.now()}.mp3`;
  const media = await az.uploadMedia(stationId, nombre, mp3.toString('base64'));
  return { media, marca: nombre.replace(/\.[^.]+$/, ''), texto };
}

/** Observa el "ahora suena" y dice en qué segundo aparece la marca (o -1). */
async function observar(az, stationId, marca, segs) {
  for (let i = 1; i <= segs / 3; i++) {
    await sleep(3000);
    const np = await az.getNowPlaying(stationId).catch(() => null);
    const ahora = np?.now_playing ? tit(np.now_playing) : '';
    const sono = ahora.includes(marca) || (np?.song_history || []).some((h) => tit(h).includes(marca));
    L(`  +${i * 3}s → ahora: "${ahora.slice(0, 40)}"${sono ? '   ✅ ¡SONÓ EL ANUNCIO!' : ''}`);
    if (sono) return i * 3;
  }
  return -1;
}

(async () => {
  const cliente = await buscarCliente(process.argv[2] || '');
  if (!cliente) process.exit(1);
  const az = await azuracast.paraServidorId(cliente.servidor_id);
  const stationId = cliente.azuracast_station_id;
  L(`Cliente: ${cliente.nombre_empresa} (id ${cliente.id}) · station ${stationId}`);

  const pls = (await az.getPlaylists(stationId)) || [];
  const pl = pls.find((p) => p.name === '📣 Anuncios');
  const plId = pl?.id || (await az.createPlaylist(stationId, { name: '📣 Anuncios', type: 'default', source: 'songs', is_enabled: true, weight: 1 })).id;

  let ganadorA = -1, ganadorB = -1;
  try {
    // ---------- MÉTODO A: JINGLE ----------
    paso('A', 'JINGLE — playlist como jingle, asignar anuncio, skip, observar 30s');
    await az.updatePlaylist(stationId, plId, { is_jingle: true, is_enabled: true, include_in_requests: false });
    const a = await subirAnuncio(az, stationId, cliente.id, 'A');
    L('  subido:', a.marca);
    await az.setFilePlaylists(stationId, a.media.id, [plId]);
    await sleep(5000);
    await az.skipSong(stationId).catch(() => {});
    ganadorA = await observar(az, stationId, 'anuncio-diag-A', 30);
    await az.setFilePlaylists(stationId, a.media.id, []).catch(() => {});
    await az.deleteMedia(stationId, a.media.id).catch(() => {});

    // ---------- MÉTODO B: REQUEST + vaciar cola ----------
    paso('B', 'REQUEST — activar pedidos, requestable, pedir, VACIAR cola, skip, observar 30s');
    await az.updateStation(stationId, { enable_requests: true, request_delay: 0, request_threshold_seconds: 0 }).catch((e) => L('  updateStation:', e.message));
    await az.updatePlaylist(stationId, plId, { is_jingle: false, is_enabled: true, include_in_requests: true, include_in_on_demand: true });
    const b = await subirAnuncio(az, stationId, cliente.id, 'B');
    L('  subido:', b.marca);
    await az.setFilePlaylists(stationId, b.media.id, [plId]);
    await sleep(8000);
    try { const r = await az.request(stationId, b.media.unique_id || b.media.id); L('  request:', r?.message || 'ok'); }
    catch (e) { L('  request ERROR:', e.message); }
    try { const q = await az.getQueue(stationId); L('  cola preparada:', Array.isArray(q) ? q.length : q); await az.clearQueue(stationId); L('  cola vaciada'); }
    catch (e) { L('  cola ERROR:', e.message); }
    await az.skipSong(stationId).catch(() => {});
    ganadorB = await observar(az, stationId, 'anuncio-diag-B', 30);
    await az.setFilePlaylists(stationId, b.media.id, []).catch(() => {});
    await az.deleteMedia(stationId, b.media.id).catch(() => {});

    paso('RESULTADO', '¿cuál sonó?');
    L(`  MÉTODO A (jingle):  ${ganadorA >= 0 ? `✅ sonó a los ${ganadorA}s` : '❌ no sonó en 30s'}`);
    L(`  MÉTODO B (request+vaciar cola):  ${ganadorB >= 0 ? `✅ sonó a los ${ganadorB}s` : '❌ no sonó en 30s'}`);
  } catch (e) {
    L('\n!! ERROR GENERAL:', e.message);
  }
  L('\n== FIN. Copia TODO esto y pásamelo. ==');
  process.exit(0);
})();
