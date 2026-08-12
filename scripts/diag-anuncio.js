/**
 * scripts/diag-anuncio.js — deja el jingle listo para ESCUCHAR (los jingles no
 * salen en el "ahora suena", así que hay que probar con el oído).
 * Uso:  node scripts/diag-anuncio.js <short_name-o-id>          → prepara y deja sonando
 *       node scripts/diag-anuncio.js <short_name-o-id> limpiar  → quita el anuncio de prueba
 */
require('dotenv').config();
const clienteModel = require('../models/clienteModel');
const azuracast = require('../services/azuracast');
const { generarVoz, textoHora } = require('../services/anuncioHora');

const L = (...a) => console.log(...a);

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

(async () => {
  const arg = process.argv[2] || '';
  const limpiar = (process.argv[3] || '') === 'limpiar';
  const cliente = await buscarCliente(arg);
  if (!cliente) process.exit(1);
  const az = await azuracast.paraServidorId(cliente.servidor_id);
  const stationId = cliente.azuracast_station_id;
  L(`Cliente: ${cliente.nombre_empresa} (id ${cliente.id}) · station ${stationId}`);

  // Borra siempre los anuncios de prueba viejos
  const files = (await az.listMedia(stationId)) || [];
  for (const f of files) if (/anuncio-diag/.test(f.path || '')) await az.deleteMedia(stationId, f.id).catch(() => {});

  if (limpiar) { L('Limpieza hecha: se quitaron los anuncios de prueba.'); process.exit(0); }

  const pls = (await az.getPlaylists(stationId)) || [];
  const pl = pls.find((p) => p.name === '📣 Anuncios');
  const plId = pl?.id || (await az.createPlaylist(stationId, { name: '📣 Anuncios', type: 'default', source: 'songs', is_enabled: true, weight: 1 })).id;
  await az.updatePlaylist(stationId, plId, { is_jingle: true, is_enabled: true, play_per_songs: 1 });

  const texto = textoHora(new Date(), { saludo: 'Prueba prueba', zona: 'America/Bogota' });
  const mp3 = await generarVoz(texto, { voz: 'femenina' });
  const nombre = `anuncio-diag-${cliente.id}-${Date.now()}.mp3`;
  const media = await az.uploadMedia(stationId, nombre, mp3.toString('base64'));
  await az.setFilePlaylists(stationId, media.id, [plId]);

  const np = await az.getNowPlaying(stationId).catch(() => null);
  const url = np?.station?.listen_url || np?.station?.public_player_url || '(revisa el reproductor del panel)';

  L('\n✅ LISTO. El anuncio quedó como jingle (cada 1 canción).');
  L('   Texto:', texto);
  L('\n👂 ESCUCHA TU STREAM AHORA por 2–3 minutos:');
  L('   ', url);
  L('\n   Debe sonar el anuncio ENTRE canciones (al terminar cada tema).');
  L('   Como Liquidsoap tarda ~1–2 min en recargar, dale tiempo.');
  L('\n   Cuando termines, LÍMPIALO con:');
  L(`   node scripts/diag-anuncio.js ${cliente.id} limpiar`);
  process.exit(0);
})();
