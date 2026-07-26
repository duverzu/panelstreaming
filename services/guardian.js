/**
 * services/guardian.js — Guardián de Banda
 * ------------------------------------------------------------------
 * Cada X minutos muestrea los oyentes de cada servidor y estima la
 * banda consumida (oyentes × bitrate × tiempo), acumulándola por día.
 * Así el admin ve el consumo del mes vs el tope del VPS y recibe alertas.
 *
 * Es una ESTIMACIÓN (oyentes × bitrate). El tope real lo pone Hostinger;
 * el panel te avisa antes de agotarlo para que no te corten por sorpresa.
 * ------------------------------------------------------------------
 */
const servidorModel = require('../models/servidorModel');
const consumoModel = require('../models/consumoModel');
const consumoClienteModel = require('../models/consumoClienteModel');
const clienteModel = require('../models/clienteModel');
const azuracast = require('./azuracast');
const videoNode = require('./videoNode');

// Última lectura del contador de red por nodo de video (para calcular el delta).
const ultimaRed = new Map();

const BITRATE_KBPS = Number(process.env.BANDA_BITRATE_KBPS || 128); // promedio estimado
const INTERVALO_MS = Number(process.env.BANDA_INTERVALO_MS || 5 * 60 * 1000); // 5 min

/** Toma una muestra de consumo de todos los servidores. */
async function muestrear() {
  const servidores = await servidorModel.findAllConUso();
  const segundos = INTERVALO_MS / 1000;
  const bytesPorOyente = (BITRATE_KBPS * 1000 / 8) * segundos; // bytes que consume 1 oyente en el intervalo

  // Para atribuir el consumo a cada radio: (servidor, station_id) -> cliente_id.
  // Las radios con servidor_id NULL viven en el servidor por defecto del .env.
  const clientes = await clienteModel.findAllWithEmail();
  const urlDefecto = (process.env.AZURACAST_BASE_URL || '').replace(/\/$/, '');

  for (const s of servidores) {
    if (!s.activo) continue;
    // Los nodos de video NO hablan el API de AzuraCast: se miden por su
    // contador de red (bytes reales servidos por el nodo), no por oyentes.
    if (s.tipo && s.tipo !== 'audio') {
      await muestrearVideo(s).catch((e) => console.error('[guardian] video', s.nombre, e.message));
      continue;
    }
    try {
      const az = await azuracast.paraServidorId(s.id);
      const np = await az.getNowPlayingAll();

      const oyentes = (np || []).reduce((sum, e) => sum + (e.listeners?.current || 0), 0);
      if (oyentes > 0) {
        await consumoModel.registrar(s.id, Math.round(oyentes * bytesPorOyente));
      }

      // Consumo por radio (el mismo cálculo, pero estación por estación)
      const esDefecto = (s.url || '').replace(/\/$/, '') === urlDefecto;
      const porStation = {};
      clientes.forEach((c) => {
        if (!c.azuracast_station_id) return;
        if (c.servidor_id === s.id || (c.servidor_id == null && esDefecto)) {
          porStation[c.azuracast_station_id] = c.id;
        }
      });

      for (const e of np || []) {
        const clienteId = porStation[e.station?.id];
        const oy = e.listeners?.current || 0;
        if (clienteId && oy > 0) {
          await consumoClienteModel.registrar(clienteId, Math.round(oy * bytesPorOyente));
        }
      }
    } catch (e) {
      console.error('[guardian]', s.nombre, e.message);
    }
  }
}

/**
 * Muestra el consumo de un nodo de VIDEO leyendo su contador de red y
 * registrando el delta desde la última muestra. Es tráfico REAL servido por el
 * VPS (lo mismo que factura Hostinger), no una estimación por oyentes.
 */
async function muestrearVideo(s) {
  const nodo = videoNode.crearCliente(s.url, s.api_key);
  const red = await nodo.redNodo();
  if (!red || typeof red.tx_bytes !== 'number') return;   // nodo caído o sin dato

  const prev = ultimaRed.get(s.id);
  ultimaRed.set(s.id, red.tx_bytes);
  if (prev == null) return;                                // primera muestra: fija la base

  // Delta normal; si el contador bajó (el nodo se reinició) contamos desde 0.
  let delta = red.tx_bytes - prev;
  if (delta < 0) delta = red.tx_bytes;
  if (delta > 0) await consumoModel.registrar(s.id, delta);
}

function iniciar() {
  // Una muestra al arrancar fija de inmediato la base de los nodos de video
  // (así el primer dato aparece a la siguiente muestra, no dos intervalos después).
  muestrear().catch((e) => console.error('[guardian]', e.message));
  setInterval(() => muestrear().catch((e) => console.error('[guardian]', e.message)), INTERVALO_MS);
  console.log(`🛡️  Guardián de banda activo (muestra cada ${INTERVALO_MS / 60000} min, ~${BITRATE_KBPS} kbps)`);
}

module.exports = { iniciar, muestrear };
