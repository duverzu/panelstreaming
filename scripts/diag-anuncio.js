/**
 * scripts/diag-anuncio.js — el anuncio como CANCIÓN de rotación con peso ALTO.
 * Uso:  node scripts/diag-anuncio.js <short_name-o-id>
 *
 * Playlist normal (no jingle) peso alto + vaciar la cola no-enviada + skip →
 * la rotación debe elegir el anuncio enseguida (y SÍ es visible al sonar).
 */
require('dotenv').config();
const clienteModel = require('../models/clienteModel');
const azuracast = require('../services/azuracast');
const { generarVoz, textoHora } = require('../services/anuncioHora');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const L = (...a) => console.log(...a);
const paso = (n, t) => L(`\n──── ${n}. ${t} ────`);
const tit = (s) => s?.song?.title || s?.song?.text || '';
const qidDe = (it) => { const m = String(it?.links?.self || '').match(/\/queue\/(\d+)/); return m ? m[1] : null; };

async function buscarCliente(short) {
  let c = await clienteModel.findByShortName(short);
  if (c) return c;
  const { query } = require('../config/database');
  const { rows } = await query(`SELECT id, short_name, nombre_empresa FROM clientes WHERE tipo IS DISTINCT FROM 'video' ORDER BY id`);
  const m = rows.find((r) => String(r.id) === short || (r.short_name || '').toLowerCase() === short.toLowerCase() || (r.nombre_empresa || '').toLowerCase().includes(short.toLowerCase()));
  if (m) return clienteModel.findById(m.id);
  L(`No encontré "${short}".`); return null;
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
    paso(1, 'Playlist NORMAL (no jingle) peso ALTO; subir/asignar anuncio');
    await az.updatePlaylist(stationId, plId, { is_jingle: false, is_enabled: true, include_in_requests: false, include_in_on_demand: false, weight: 25 });
    const files = (await az.listMedia(stationId)) || [];
    for (const f of files) if (/anuncio-diag/.test(f.path || '')) await az.deleteMedia(stationId, f.id).catch(() => {});
    const texto = textoHora(new Date(), { saludo: 'Prueba', zona: 'America/Bogota' });
    const mp3 = await generarVoz(texto, { voz: 'femenina' });
    const nombre = `anuncio-diag-${cliente.id}-${Date.now()}.mp3`;
    const media = await az.uploadMedia(stationId, nombre, mp3.toString('base64'));
    await az.setFilePlaylists(stationId, media.id, [plId]);
    L('  ok:', nombre);
    await sleep(9000);

    paso(2, 'Vaciar la cola no-enviada (para forzar re-armado con el anuncio)');
    const q = await az.getQueue(stationId).catch(() => []);
    for (const it of (Array.isArray(q) ? q : [])) {
      const qid = qidDe(it);
      L(`   "${(tit(it) || '').slice(0, 30)}" sent=${it.sent_to_autodj} qid=${qid}`);
      if (qid && it.sent_to_autodj === false) await az.deleteQueueItem(stationId, qid).catch(() => {});
    }

    paso(3, 'Ver la cola nueva (¿entró el anuncio?)');
    await sleep(2500);
    const q2 = await az.getQueue(stationId).catch(() => []);
    for (const it of (Array.isArray(q2) ? q2 : [])) L(`   → "${(tit(it) || '').slice(0, 34)}"${(tit(it) || '').includes('anuncio-diag') ? '  ⬅ ANUNCIO EN COLA' : ''}`);

    paso(4, 'skip + observar 90s (visible al sonar)');
    await az.skipSong(stationId).catch(() => {});
    let cuando = -1;
    for (let i = 1; i <= 30; i++) {
      await sleep(3000);
      const np = await az.getNowPlaying(stationId).catch(() => null);
      const ahora = tit(np?.now_playing);
      const sono = ahora.includes('anuncio-diag') || (np?.song_history || []).some((h) => tit(h).includes('anuncio-diag'));
      if (i % 3 === 0 || sono) L(`  +${i * 3}s → "${ahora.slice(0, 38)}"${sono ? '   ✅ ¡SONÓ!' : ''}`);
      if (sono) { cuando = i * 3; break; }
    }

    paso(5, 'Limpieza');
    await az.setFilePlaylists(stationId, media.id, []).catch(() => {});
    await az.deleteMedia(stationId, media.id).catch(() => {});
    L(cuando >= 0 ? `\n  ✅ SONÓ a los ${cuando}s (rotación peso alto + vaciar cola). ¡Ese es!` : '\n  ❌ No sonó en 90s.');
  } catch (e) {
    L('\n!! ERROR GENERAL:', e.message);
  }
  L('\n== FIN. Copia TODO esto y pásamelo. ==');
  process.exit(0);
})();
