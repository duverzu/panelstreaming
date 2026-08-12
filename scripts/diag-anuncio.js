/**
 * scripts/diag-anuncio.js — ¿RECARGAR el backend activa el jingle?
 * Uso (en el VPS del panel):  node scripts/diag-anuncio.js <short_name-o-id>
 *
 * Deja la playlist como jingle con el anuncio, RECARGA Liquidsoap (o restart si
 * no hay reload), y observa hasta ~2 min si el anuncio suena al terminar una
 * canción. AVISO: puede cortar el stream ~2s una vez. Limpia el archivo al final.
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
    paso(1, 'Playlist = jingle cada 1; subir anuncio como único archivo');
    await az.updatePlaylist(stationId, plId, { is_jingle: true, is_enabled: true, play_per_songs: 1 });
    const files = (await az.listMedia(stationId)) || [];
    for (const f of files) if (/anuncio-diag/.test(f.path || '')) await az.deleteMedia(stationId, f.id).catch(() => {});
    const texto = textoHora(new Date(), { saludo: 'Prueba', zona: 'America/Bogota' });
    const mp3 = await generarVoz(texto, { voz: 'femenina' });
    const nombre = `anuncio-diag-${cliente.id}-${Date.now()}.mp3`;
    const media = await az.uploadMedia(stationId, nombre, mp3.toString('base64'));
    await az.setFilePlaylists(stationId, media.id, [plId]);
    L('  ok:', nombre);

    paso(2, 'RECARGAR el backend (reload; si no, restart)');
    let modo = 'reload';
    try { await az.reloadBackend(stationId); L('  reload OK (sin corte)'); }
    catch (e) { L('  reload no disponible:', e.message, '→ probando restart'); modo = 'restart';
      try { await az.restartStation(stationId); L('  restart OK'); } catch (e2) { L('  restart ERROR:', e2.message); } }
    L('  esperando 25s a que el backend vuelva…');
    await sleep(25000);

    paso(3, `Observar ~110s si el anuncio entra al terminar una canción (modo ${modo})`);
    let cuando = -1;
    for (let i = 1; i <= 37; i++) {
      await sleep(3000);
      const np = await az.getNowPlaying(stationId).catch(() => null);
      const ahora = tit(np?.now_playing);
      const sono = ahora.includes('anuncio-diag') || (np?.song_history || []).some((h) => tit(h).includes('anuncio-diag'));
      if (i % 3 === 0 || sono) L(`  +${i * 3}s → "${ahora.slice(0, 40)}"${sono ? '   ✅ ¡SONÓ!' : ''}`);
      if (sono) { cuando = i * 3; break; }
    }

    paso(4, 'Limpieza');
    await az.setFilePlaylists(stationId, media.id, []).catch(() => {});
    await az.deleteMedia(stationId, media.id).catch(() => {});
    L(cuando >= 0 ? `\n  ✅ Tras ${modo}, el jingle SONÓ a los ${cuando}s. Ese es el mecanismo.` : `\n  ❌ Ni con ${modo} sonó en ~110s.`);
  } catch (e) {
    L('\n!! ERROR GENERAL:', e.message);
  }
  L('\n== FIN. Copia TODO esto y pásamelo. ==');
  process.exit(0);
})();
