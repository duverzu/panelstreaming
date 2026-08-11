/**
 * scripts/diag-anuncio.js — diagnóstico del anuncio de hora en una estación.
 * Uso (en el VPS del panel):  node scripts/diag-anuncio.js <short_name>
 * Ej:  node scripts/diag-anuncio.js laemistereo
 *
 * Hace TODO el flujo paso a paso e imprime qué responde AzuraCast en cada punto,
 * para ver por qué no suena. No deja basura: borra el archivo de prueba al final.
 */
require('dotenv').config();
const clienteModel = require('../models/clienteModel');
const azuracast = require('../services/azuracast');
const { generarVoz, textoHora } = require('../services/anuncioHora');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const L = (...a) => console.log(...a);
const paso = (n, t) => L(`\n──── ${n}. ${t} ────`);

function titulos(np) {
  const t = (s) => s?.song?.title || s?.song?.text || '(sin título)';
  return {
    ahora: np?.now_playing ? t(np.now_playing) : '(nada)',
    online: np?.is_online,
    historial: (np?.song_history || []).slice(0, 4).map(t),
  };
}

(async () => {
  const short = process.argv[2];
  if (!short) { L('Falta el short_name. Uso: node scripts/diag-anuncio.js <short_name>'); process.exit(1); }

  const cliente = await clienteModel.findByShortName(short);
  if (!cliente) { L(`No encontré cliente con short_name="${short}"`); process.exit(1); }
  L(`Cliente: ${cliente.nombre_empresa} (id ${cliente.id}) · servidor_id ${cliente.servidor_id} · station ${cliente.azuracast_station_id}`);

  const az = await azuracast.paraServidorId(cliente.servidor_id);
  const stationId = cliente.azuracast_station_id;
  if (!stationId) { L('El cliente no tiene azuracast_station_id.'); process.exit(1); }

  try {
    paso(1, 'Estado de la estación (¿está al aire? ¿requests activos?)');
    const st = await az.getStation(stationId).catch((e) => { L('  getStation ERROR:', e.message); return null; });
    if (st) L('  enable_requests:', st.enable_requests, '· backend:', st.backend_type, '· timezone:', st.timezone);
    const status = await az.getStationStatus(stationId).catch((e) => { L('  getStationStatus ERROR:', e.message); return null; });
    if (status) L('  backend_running:', status.backend_running, '· frontend_running:', status.frontend_running);
    const np0 = await az.getNowPlaying(stationId).catch((e) => { L('  getNowPlaying ERROR:', e.message); return null; });
    if (np0) L('  ahora suena:', JSON.stringify(titulos(np0)));

    paso(2, 'Playlist "📣 Anuncios" (config actual)');
    const pls = (await az.getPlaylists(stationId)) || [];
    const pl = pls.find((p) => p.name === '📣 Anuncios');
    if (pl) L('  ', JSON.stringify({ id: pl.id, is_jingle: pl.is_jingle, is_enabled: pl.is_enabled, include_in_requests: pl.include_in_requests, play_per_songs: pl.play_per_songs, num_of_songs: pl.num_songs }));
    else L('  (todavía no existe; se creará al generar)');

    paso(3, 'Generar voz + subir archivo');
    const texto = textoHora(new Date(), { saludo: 'Prueba', zona: 'America/Bogota' });
    L('  texto:', texto);
    const mp3 = await generarVoz(texto, { voz: 'femenina' });
    L('  mp3 bytes:', mp3.length);
    const nombre = `anuncio-diag-${cliente.id}-${Date.now()}.mp3`;
    const media = await az.uploadMedia(stationId, nombre, mp3.toString('base64'));
    L('  media:', JSON.stringify({ id: media.id, unique_id: media.unique_id, path: media.path, length: media.length }));

    paso(4, 'Asegurar playlist como JINGLE y asignar el archivo');
    let plId = pl?.id;
    if (!plId) {
      const nuevo = await az.createPlaylist(stationId, { name: '📣 Anuncios', type: 'default', source: 'songs', is_jingle: true, is_enabled: true, weight: 1 });
      plId = nuevo.id; L('  creada playlist id', plId);
    } else {
      await az.updatePlaylist(stationId, plId, { is_jingle: true, is_enabled: true });
      L('  playlist forzada a jingle+enabled');
    }
    await az.setFilePlaylists(stationId, media.id, [plId]);
    L('  archivo asignado a la jingle');

    paso(5, 'Esperar 6s (procesado/recarga) y PEDIR (request)');
    await sleep(6000);
    let reqOk = false;
    try { const r = await az.request(stationId, media.unique_id || media.id); reqOk = true; L('  request OK:', JSON.stringify(r).slice(0, 200)); }
    catch (e) { L('  request ERROR:', e.message); }

    paso(6, 'skip (saltar canción actual) y observar 12s');
    await az.skipSong(stationId).catch((e) => L('  skip ERROR:', e.message));
    for (let i = 1; i <= 4; i++) {
      await sleep(3000);
      const np = await az.getNowPlaying(stationId).catch(() => null);
      L(`  +${i * 3}s →`, JSON.stringify(titulos(np)));
    }

    paso(7, 'Limpieza (borrar archivo de prueba)');
    await az.setFilePlaylists(stationId, media.id, []).catch(() => {});
    await az.deleteMedia(stationId, media.id).catch((e) => L('  deleteMedia ERROR:', e.message));
    L('  listo. request funcionó:', reqOk);

    L('\n== FIN. Copia TODO esto y pásamelo. ==');
  } catch (e) {
    L('\n!! ERROR GENERAL:', e.message);
  }
  process.exit(0);
})();
