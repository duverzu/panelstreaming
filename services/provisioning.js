/**
 * services/provisioning.js
 * ------------------------------------------------------------------
 * Crea un cliente + su estación real en AzuraCast aplicando el plan.
 * MULTI-SERVIDOR: elige el servidor con espacio y crea ahí la radio.
 * ------------------------------------------------------------------
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userModel = require('../models/userModel');
const clienteModel = require('../models/clienteModel');
const planModel = require('../models/planModel');
const servidorModel = require('../models/servidorModel');
const azuracast = require('./azuracast');
const biblioteca = require('./biblioteca');
const publico = require('./publico');

function err(msg, status) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

/**
 * Aplica (o re-aplica) los límites de un plan a una estación existente.
 * @param az cliente AzuraCast del servidor de esa estación (por defecto el del .env)
 */
async function aplicarLimitesPlan(stationId, plan, az = azuracast) {
  await az.updateStation(stationId, {
    max_bitrate: plan.max_bitrate,
    max_mounts: plan.max_mounts,
    enable_streamers: plan.permite_dj,
    enable_public_page: true,
    frontend_config: { max_listeners: plan.max_oyentes || null },
  });
  try {
    const mounts = await az.getMounts(stationId);
    const principal = mounts.find((m) => m.is_default) || mounts[0];
    if (principal) {
      const autodjBitrate = plan.max_bitrate > 0 ? Math.min(plan.max_bitrate, 320) : 128;
      await az.updateMount(stationId, principal.id, { enable_autodj: true, autodj_format: 'mp3', autodj_bitrate: autodjBitrate });
    }
  } catch (e) { console.error('[limites] mount:', e.message); }
  try {
    const info = await az.getStationAdmin(stationId);
    if (info?.media_storage_location && plan.espacio_mb) {
      await az.updateStorageLocation(info.media_storage_location, { storageQuota: `${plan.espacio_mb} MB` });
    }
  } catch (e) { console.error('[limites] storage:', e.message); }
}

/**
 * Crea cliente + estación. El identificador de acceso es `username` (NO el email):
 * así un mismo correo puede tener varias radios, cada una con su propia cuenta.
 * Si no se envía username se genera desde el nombre de la radio (rockfm, rockfm2...).
 */
async function crearClienteConEstacion({ email, username, password, nombre_empresa, plan_id, reseller_id = null }) {
  if (!email || !password || !nombre_empresa || !plan_id) {
    throw err('email, password, nombre_empresa y plan_id son requeridos', 400);
  }
  const plan = await planModel.findById(Number(plan_id));
  if (!plan) throw err('Plan no encontrado', 400);

  // Usuario de acceso: el que pidan (si está libre) o uno generado del nombre de la radio.
  let usuario;
  if (username) {
    usuario = userModel.slugUsuario(username);
    if (usuario.length < 3) throw err('El usuario debe tener al menos 3 letras o números', 400);
    if (await userModel.findByUsername(usuario)) throw err(`El usuario "${usuario}" ya está en uso`, 409);
  } else {
    usuario = await userModel.generarUsername(nombre_empresa || email);
  }

  // 0) Elegir servidor con espacio (o el por defecto del .env si no hay tabla)
  const servidor = await servidorModel.elegirServidor();
  const az = servidor ? azuracast.crearCliente(servidor.url, servidor.api_key) : azuracast.porDefecto;
  const servidor_id = servidor ? servidor.id : null;
  const baseUrl = servidor ? servidor.url : process.env.AZURACAST_BASE_URL;   // admin (API)
  const baseUrlPublica = publico.deServidor(servidor);                        // la que ve el cliente

  // 1) Usuario
  const password_hash = await bcrypt.hash(password, 10);
  const user = await userModel.create({ username: usuario, email, password_hash, role: 'cliente' });

  // 2) Estación (en el servidor elegido)
  let station;
  try {
    station = await az.createStation(nombre_empresa, `Radio de ${nombre_empresa}`);
  } catch (e) {
    await userModel.deleteById(user.id);
    throw err('No se pudo crear la estación: ' + e.message, e.status || 502);
  }

  // 2b) Límites del plan
  try { await aplicarLimitesPlan(station.id, plan, az); } catch (e) { console.error('[provision] límites:', e.message); }

  // 3) Cuenta DJ
  const dj = {};
  let djMount = '/';
  if (plan.permite_dj) {
    try {
      dj.dj_usuario = station.short_name;
      dj.dj_password = crypto.randomBytes(6).toString('hex');
      await az.createStreamer(station.id, { streamer_username: dj.dj_usuario, streamer_password: dj.dj_password, display_name: nombre_empresa, is_active: true });
      const info = await az.getStationAdmin(station.id);
      dj.dj_puerto = info?.backend_config?.dj_port || null;
      // El DJ conecta al mount del backend ('/'), NO al de escucha (/radio.mp3)
      djMount = info?.backend_config?.dj_mount_point || '/';
    } catch (e) { console.error('[provision] dj:', e.message); }
  }

  // 4) Al aire
  try { await az.restartStation(station.id); } catch (e) { console.error('[provision] restart:', e.message); }

  // 5) Biblioteca de cortesía (segundo plano, en el mismo servidor)
  biblioteca.copiarAEstacion(station.id, az)
    .then((r) => r.copiados && console.log(`[biblioteca] estación ${station.id}: ${r.copiados}/${r.total}`))
    .catch((e) => console.error('[biblioteca]', e.message));

  // 6) Cliente en BD (con servidor y shortcode)
  const url_streaming = `${baseUrlPublica}/listen/${station.short_name}/radio.mp3`;
  const cliente = await clienteModel.create({
    user_id: user.id, nombre_empresa, plan: plan.nombre,
    azuracast_station_id: station.id, url_streaming, reseller_id,
    servidor_id, short_name: station.short_name,
  });
  if (dj.dj_usuario) { await clienteModel.update(cliente.id, dj); Object.assign(cliente, dj); }

  return {
    // servidor_url y dj_mount no se guardan en BD: son datos derivados que el
    // integrador necesita para armar el mensaje de bienvenida del cliente.
    cliente: { ...cliente, email, username: usuario, servidor_url: baseUrlPublica, dj_mount: djMount },
    credenciales: { usuario, email, password },
  };
}

