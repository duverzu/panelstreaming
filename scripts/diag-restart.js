/**
 * scripts/diag-restart.js — reinicia una estación (rebuild de config de Liquidsoap)
 * para comprobar si así se ACTIVAN los jingles.
 * Uso:  node scripts/diag-restart.js <id-cliente>
 * AVISO: corta el stream ~5-10s una vez.
 */
require('dotenv').config();
const clienteModel = require('../models/clienteModel');
const azuracast = require('../services/azuracast');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const L = (...a) => console.log(...a);

async function buscar(short) {
  if (/^\d+$/.test(short)) { const c = await clienteModel.findById(Number(short)); if (c) return c; }
  const { query } = require('../config/database');
  const { rows } = await query(`SELECT id, short_name, nombre_empresa FROM clientes WHERE tipo IS DISTINCT FROM 'video' ORDER BY id`);
  const m = rows.find((r) => (r.short_name || '').toLowerCase().includes(short.toLowerCase()) || (r.nombre_empresa || '').toLowerCase().includes(short.toLowerCase()));
  if (m) return clienteModel.findById(m.id);
  L(`No encontré "${short}". Disponibles:`); for (const r of rows) L(`  id ${r.id} · ${r.short_name} · ${r.nombre_empresa}`);
  return null;
}

(async () => {
  const cliente = await buscar(process.argv[2] || '');
  if (!cliente) process.exit(1);
  const az = await azuracast.paraServidorId(cliente.servidor_id);
  const stationId = cliente.azuracast_station_id;
  L(`Reiniciando: ${cliente.nombre_empresa} (station ${stationId})…`);
  try { await az.restartStation(stationId); L('  restart OK'); } catch (e) { L('  ERROR:', e.message); process.exit(1); }
  await sleep(30000);
  const np = await az.getNowPlaying(stationId).catch(() => null);
  L('  volvió. Ahora suena:', np?.now_playing?.song?.title || '(?)');
  L('  URL:', np?.station?.listen_url || '(reproductor del panel)');
  L('\n👂 Ahora ESCUCHA: si tu playlist de jingles empieza a sonar entre canciones,');
  L('   entonces el jingle SÍ funciona tras un rebuild. Dime qué pasa.');
  process.exit(0);
})();
