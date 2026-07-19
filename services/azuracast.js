/**
 * services/azuracast.js
 * ------------------------------------------------------------------
 * Cliente de la API de AzuraCast — MULTI-SERVIDOR.
 *
 *   azuracast.getStation(id)            → usa el servidor por defecto (.env)
 *   azuracast.crearCliente(url, key)    → cliente para un servidor concreto
 *   await azuracast.paraServidorId(id)  → cliente del servidor guardado en BD
 *
 * Cada radio guarda su `servidor_id`; las llamadas se enrutan a SU servidor.
 * ------------------------------------------------------------------
 */
const axios = require('axios');

/** Normaliza errores de axios a algo legible para nuestras rutas. */
function handleError(context, err) {
  const status = err.response?.status;
  const detail = err.response?.data?.message || err.message;
  const msg = `[AzuraCast] ${context} falló${status ? ` (HTTP ${status})` : ''}: ${detail}`;
  const error = new Error(msg);
  error.status = status || 502;
  throw error;
}

/** Crea un conjunto de métodos ligados a UN servidor AzuraCast. */
function crearCliente(baseURL, apiKey) {
  const api = axios.create({
    baseURL: `${baseURL}/api`,
    timeout: 60000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });

  const getStation = async (id) => { try { return (await api.get(`/station/${id}`)).data; } catch (e) { handleError(`getStation(${id})`, e); } };
  const getStationAdmin = async (id) => { try { return (await api.get(`/admin/station/${id}`)).data; } catch (e) { handleError(`getStationAdmin(${id})`, e); } };
  const getNowPlaying = async (id) => { try { return (await api.get(`/nowplaying/${id}`)).data; } catch (e) { handleError(`getNowPlaying(${id})`, e); } };
  const getNowPlayingAll = async () => { try { return (await api.get('/nowplaying')).data; } catch (e) { handleError('getNowPlayingAll', e); } };
  const createStation = async (nombre, descripcion = '') => { try { return (await api.post('/admin/stations', { name: nombre, description: descripcion })).data; } catch (e) { handleError(`createStation(${nombre})`, e); } };
  const updateStation = async (id, fields) => { try { return (await api.put(`/admin/station/${id}`, fields)).data; } catch (e) { handleError(`updateStation(${id})`, e); } };
  const deleteStation = async (id) => { try { return (await api.delete(`/admin/station/${id}`)).data; } catch (e) { handleError(`deleteStation(${id})`, e); } };
  const getMounts = async (id) => { try { return (await api.get(`/station/${id}/mounts`)).data; } catch (e) { handleError(`getMounts(${id})`, e); } };
  const createMount = async (id, opts) => { try { return (await api.post(`/station/${id}/mounts`, opts)).data; } catch (e) { handleError(`createMount(${id})`, e); } };
  const updateMount = async (id, mid, fields) => { try { return (await api.put(`/station/${id}/mount/${mid}`, fields)).data; } catch (e) { handleError(`updateMount(${id}/${mid})`, e); } };
  const createStreamer = async (id, opts) => { try { return (await api.post(`/station/${id}/streamers`, opts)).data; } catch (e) { handleError(`createStreamer(${id})`, e); } };
  const getStreamers = async (id) => { try { return (await api.get(`/station/${id}/streamers`)).data; } catch (e) { handleError(`getStreamers(${id})`, e); } };
  const updateStreamer = async (id, sid, data) => { try { return (await api.put(`/station/${id}/streamer/${sid}`, data)).data; } catch (e) { handleError(`updateStreamer(${id}/${sid})`, e); } };
  const restartStation = async (id) => { try { return (await api.post(`/station/${id}/restart`)).data; } catch (e) { handleError(`restartStation(${id})`, e); } };
  const skipSong = async (id) => { try { return (await api.post(`/station/${id}/backend/skip`)).data; } catch (e) { handleError(`skipSong(${id})`, e); } };
  const stopStation = async (id) => { try { await api.post(`/station/${id}/frontend/stop`); await api.post(`/station/${id}/backend/stop`); return { stopped: true }; } catch (e) { handleError(`stopStation(${id})`, e); } };
  const getStationStatus = async (id) => { try { return (await api.get(`/station/${id}/status`)).data; } catch (e) { handleError(`getStationStatus(${id})`, e); } };
  const listMedia = async (id) => { try { return (await api.get(`/station/${id}/files`)).data; } catch (e) { handleError(`listMedia(${id})`, e); } };
  const uploadMedia = async (id, filename, base64) => { try { return (await api.post(`/station/${id}/files`, { path: filename, file: base64 })).data; } catch (e) { handleError(`uploadMedia(${id})`, e); } };
  const deleteMedia = async (id, mid) => { try { return (await api.delete(`/station/${id}/file/${mid}`)).data; } catch (e) { handleError(`deleteMedia(${id}/${mid})`, e); } };
  const setFilePlaylists = async (id, mid, ids) => { try { return (await api.put(`/station/${id}/file/${mid}`, { playlists: ids })).data; } catch (e) { handleError(`setFilePlaylists(${id}/${mid})`, e); } };
  const getPlaylists = async (id) => { try { return (await api.get(`/station/${id}/playlists`)).data; } catch (e) { handleError(`getPlaylists(${id})`, e); } };
  const createPlaylist = async (id, data) => { try { return (await api.post(`/station/${id}/playlists`, data)).data; } catch (e) { handleError(`createPlaylist(${id})`, e); } };
  const updatePlaylist = async (id, plId, data) => { try { return (await api.put(`/station/${id}/playlist/${plId}`, data)).data; } catch (e) { handleError(`updatePlaylist(${id}/${plId})`, e); } };
  const deletePlaylist = async (id, plId) => { try { return (await api.delete(`/station/${id}/playlist/${plId}`)).data; } catch (e) { handleError(`deletePlaylist(${id}/${plId})`, e); } };
  const getWebhooks = async (id) => { try { return (await api.get(`/station/${id}/webhooks`)).data; } catch (e) { handleError(`getWebhooks(${id})`, e); } };
  const createWebhook = async (id, data) => { try { return (await api.post(`/station/${id}/webhooks`, data)).data; } catch (e) { handleError(`createWebhook(${id})`, e); } };
  const updateWebhook = async (id, wid, data) => { try { return (await api.put(`/station/${id}/webhook/${wid}`, data)).data; } catch (e) { handleError(`updateWebhook(${id}/${wid})`, e); } };
  const deleteWebhook = async (id, wid) => { try { return (await api.delete(`/station/${id}/webhook/${wid}`)).data; } catch (e) { handleError(`deleteWebhook(${id}/${wid})`, e); } };
  const getListeners = async (id) => { try { return (await api.get(`/station/${id}/listeners`)).data; } catch (e) { handleError(`getListeners(${id})`, e); } };
  const getCharts = async (id) => { try { return (await api.get(`/station/${id}/reports/overview/charts`)).data; } catch (e) { handleError(`getCharts(${id})`, e); } };
  const getBestWorst = async (id) => { try { return (await api.get(`/station/${id}/reports/overview/best-and-worst`)).data; } catch (e) { handleError(`getBestWorst(${id})`, e); } };
  const updateStorageLocation = async (id, data) => { try { return (await api.put(`/admin/storage_location/${id}`, data)).data; } catch (e) { handleError(`updateStorageLocation(${id})`, e); } };
  const getServerStats = async () => { try { return (await api.get('/admin/server/stats')).data; } catch (e) { handleError('getServerStats', e); } };

  return {
    baseURL, apiKey, api,
    getStation, getStationAdmin, getNowPlaying, getNowPlayingAll, createStation, updateStation, deleteStation,
    getMounts, createMount, updateMount, createStreamer, getStreamers, updateStreamer,
    restartStation, skipSong, stopStation, getStationStatus,
    listMedia, uploadMedia, deleteMedia, setFilePlaylists,
    getPlaylists, createPlaylist, updatePlaylist, deletePlaylist,
    getWebhooks, createWebhook, updateWebhook, deleteWebhook,
    getListeners, getCharts, getBestWorst, updateStorageLocation, getServerStats,
  };
}

// Cliente del servidor por defecto (el del .env). Compat con todo el código previo.
const porDefecto = crearCliente(process.env.AZURACAST_BASE_URL, process.env.AZURACAST_API_KEY);

/**
 * Devuelve el cliente del servidor guardado en BD por id.
 * Si no hay id o no existe, cae al servidor por defecto.
 */
async function paraServidorId(servidorId) {
  if (!servidorId) return porDefecto;
  const servidorModel = require('../models/servidorModel');
  const s = await servidorModel.findById(servidorId);
  if (!s || !s.url) return porDefecto;
  return crearCliente(s.url, s.api_key);
}

module.exports = { ...porDefecto, crearCliente, paraServidorId, porDefecto };
