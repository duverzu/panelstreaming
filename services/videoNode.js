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
