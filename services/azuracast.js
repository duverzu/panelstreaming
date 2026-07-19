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
  timeout: 60000, // subidas de audio pueden tardar
  maxBodyLength: Infinity, // permitir subir archivos grandes (base64)
  maxContentLength: Infinity,
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

/** Lista las cuentas DJ/streamer. GET /api/station/{id}/streamers */
async function getStreamers(stationId) {
  try {
    const { data } = await api.get(`/station/${stationId}/streamers`);
    return data;
  } catch (err) {
    handleError(`getStreamers(${stationId})`, err);
  }
}

/** Actualiza una cuenta DJ (ej. contraseña). PUT /api/station/{id}/streamer/{sid} */
async function updateStreamer(stationId, sid, data) {
  try {
    const res = await api.put(`/station/${stationId}/streamer/${sid}`, data);
    return res.data;
  } catch (err) {
    handleError(`updateStreamer(${stationId}/${sid})`, err);
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

/** Salta la canción actual del AutoDJ. POST /api/station/{id}/backend/skip */
async function skipSong(stationId) {
  try {
    const { data } = await api.post(`/station/${stationId}/backend/skip`);
    return data;
  } catch (err) {
    handleError(`skipSong(${stationId})`, err);
  }
}

/**
 * Detiene la transmisión (frontend + backend) de una estación.
 */
async function stopStation(stationId) {
  try {
    await api.post(`/station/${stationId}/frontend/stop`);
    await api.post(`/station/${stationId}/backend/stop`);
    return { stopped: true };
  } catch (err) {
    handleError(`stopStation(${stationId})`, err);
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
 * Sube un archivo de audio (base64) a la estación.
 * POST /api/station/{id}/files
 */
async function uploadMedia(stationId, filename, base64) {
  try {
    const { data } = await api.post(`/station/${stationId}/files`, { path: filename, file: base64 });
    return data;
  } catch (err) {
    handleError(`uploadMedia(${stationId})`, err);
  }
}

/**
 * Elimina un archivo de media.
 * DELETE /api/station/{id}/file/{mediaId}
 */
async function deleteMedia(stationId, mediaId) {
  try {
    const { data } = await api.delete(`/station/${stationId}/file/${mediaId}`);
    return data;
  } catch (err) {
    handleError(`deleteMedia(${stationId}/${mediaId})`, err);
  }
}

/**
 * Asigna un archivo a una o más playlists (para que el AutoDJ lo reproduzca).
 * PUT /api/station/{id}/file/{mediaId}
 */
async function setFilePlaylists(stationId, mediaId, playlistIds) {
  try {
    const { data } = await api.put(`/station/${stationId}/file/${mediaId}`, { playlists: playlistIds });
    return data;
  } catch (err) {
    handleError(`setFilePlaylists(${stationId}/${mediaId})`, err);
  }
}

/**
 * Lista las playlists de una estación.
 * GET /api/station/{id}/playlists
 */
async function getPlaylists(stationId) {
  try {
    const { data } = await api.get(`/station/${stationId}/playlists`);
    return data;
  } catch (err) {
    handleError(`getPlaylists(${stationId})`, err);
  }
}

/** Crea una playlist. POST /api/station/{id}/playlists */
async function createPlaylist(stationId, data) {
  try {
    const res = await api.post(`/station/${stationId}/playlists`, data);
    return res.data;
  } catch (err) {
    handleError(`createPlaylist(${stationId})`, err);
  }
}

/** Actualiza una playlist (horario, activar/desactivar…). PUT /api/station/{id}/playlist/{plId} */
async function updatePlaylist(stationId, plId, data) {
  try {
    const res = await api.put(`/station/${stationId}/playlist/${plId}`, data);
    return res.data;
  } catch (err) {
    handleError(`updatePlaylist(${stationId}/${plId})`, err);
  }
}

/** Elimina una playlist. DELETE /api/station/{id}/playlist/{plId} */
async function deletePlaylist(stationId, plId) {
  try {
    const res = await api.delete(`/station/${stationId}/playlist/${plId}`);
    return res.data;
  } catch (err) {
    handleError(`deletePlaylist(${stationId}/${plId})`, err);
  }
}

/** Lista los webhooks (auto-post a redes). GET /api/station/{id}/webhooks */
async function getWebhooks(stationId) {
  try {
    const { data } = await api.get(`/station/${stationId}/webhooks`);
    return data;
  } catch (err) {
    handleError(`getWebhooks(${stationId})`, err);
  }
}

/** Crea un webhook. POST /api/station/{id}/webhooks */
async function createWebhook(stationId, data) {
  try {
    const res = await api.post(`/station/${stationId}/webhooks`, data);
    return res.data;
  } catch (err) {
    handleError(`createWebhook(${stationId})`, err);
  }
}

/** Activa/desactiva un webhook. PUT /api/station/{id}/webhook/{wid} */
async function updateWebhook(stationId, wid, data) {
  try {
    const res = await api.put(`/station/${stationId}/webhook/${wid}`, data);
    return res.data;
  } catch (err) {
    handleError(`updateWebhook(${stationId}/${wid})`, err);
  }
}

/** Elimina un webhook. DELETE /api/station/{id}/webhook/{wid} */
async function deleteWebhook(stationId, wid) {
  try {
    const res = await api.delete(`/station/${stationId}/webhook/${wid}`);
    return res.data;
  } catch (err) {
    handleError(`deleteWebhook(${stationId}/${wid})`, err);
  }
}

/** Oyentes en vivo de una estación. GET /api/station/{id}/listeners */
async function getListeners(stationId) {
  try {
    const { data } = await api.get(`/station/${stationId}/listeners`);
    return data;
  } catch (err) {
    handleError(`getListeners(${stationId})`, err);
  }
}

/** Gráficas de audiencia (daily/hourly/day_of_week). GET /api/station/{id}/reports/overview/charts */
async function getCharts(stationId) {
  try {
    const { data } = await api.get(`/station/${stationId}/reports/overview/charts`);
    return data;
  } catch (err) {
    handleError(`getCharts(${stationId})`, err);
  }
}

/** Canciones mejor/peor y más reproducidas. GET /api/station/{id}/reports/overview/best-and-worst */
async function getBestWorst(stationId) {
  try {
    const { data } = await api.get(`/station/${stationId}/reports/overview/best-and-worst`);
    return data;
  } catch (err) {
    handleError(`getBestWorst(${stationId})`, err);
  }
}

/** NowPlaying de TODAS las estaciones (para totales del admin). GET /api/nowplaying */
async function getNowPlayingAll() {
  try {
    const { data } = await api.get('/nowplaying');
    return data;
  } catch (err) {
    handleError('getNowPlayingAll', err);
  }
}

/** Actualiza una ubicación de almacenamiento (ej. cuota). PUT /api/admin/storage_location/{id} */
async function updateStorageLocation(id, data) {
  try {
    const res = await api.put(`/admin/storage_location/${id}`, data);
    return res.data;
  } catch (err) {
    handleError(`updateStorageLocation(${id})`, err);
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
  getStreamers,
  updateStreamer,
  restartStation,
  stopStation,
  skipSong,
  deleteStation,
  listMedia,
  uploadMedia,
  deleteMedia,
  setFilePlaylists,
  getPlaylists,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  updateStorageLocation,
  getServerStats,
  getStationStatus,
  getListeners,
  getCharts,
  getBestWorst,
  getNowPlayingAll,
  getWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
};
