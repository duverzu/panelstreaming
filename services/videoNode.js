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

    /** Cuentas del nodo con su espacio, videos y si están al aire. */
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
