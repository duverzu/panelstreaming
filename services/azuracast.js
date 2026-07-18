/**
 * services/azuracast.js
 * ------------------------------------------------------------------
 * Único punto de contacto con la API de AzuraCast.
 * La API Key vive SOLO aquí (backend) vía variables de entorno.
 * El frontend jamás la conoce.
 *
 * Docs API: https://<tu-azuracast>/api/docs
 * ------------------------------------------------------------------
 */

const axios = require('axios');

// Cliente axios preconfigurado con la base URL y la API key.
const api = axios.create({
  baseURL: `${process.env.AZURACAST_BASE_URL}/api`,
  timeout: 15000,
  headers: {
    Authorization: `Bearer ${process.env.AZURACAST_API_KEY}`,
    Accept: 'application/json',
  },
});

/** Normaliza errores de axios a algo legible para nuestras rutas. */
function handleError(context, err) {
  const status = err.response?.status;
  const detail = err.response?.data?.message || err.message;
  const msg = `[AzuraCast] ${context} falló${status ? ` (HTTP ${status})` : ''}: ${detail}`;
  const error = new Error(msg);
  error.status = status || 502;
  throw error;
}

/**
 * Detalles de una estación.
 * GET /api/station/{id}
 */
async function getStation(stationId) {
  try {
    const { data } = await api.get(`/station/${stationId}`);
    return data;
  } catch (err) {
    handleError(`getStation(${stationId})`, err);
  }
}

/**
 * Info "en vivo": canción actual, oyentes, historial.
 * GET /api/nowplaying/{id}
 */
async function getNowPlaying(stationId) {
  try {
    const { data } = await api.get(`/nowplaying/${stationId}`);
    return data;
  } catch (err) {
    handleError(`getNowPlaying(${stationId})`, err);
  }
}

/**
 * Crea una nueva estación en AzuraCast.
 * POST /api/admin/stations
 * @param {string} nombre
 * @param {string} descripcion
 */
async function createStation(nombre, descripcion = '') {
  try {
    const { data } = await api.post('/admin/stations', {
      name: nombre,
      description: descripcion,
      // Se pueden añadir más campos: genre, url, enable_public_page, etc.
    });
    return data;
  } catch (err) {
    handleError(`createStation(${nombre})`, err);
  }
}

/**
 * Elimina una estación.
 * DELETE /api/admin/station/{id}
 */
async function deleteStation(stationId) {
  try {
    const { data } = await api.delete(`/admin/station/${stationId}`);
    return data;
  } catch (err) {
    handleError(`deleteStation(${stationId})`, err);
  }
}

/**
 * Lista los archivos de media de una estación.
 * GET /api/station/{id}/files
 */
async function listMedia(stationId) {
  try {
    const { data } = await api.get(`/station/${stationId}/files`);
    return data;
  } catch (err) {
    handleError(`listMedia(${stationId})`, err);
  }
}

module.exports = {
  api, // exportado por si se necesita una llamada puntual
  getStation,
  getNowPlaying,
  createStation,
  deleteStation,
  listMedia,
};
