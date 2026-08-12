/**
 * scripts/activar-jingles.js — deja las playlists de anuncios y cuñas como JINGLE
 * y REINICIA la estación una vez para activarlas (los jingles solo toman efecto
 * tras un rebuild de config). Después, el "da la hora" y las cuñas suenan puntual.
 *
 * Uso:  node scripts/activar-jingles.js <id-o-nombre>   → una estación
 *       node scripts/activar-jingles.js --todos          → todas las de audio
 * AVISO: reinicia cada estación (corta el stream ~5-10s, una sola vez).
 */
require('dotenv').config();
const { query } = require('../config/database');
const clienteModel = require('../models/clienteModel');
const azuracast = require('../services/azuracast');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const L = (...a) => console.log(...a);

async function jingle(az, stationId, nombre) {
  const pls = (await az.getPlaylists(stationId)) || [];
  const ex = pls.find((p) => p.name === nombre);
  if (ex) { await az.updatePlaylist(stationId, ex.id, { is_jingle: true, is_enabled: true, play_per_songs: 1, include_in_requests: false }).catch((e) => L('   upd', nombre, e.message)); return ex.id; }
  const pl = await az.createPlaylist(stationId, { name: nombre, type: 'default', source: 'songs', is_jingle: true, is_enabled: true, play_per_songs: 1, include_in_requests: false, include_in_on_demand: false, weight: 1 });
  return pl.id;
}

async function activar(cliente) {
  if (!cliente.azuracast_station_id) { L(`- ${cliente.nombre_empresa}: sin estación, saltada`); return; }
  const az = await azuracast.paraServidorId(cliente.servidor_id);
  const st = cliente.azuracast_station_id;
  L(`• ${cliente.nombre_empresa} (station ${st})`);
  await jingle(az, st, '📣 Anuncios');
  await jingle(az, st, '📣 Cuñas');
  L('   playlists jingle listas; reiniciando…');
  try { await az.restartStation(st); L('   restart OK'); } catch (e) { L('   restart ERROR:', e.message); }
  await sleep(20000);
}

(async () => {
  const arg = process.argv[2] || '';
  let objetivos = [];
  if (arg === '--todos') {
    const { rows } = await query(`SELECT id FROM clientes WHERE tipo IS DISTINCT FROM 'video' AND azuracast_station_id IS NOT NULL ORDER BY id`);
    for (const r of rows) objetivos.push(await clienteModel.findById(r.id));
  } else if (arg) {
    let c = /^\d+$/.test(arg) ? await clienteModel.findById(Number(arg)) : null;
    if (!c) { const { rows } = await query(`SELECT id, short_name, nombre_empresa FROM clientes WHERE tipo IS DISTINCT FROM 'video' ORDER BY id`); const m = rows.find((r) => (r.short_name || '').toLowerCase().includes(arg.toLowerCase()) || (r.nombre_empresa || '').toLowerCase().includes(arg.toLowerCase())); if (m) c = await clienteModel.findById(m.id); }
    if (!c) { L(`No encontré "${arg}".`); process.exit(1); }
    objetivos = [c];
  } else { L('Uso: node scripts/activar-jingles.js <id-o-nombre> | --todos'); process.exit(1); }

  for (const c of objetivos) if (c) await activar(c);
  L('\n✅ Listo. Ahora el anuncio de hora y las cuñas suenan como jingle (puntual, una vez).');
  process.exit(0);
})();
