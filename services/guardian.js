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

function iniciar() {
  setInterval(() => muestrear().catch((e) => console.error('[guardian]', e.message)), INTERVALO_MS);
  console.log(`🛡️  Guardián de banda activo (muestra cada ${INTERVALO_MS / 60000} min, ~${BITRATE_KBPS} kbps)`);
}

module.exports = { iniciar, muestrear };
