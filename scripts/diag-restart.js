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

(async () => {
  const cliente = await clienteModel.findById(Number(process.argv[2] || 0));
  if (!cliente) { L('Uso: node scripts/diag-restart.js <id-cliente>'); process.exit(1); }
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
