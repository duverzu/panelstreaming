/**
 * services/biblioteca.js
 * ------------------------------------------------------------------
 * Biblioteca de música de cortesía (tracks libres de derechos).
 * Los MP3 viven en la carpeta /biblioteca del servidor. Al crear una
 * radio (o con un botón), se copian a la estación en una playlist
 * "Biblioteca" para que suene de inmediato sin que el cliente suba nada.
 *
 * ⚠️ Usa SOLO música CC0 / dominio público / con licencia comercial.
 * ------------------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');
const azuracast = require('./azuracast');

const DIR = path.join(__dirname, '..', 'biblioteca');

/** Lista los .mp3 disponibles en la carpeta de biblioteca. */
function listarTracks() {
  try {
    return fs.readdirSync(DIR).filter((f) => /\.mp3$/i.test(f));
  } catch {
    return [];
  }
}

/**
 * Copia todos los tracks de la biblioteca a una estación,
 * dentro de una playlist "Biblioteca".
 * @param az cliente AzuraCast del servidor de esa estación (por defecto el del .env)
 * @returns {{ copiados: number, total: number }}
 */
async function copiarAEstacion(stationId, az = azuracast) {
  const tracks = listarTracks();
  if (!tracks.length) return { copiados: 0, total: 0 };

  // Crear/encontrar la playlist "Biblioteca"
  let playlist;
  try {
    const existentes = await az.getPlaylists(stationId);
    playlist = existentes.find((p) => p.name === 'Biblioteca');
    if (!playlist) playlist = await az.createPlaylist(stationId, { name: 'Biblioteca', is_enabled: true });
  } catch (err) {
    console.error('[biblioteca] no se pudo preparar la playlist:', err.message);
    return { copiados: 0, total: tracks.length };
  }

  let copiados = 0;
  for (const nombre of tracks) {
    try {
      const base64 = fs.readFileSync(path.join(DIR, nombre)).toString('base64');
      const media = await az.uploadMedia(stationId, nombre, base64);
      await az.setFilePlaylists(stationId, media.id, [playlist.id]);
      copiados++;
    } catch (err) {
      console.error(`[biblioteca] falló "${nombre}":`, err.message);
    }
  }
  return { copiados, total: tracks.length };
}

module.exports = { listarTracks, copiarAEstacion, DIR };