/**
 * Crea una cuenta de REVENDEDOR a partir de un plan de revendedor.
 * Es el equivalente mayorista de crearClienteConEstacion: en vez de una
 * estación, entrega un cupo (radios, oyentes y espacio) para que él venda.
 *
 * @param plan_reseller_id  plan de `planes_reseller` (opcional si se pasan límites a medida)
 * @param limites           { cupo_radios, max_oyentes_total, espacio_total_mb } — solo si no hay plan
 */
async function crearReseller({ email, username, password, nombre_empresa, plan_reseller_id = null, limites = null }) {
  const resellerModel = require('../models/resellerModel');
  const planResellerModel = require('../models/planResellerModel');

  if (!email || !password || !nombre_empresa) {
    throw err('email, password y nombre_empresa son requeridos', 400);
  }

  // Los límites salen del plan; si no hay plan, se aceptan a medida.
  let plan = null;
  if (plan_reseller_id) {
    plan = await planResellerModel.findById(Number(plan_reseller_id));
    if (!plan) throw err('Plan de revendedor no encontrado', 400);
  } else if (!limites) {
    throw err('Indica un plan de revendedor o los límites a medida', 400);
  }
  const cupo = {
    cupo_radios: Number(plan ? plan.cupo_radios : limites.cupo_radios ?? 5),
    max_oyentes_total: Number(plan ? plan.max_oyentes_total : limites.max_oyentes_total ?? 500),
    espacio_total_mb: Number(plan ? plan.espacio_total_mb : limites.espacio_total_mb ?? 10240),
  };

  // Acceso por usuario (el email puede repetirse: alguien con varios servicios)
  let usuario;
  if (username) {
    usuario = userModel.slugUsuario(username);
    if (usuario.length < 3) throw err('El usuario debe tener al menos 3 letras o números', 400);
    if (await userModel.findByUsername(usuario)) throw err(`El usuario "${usuario}" ya está en uso`, 409);
  } else {
    usuario = await userModel.generarUsername(nombre_empresa || email);
  }

  const password_hash = await bcrypt.hash(password, 10);
  const user = await userModel.create({ username: usuario, email, password_hash, role: 'reseller' });

  let reseller;
  try {
    reseller = await resellerModel.create({ user_id: user.id, nombre_empresa, plan: plan?.nombre || null, ...cupo });
  } catch (e) {
    await userModel.deleteById(user.id); // no dejar el usuario huérfano
    throw e;
  }

  return {
    reseller: { ...reseller, email, username: usuario },
    credenciales: { usuario, email, password },
  };
}

module.exports = { crearClienteConEstacion, aplicarLimitesPlan, crearReseller };
