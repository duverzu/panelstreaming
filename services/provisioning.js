/**
 * services/provisioning.js
 * ------------------------------------------------------------------
 * Crea un cliente + su estación real en AzuraCast aplicando el plan.
 * Lo usan tanto el super admin como los revendedores.
 * ------------------------------------------------------------------
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userModel = require('../models/userModel');
const clienteModel = require('../models/clienteModel');
const planModel = require('../models/planModel');
const azuracast = require('./azuracast');
const biblioteca = require('./biblioteca');

function err(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

/**
 * Aplica (o re-aplica) los límites de un plan a una estación existente.
 * Todos los pasos son tolerantes a fallos (no fatales).
 */
async function aplicarLimitesPlan(stationId, plan) {
  await azuracast.updateStation(stationId, {
    max_bitrate: plan.max_bitrate,
    max_mounts: plan.max_mounts,
    enable_streamers: plan.permite_dj,
    enable_public_page: true,
    frontend_config: { max_listeners: plan.max_oyentes || null },
  });
  // Bitrate del mount por defecto
  try {
    const mounts = await azuracast.getMounts(stationId);
    const principal = mounts.find((m) => m.is_default) || mounts[0];
    if (principal) {
      const autodjBitrate = plan.max_bitrate > 0 ? Math.min(plan.max_bitrate, 320) : 128;
      await azuracast.updateMount(stationId, principal.id, { enable_autodj: true, autodj_format: 'mp3', autodj_bitrate: autodjBitrate });
    }
  } catch (e) { console.error('[limites] mount:', e.message); }
  // Cuota de espacio
  try {
    const info = await azuracast.getStationAdmin(stationId);
    if (info?.media_storage_location && plan.espacio_mb) {
      await azuracast.updateStorageLocation(info.media_storage_location, { storageQuota: `${plan.espacio_mb} MB` });
    }
  } catch (e) { console.error('[limites] storage:', e.message); }
}

/**
 * @param {{email,password,nombre_empresa,plan_id,reseller_id?}} datos
 * @returns {{cliente, credenciales}}
 */
async function crearClienteConEstacion({ email, password, nombre_empresa, plan_id, reseller_id = null }) {
  if (!email || !password || !nombre_empresa || !plan_id) {
    throw err('email, password, nombre_empresa y plan_id son requeridos', 400);
  }
  const plan = await planModel.findById(Number(plan_id));
  if (!plan) throw err('Plan no encontrado', 400);
  if (await userModel.findByEmail(email)) throw err('Ya existe un usuario con ese email', 409);

  // 1) Usuario
  const password_hash = await bcrypt.hash(password, 10);
  const user = await userModel.create({ email, password_hash, role: 'cliente' });

  // 2) Estación
  let station;
  try {
    station = await azuracast.createStation(nombre_empresa, `Radio de ${nombre_empresa}`);
  } catch (e) {
    await userModel.deleteById(user.id);
    throw err('No se pudo crear la estación: ' + e.message, e.status || 502);
  }

  // 2b) Aplicar límites del plan (bitrate, mounts, DJ, máx oyentes, cuota de espacio)
  try {
    await aplicarLimitesPlan(station.id, plan);
  } catch (e) { console.error('[provision] límites:', e.message); }

  // 4) Cuenta DJ (si el plan lo permite)
  const dj = {};
  if (plan.permite_dj) {
    try {
      dj.dj_usuario = station.short_name;
      dj.dj_password = crypto.randomBytes(6).toString('hex');
      await azuracast.createStreamer(station.id, {
        streamer_username: dj.dj_usuario, streamer_password: dj.dj_password, display_name: nombre_empresa, is_active: true,
      });
      const admin = await azuracast.getStationAdmin(station.id);
      dj.dj_puerto = admin?.backend_config?.dj_port || null;
    } catch (e) { console.error('[provision] dj:', e.message); }
  }

  // 5) Al aire
  try { await azuracast.restartStation(station.id); } catch (e) { console.error('[provision] restart:', e.message); }

  // 6) Biblioteca de cortesía (segundo plano)
  biblioteca.copiarAEstacion(station.id)
    .then((r) => r.copiados && console.log(`[biblioteca] estación ${station.id}: ${r.copiados}/${r.total}`))
    .catch((e) => console.error('[biblioteca]', e.message));

  // 7) Cliente en BD
  const url_streaming = `${process.env.AZURACAST_BASE_URL}/listen/${station.short_name}/radio.mp3`;
  const cliente = await clienteModel.create({
    user_id: user.id, nombre_empresa, plan: plan.nombre,
    azuracast_station_id: station.id, url_streaming, reseller_id,
  });
  if (dj.dj_usuario) { await clienteModel.update(cliente.id, dj); Object.assign(cliente, dj); }

  return { cliente: { ...cliente, email }, credenciales: { email, password } };
}

module.exports = { crearClienteConEstacion, aplicarLimitesPlan };
