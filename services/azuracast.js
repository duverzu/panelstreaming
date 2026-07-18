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
 * Actualiza ajustes de una estación (aplicar límites del plan).
 * PUT /api/admin/station/{id}
 */
async function updateStation(stationId, fields) {
  try {
    const { data } = await api.put(`/admin/station/${stationId}`, fields);
    return data;
  } catch (err) {
    handleError(`updateStation(${stationId})`, err);
  }
}

/**
 * Lista los mounts de una estación.
 * GET /api/station/{id}/mounts
 */
async function getMounts(stationId) {
  try {
    const { data } = await api.get(`/station/${stationId}/mounts`);
    return data;
  } catch (err) {
    handleError(`getMounts(${stationId})`, err);
  }
}

/**
 * Crea un punto de montaje (mount) en una estación.
 * POST /api/station/{id}/mounts
 */
async function createMount(stationId, opts) {
  try {
    const { data } = await api.post(`/station/${stationId}/mounts`, opts);
    return data;
  } catch (err) {
    handleError(`createMount(${stationId})`, err);
  }
}

/**
 * Actualiza un mount existente (ej. bitrate del AutoDJ).
 * PUT /api/station/{id}/mount/{mountId}
 */
async function updateMount(stationId, mountId, fields) {
  try {
    const { data } = await api.put(`/station/${stationId}/mount/${mountId}`, fields);
    return data;
  } catch (err) {
    handleError(`updateMount(${stationId}/${mountId})`, err);
  }
}

/**
 * Detalle admin de una estación (incluye backend_config con dj_port, etc.).
 * GET /api/admin/station/{id}
 */
async function getStationAdmin(stationId) {
  try {
    const { data } = await api.get(`/admin/station/${stationId}`);
    return data;
  } catch (err) {
    handleError(`getStationAdmin(${stationId})`, err);
  }
}

/**
 * Crea una cuenta de DJ/streamer para conectar en vivo.
 * POST /api/station/{id}/streamers
 */
async function createStreamer(stationId, opts) {
  try {
    const { data } = await api.post(`/station/${stationId}/streamers`, opts);
    return data;
  } catch (err) {
    handleError(`createStreamer(${stationId})`, err);
  }
}

/**
 * Reinicia (y pone al aire) una estación. Registra los servicios en Supervisor.
 * POST /api/station/{id}/restart
 */
async function restartStation(stationId) {
  try {
    const { data } = await api.post(`/station/${stationId}/restart`);
    return data;
  } catch (err) {
    handleError(`restartStation(${stationId})`, err);
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

/**
 * Métricas del servidor (VPS): CPU, memoria, disco, red.
 * GET /api/admin/server/stats
 */
async function getServerStats() {
  try {
    const { data } = await api.get('/admin/server/stats');
    return data;
  } catch (err) {
    handleError('getServerStats', err);
  }
}

/**
 * Estado del backend/frontend de una estación (encendido/apagado).
 * GET /api/station/{id}/status
 */
async function getStationStatus(stationId) {
  try {
    const { data } = await api.get(`/station/${stationId}/status`);
    return data;
  } catch (err) {
    handleError(`getStationStatus(${stationId})`, err);
  }
}

module.exports = {
  api, // exportado por si se necesita una llamada puntual
  getStation,
  getStationAdmin,
  getNowPlaying,
  createStation,
  updateStation,
  getMounts,
  createMount,
  updateMount,
  createStreamer,
  restartStation,
  deleteStation,
  listMedia,
  getServerStats,
  getStationStatus,
};
