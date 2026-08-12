/**
 * scripts/diag-anuncio.js — limpia todo y dispara UN anuncio real para escuchar.
 * Uso:  node scripts/diag-anuncio.js <id> [masculina|femenina]
 *       node scripts/diag-anuncio.js <id> limpiar
 */
require('dotenv').config();
const clienteModel = require('../models/clienteModel');
const azuracast = require('../services/azuracast');
const anuncioHora = require('../services/anuncioHora');

const L = (...a) => console.log(...a);

async function buscarCliente(short) {
  let c = await clienteModel.findByShortName(short);
  if (c) return c;
  const { query } = require('../config/database');
  const { rows } = await query(`SELECT id, short_name, nombre_empresa FROM clientes WHERE tipo IS DISTINCT FROM 'video' ORDER BY id`);
  const m = rows.find((r) => String(r.id) === short);
  return m ? clienteModel.findById(m.id) : null;
}

(async () => {
  const cliente = await buscarCliente(process.argv[2] || '');
  if (!cliente) { L('No encontré el cliente.'); process.exit(1); }
  const arg2 = process.argv[3] || 'femenina';
  const az = await azuracast.paraServidorId(cliente.servidor_id);
  const stationId = cliente.azuracast_station_id;
  L(`Cliente: ${cliente.nombre_empresa} (id ${cliente.id}) · station ${stationId}`);

  // 1) Limpiar TODO archivo de anuncio/cuña de prueba y de producción, y la playlist
  const files = (await az.listMedia(stationId)) || [];
  let borrados = 0;
  for (const f of files) if (/(anuncio-diag|anuncio-hora|cuna-)/.test(f.path || '')) { await az.deleteMedia(stationId, f.id).catch(() => {}); borrados++; }
  L(`Borrados ${borrados} archivos de anuncio/cuña viejos.`);
  if (arg2 === 'limpiar') { L('Solo limpieza. Listo.'); process.exit(0); }

  // 2) Disparar el anuncio REAL (mismo camino que producción)
  const voz = arg2 === 'masculina' ? 'masculina' : 'femenina';
  L(`\nGenerando anuncio real con voz: ${voz} …`);
  const r = await anuncioHora.anunciarEn(cliente, { skip: false, saludo: 'Atención', zona: 'America/Bogota', voz });
  if (!r.ok) { L('ERROR:', r.error); process.exit(1); }

  const np = await az.getNowPlaying(stationId).catch(() => null);
  const url = np?.station?.listen_url || '(reproductor del panel)';
  L('\n✅ Anuncio en rotación. DEBE decir exactamente:');
  L(`   «${r.texto}»`);
  L('\n👂 ESCUCHA tu stream 1-2 minutos:');
  L('   ', url);
  L('\n   Dime EXACTO qué palabras oyes (o si solo suena música).');
  L('   Debe sonar UNA vez y no repetirse.');
  process.exit(0);
})();
