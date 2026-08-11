/**
 * scripts/diag-anuncio.js — hacer sonar el anuncio YA vía request + limpiar cola.
 * Uso (en el VPS del panel):  node scripts/diag-anuncio.js <short_name-o-id>
 *
 * Activa pedidos, sube el anuncio, lo pide, MUESTRA la cola por dentro, borra
 * los ítems que están delante (ítem por ítem), salta y observa si suena.
 * Limpia el archivo de prueba al final.
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

async function observar(az, stationId, marca, segs) {
  for (let i = 1; i <= segs / 3; i++) {
    await sleep(3000);
    const np = await az.getNowPlaying(stationId).catch(() => null);
    const ahora = np?.now_playing ? tit(np.now_playing) : '';
    const sono = ahora.includes(marca) || (np?.song_history || []).some((h) => tit(h).includes(marca));
    L(`  +${i * 3}s → ahora: "${ahora.slice(0, 45)}"${sono ? '   ✅ ¡SONÓ!' : ''}`);
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

  try {
    paso(1, 'Activar pedidos + playlist requestable + subir anuncio');
    await az.updateStation(stationId, { enable_requests: true, request_delay: 0, request_threshold_seconds: 0 }).catch((e) => L('  updateStation:', e.message));
    await az.updatePlaylist(stationId, plId, { is_jingle: false, is_enabled: true, include_in_requests: true, include_in_on_demand: true });
    const texto = textoHora(new Date(), { saludo: 'Prueba', zona: 'America/Bogota' });
    const mp3 = await generarVoz(texto, { voz: 'femenina' });
    const nombre = `anuncio-diag-${cliente.id}-${Date.now()}.mp3`;
    const marca = nombre.replace(/\.[^.]+$/, '');
    const media = await az.uploadMedia(stationId, nombre, mp3.toString('base64'));
    await az.setFilePlaylists(stationId, media.id, [plId]);
    L('  subido y asignado:', marca);
    await sleep(8000);

    paso(2, 'PEDIR (request)');
    try { const r = await az.request(stationId, media.unique_id || media.id); L('  request:', r?.message || 'ok'); }
    catch (e) { L('  request ERROR:', e.message); }

    paso(3, 'Ver la COLA por dentro (dónde cayó el anuncio)');
    let q = await az.getQueue(stationId).catch((e) => { L('  getQueue ERROR:', e.message); return []; });
    if (!Array.isArray(q)) { L('  (respuesta cruda):', JSON.stringify(q).slice(0, 300)); q = []; }
    L('  ítems en cola:', q.length);
    q.forEach((it, i) => L(`   [${i}] id=${it.id ?? it.sh_id ?? '?'} · "${(tit(it) || it.title || '').slice(0, 40)}" · is_request=${it.is_request}`));

    paso(4, 'Borrar de la cola los ítems que NO son el anuncio (ítem por ítem)');
    let borrados = 0;
    for (const it of q) {
      const esAnuncio = (tit(it) || it.title || '').includes('anuncio-diag');
      const qid = it.id ?? it.sh_id;
      if (!esAnuncio && qid != null) {
        try { await az.deleteQueueItem(stationId, qid); borrados++; }
        catch (e) { L(`   no pude borrar id=${qid}:`, e.message); }
      }
    }
    L('  borrados de la cola:', borrados);

    paso(5, 'skip + observar 40s');
    await az.skipSong(stationId).catch((e) => L('  skip ERROR:', e.message));
    const cuando = await observar(az, stationId, 'anuncio-diag', 40);

    paso(6, 'Limpieza');
    await az.setFilePlaylists(stationId, media.id, []).catch(() => {});
    await az.deleteMedia(stationId, media.id).catch(() => {});
    L(cuando >= 0 ? `\n  ✅ RESULTADO: el anuncio SONÓ a los ${cuando}s con request+borrar-cola.` : '\n  ❌ RESULTADO: no sonó en 40s.');
  } catch (e) {
    L('\n!! ERROR GENERAL:', e.message);
  }
  L('\n== FIN. Copia TODO esto y pásamelo. ==');
  process.exit(0);
})();
