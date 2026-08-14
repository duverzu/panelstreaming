/**
 * services/videoNode.js
 * ------------------------------------------------------------------
 * Habla con el AGENTE que corre en un VPS de video, igual que
 * services/azuracast.js habla con AzuraCast.
 *
 * Reutiliza la tabla `servidores`:
 *   url     → dirección del agente   (http://IP:3000)
 *   api_key → su AGENT_TOKEN
 *   tipo    → 'video'
 *
 * Nunca lanza excepciones hacia arriba: si el nodo no responde, devuelve
 * null o lista vacía, para que el panel siga funcionando.
 * ------------------------------------------------------------------
 */
const axios = require('axios');
const servidorModel = require('../models/servidorModel');

function crearCliente(baseURL, token) {
  const api = axios.create({
    baseURL: String(baseURL || '').replace(/\/+$/, ''),
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });

  const fallo = (que, e) => {
    console.error(`[videoNode] ${que}:`, e.response?.status || '', e.message);
    return null;
  };

  return {
    baseURL,

    /**
     * ¿Responde Y acepta nuestro token? Se prueba contra una ruta autenticada:
     * /health no sirve para validar porque a propósito no pide token.
     */
    verificar: async () => {
      try { await api.get('/cuentas'); return true; }
      catch (e) { fallo('verificar', e); return false; }
    },

    /** ¿Está vivo el agente? (sin comprobar el token) */
    salud: async () => {
      try { return (await api.get('/health')).data; } catch (e) { return fallo('salud', e); }
    },

    /** Contador de tráfico de red del nodo (bytes acumulados desde el arranque). */
    redNodo: async () => {
      try { return (await api.get('/nodo/red')).data; } catch (e) { return fallo('redNodo', e); }
    },

    /** Espectadores en vivo por cuenta (IPs únicas de HLS en los últimos ~60s). */
    viewers: async () => {
      try { return (await api.get('/viewers')).data; } catch (e) { return fallo('viewers', e); }
    },

    /** Canales de la capa de compatibilidad "asilivehd" (en vivo + viewers). */
    compatClientes: async () => {
      try { return (await api.get('/compat/clientes')).data?.clientes || []; }
      catch (e) { return fallo('compatClientes', e) || []; }
    },

    /** Conexión completa de un canal asilivehd (RTMP, clave, m3u8, player, estado). */
    compatCliente: async (user) => {
      try { return (await api.get(`/compat/clientes/${encodeURIComponent(user)}`)).data; }
      catch (e) { return fallo(`compatCliente(${user})`, e); }
    },

    /** Estado del reenvío a Facebook de una cuenta. */
    restream: (user) => api.get(`/cuentas/${encodeURIComponent(user)}/restream`).then((r) => r.data).catch((e) => fallo(`restream(${user})`, e)),
    /** Configura/enciende el reenvío a Facebook. body: { facebook_key?, encender } */
    configurarRestream: (user, body) => api.put(`/cuentas/${encodeURIComponent(user)}/restream`, body).then((r) => r.data).catch((e) => fallo(`configurarRestream(${user})`, e)),

    /** Cuentas del nodo con su espacio, videos y si están al aire. */
    /** Crea una cuenta nueva en el nodo (asigna puertos y genera su nginx). */
    crearCuenta: async (user, opts = {}) => {
      try { return (await api.post('/cuentas', { user, ...opts })).data; } catch (e) { return fallo(`crearCuenta(${user})`, e); }
    },

    cuentas: async () => {
      try { return (await api.get('/cuentas')).data?.cuentas || []; } catch (e) { return fallo('cuentas', e) || []; }
    },

    /** Detalle de una cuenta, con su lista de videos. */
    cuenta: async (user) => {
      try { return (await api.get(`/cuentas/${encodeURIComponent(user)}`)).data; } catch (e) { return fallo(`cuenta(${user})`, e); }
    },

    /** Consumo diario de una cuenta (leído de los logs de nginx). */
    consumo: async (user, dias = 30) => {
      try { return (await api.get(`/cuentas/${encodeURIComponent(user)}/consumo`, { params: { dias } })).data; }
      catch (e) { return fallo(`consumo(${user})`, e); }
    },

    /** Pide un ticket para que el navegador suba directo al nodo. */
    ticketSubida: async (user) => {
      try { return (await api.post(`/cuentas/${encodeURIComponent(user)}/ticket`)).data; }
      catch (e) { return fallo(`ticket(${user})`, e); }
    },

    /** Borra un video de la cuenta. */
    borrarVideo: async (user, nombre) => {
      try { return (await api.delete(`/cuentas/${encodeURIComponent(user)}/videos/${encodeURIComponent(nombre)}`)).data; }
      catch (e) { return fallo(`borrar(${user})`, e) || { ok: false }; }
    },

    /** Listas + programación de la cuenta. */
    listas:      (user) => api.get(`/cuentas/${encodeURIComponent(user)}/listas`).then(r=>r.data).catch((e)=>fallo(`listas(${user})`,e)),
    crearLista:  (user, nombre) => api.post(`/cuentas/${encodeURIComponent(user)}/listas`, { nombre }).then(r=>r.data).catch((e)=>fallo('crearLista',e)),
    editarLista: (user, id, cambios) => api.put(`/cuentas/${encodeURIComponent(user)}/listas/${id}`, cambios).then(r=>r.data).catch((e)=>fallo('editarLista',e)),
    borrarLista: (user, id) => api.delete(`/cuentas/${encodeURIComponent(user)}/listas/${id}`).then(r=>r.data).catch((e)=>fallo('borrarLista',e)||{ok:false}),
    activarLista:(user, id) => api.post(`/cuentas/${encodeURIComponent(user)}/activa`, { id }).then(r=>r.data).catch((e)=>fallo('activarLista',e)),
    programar:   (user, programacion) => api.put(`/cuentas/${encodeURIComponent(user)}/programacion`, { programacion }).then(r=>r.data).catch((e)=>fallo('programar',e)),

    /** Guarda el orden de emisión (playlist) del cliente. */
    guardarOrden: async (user, orden) => {
      try { return (await api.put(`/cuentas/${encodeURIComponent(user)}/orden`, { orden })).data; }
      catch (e) { return fallo(`orden(${user})`, e); }
    },

    /** Datos para transmitir en vivo (servidor RTMP, clave). */
    conexion: async (user) => {
      try { return (await api.get(`/cuentas/${encodeURIComponent(user)}/conexion`)).data; }
      catch (e) { return fallo(`conexion(${user})`, e); }
    },

    /** Canales del nodo con entrada SRT habilitada. */
    srtActivos: async () => {
      try { return (await api.get('/srt/activos')).data?.canales || []; }
      catch (e) { return fallo('srtActivos', e) || []; }
    },
    /** Activa o quita la entrada SRT de un canal. Surte efecto en la siguiente
     *  conexión: el agente relee la lista cada vez, no hace falta reiniciar. */
    srtActivar: async (user, activo) => {
      try { return (await api.put(`/srt/activos/${encodeURIComponent(user)}`, { activo })).data; }
      catch (e) { return fallo(`srtActivar(${user})`, e); }
    },

    /** Enciende/apaga la emisión 24/7. */
    emision: async (user, encender) => {
      try { return (await api.post(`/cuentas/${encodeURIComponent(user)}/24-7`, { encender })).data; }
      catch (e) { return fallo(`emision(${user})`, e); }
    },
  };
}

/** Cliente del nodo de video guardado en BD. Devuelve null si no es de video. */
async function paraServidorId(servidorId) {
  if (!servidorId) return null;
  const s = await servidorModel.findById(servidorId);
  if (!s || s.tipo !== 'video' || !s.url) return null;
  return crearCliente(s.url, s.api_key);
}

module.exports = { crearCliente, paraServidorId };
