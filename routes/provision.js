/**
 * routes/provision.js
 * ------------------------------------------------------------------
 * API de PROVISIONING para integraciones externas (facturación tipo WHMCS).
 * Montada en /api/provision. Autenticada por API key.
 *
 * Flujo típico:
 *   1) El sistema de facturación agrega este panel como "servidor".
 *   2) GET /test para probar la conexión (muestra radios creadas, etc.).
 *   3) Al pagar una orden → POST /servicios (crea la radio con su plan).
 *   4) Falta de pago → /suspender ; se paga → /reactivar ; baja → DELETE.
 * ------------------------------------------------------------------
 */
const express = require('express');
const crypto = require('crypto');

const apiKeyAuth = require('../middleware/apiKey');
const provisioning = require('../services/provisioning');
const clienteModel = require('../models/clienteModel');
const planModel = require('../models/planModel');
const planResellerModel = require('../models/planResellerModel');
const resellerModel = require('../models/resellerModel');
const servidorModel = require('../models/servidorModel');
const userModel = require('../models/userModel');
const azuracast = require('../services/azuracast');
const { agregarOyentes } = require('../services/stats');

const router = express.Router();
router.use(apiKeyAuth);
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const panelUrl = () => process.env.PANEL_URL || '';

/** GET /api/provision/test — prueba de conexión (como el "Test" de Centova). */
router.get('/test', wrap(async (req, res) => {
  const servidores = await servidorModel.findAllConUso();
  res.json({
    ok: true,
    panel: 'Panel Radio',
    total_servidores: servidores.length,
    total_radios: servidores.reduce((a, s) => a + s.radios, 0),
    servidores: servidores.map((s) => ({ nombre: s.nombre, radios: s.radios, capacidad: s.capacidad_radios, activo: s.activo })),
  });
}));

/** GET /api/provision/planes — planes disponibles (para mapear productos). */
router.get('/planes', wrap(async (req, res) => {
  const planes = await planModel.findGlobales();
  res.json({ planes: planes.map((p) => ({ id: p.id, nombre: p.nombre, max_bitrate: p.max_bitrate, max_oyentes: p.max_oyentes, espacio_mb: p.espacio_mb, permite_dj: p.permite_dj })) });
}));

/**
 * GET /api/provision/servicios — LISTA todas las radios (para sincronizar cuentas).
 * ?oyentes=1 incluye oyentes en vivo (más lento).
 */
router.get('/servicios', wrap(async (req, res) => {
  const clientes = await clienteModel.findAllWithEmail();
  let oyentesPorCliente = {};
  if (req.query.oyentes === '1') {
    const { ranking } = await agregarOyentes(clientes);
    ranking.forEach((r) => { oyentesPorCliente[r.cliente_id] = { oyentes: r.oyentes, online: r.online }; });
  }
  const servicios = clientes.map((c) => ({
    servicio_id: c.id,
    nombre_empresa: c.nombre_empresa,
    usuario: c.username,
    email: c.email,
    plan: c.plan,
    activo: c.activo,
    url_streaming: c.url_streaming,
    servidor_id: c.servidor_id,
    ...(req.query.oyentes === '1' ? { oyentes: oyentesPorCliente[c.id]?.oyentes || 0, al_aire: oyentesPorCliente[c.id]?.online || false } : {}),
  }));
  res.json({ total: servicios.length, servicios });
}));

/**
 * POST /api/provision/servicios — CREA una radio (CreateAccount).
 * body: { email, nombre_empresa, plan_id | plan, username?, password? }
 *
 * El identificador de acceso es `username`, NO el email: un mismo cliente
 * (mismo correo) puede contratar VARIAS radios, cada una con su servicio_id
 * y su propio usuario. Si no mandas `username` se genera del nombre de la radio.
 */
router.post('/servicios', wrap(async (req, res) => {
  const { email, nombre_empresa, plan_id, plan, password, username } = req.body || {};
  let pid = plan_id;
  if (!pid && plan) { const p = await planModel.findByNombre(plan); pid = p?.id; }
  if (!pid) return res.status(400).json({ error: 'Indica plan_id o plan (nombre) válido' });

  const pass = password || crypto.randomBytes(6).toString('hex');
  const r = await provisioning.crearClienteConEstacion({ email, username, password: pass, nombre_empresa, plan_id: pid });

  res.status(201).json({
    ok: true,
    servicio_id: r.cliente.id,
    login: { url: panelUrl(), usuario: r.credenciales.usuario, email: r.credenciales.email, password: r.credenciales.password },
    estacion: {
      id: r.cliente.azuracast_station_id,
      url_streaming: r.cliente.url_streaming,
      dj_usuario: r.cliente.dj_usuario || null,
      dj_password: r.cliente.dj_password || null,
      dj_puerto: r.cliente.dj_puerto || null,
    },
  });
}));

// ==================================================================
//  SERVICIOS DE REVENDEDOR (cuentas de mayorista vendidas por plan)
// ==================================================================

/** GET /api/provision/planes-reseller — paquetes de mayorista disponibles. */
router.get('/planes-reseller', wrap(async (req, res) => {
  const planes = await planResellerModel.findActivos();
  res.json({ planes: planes.map((p) => ({ id: p.id, nombre: p.nombre, cupo_radios: p.cupo_radios, max_oyentes_total: p.max_oyentes_total, espacio_total_mb: p.espacio_total_mb })) });
}));

/** GET /api/provision/resellers — lista de revendedores (sincronizar cuentas). */
router.get('/resellers', wrap(async (req, res) => {
  const resellers = await resellerModel.findAllWithEmail();
  res.json({
    total: resellers.length,
    resellers: resellers.map((r) => ({
      servicio_id: r.id, nombre_empresa: r.nombre_empresa, usuario: r.username, email: r.email,
      plan: r.plan, activo: r.activo,
      cupo_radios: r.cupo_radios, radios_usadas: r.radios_usadas,
      max_oyentes_total: r.max_oyentes_total, espacio_total_mb: r.espacio_total_mb,
    })),
  });
}));

/**
 * POST /api/provision/resellers — CREA una cuenta de revendedor (CreateAccount).
 * body: { email, nombre_empresa, plan_reseller_id | plan_reseller, username?, password? }
 * Igual que /servicios pero mayorista: en vez de una radio entrega un cupo.
 */
router.post('/resellers', wrap(async (req, res) => {
  const { email, nombre_empresa, plan_reseller_id, plan_reseller, username, password } = req.body || {};
  let pid = plan_reseller_id;
  if (!pid && plan_reseller) { const p = await planResellerModel.findByNombre(plan_reseller); pid = p?.id; }
  if (!pid) return res.status(400).json({ error: 'Indica plan_reseller_id o plan_reseller (nombre) válido' });

  const pass = password || crypto.randomBytes(6).toString('hex');
  const r = await provisioning.crearReseller({ email, username, password: pass, nombre_empresa, plan_reseller_id: pid });

  res.status(201).json({
    ok: true,
    servicio_id: r.reseller.id,
    tipo: 'reseller',
    login: { url: panelUrl(), usuario: r.credenciales.usuario, email: r.credenciales.email, password: r.credenciales.password },
    cupo: {
      plan: r.reseller.plan,
      radios: r.reseller.cupo_radios,
      oyentes_total: r.reseller.max_oyentes_total,
      espacio_total_mb: r.reseller.espacio_total_mb,
    },
  });
}));

/**
 * POST /api/provision/resellers/:id/suspender (SuspendAccount).
 * body: { radios: true|false } — por defecto TRUE: también saca del aire las
 * radios de sus clientes (comportamiento normal de facturación por impago).
 * Manda { "radios": false } para solo bloquearle el acceso a él.
 */
router.post('/resellers/:id/suspender', wrap(async (req, res) => {
  const r = await resellerModel.findById(Number(req.params.id));
  if (!r) return res.status(404).json({ error: 'Servicio no encontrado' });
  await resellerModel.update(r.id, { activo: false });

  let radios = 0;
  if (req.body?.radios !== false) {
    const clientes = await clienteModel.findByReseller(r.id);
    for (const c of clientes) {
      await clienteModel.update(c.id, { activo: false });
      if (c.azuracast_station_id) {
        const az = await azuracast.paraServidorId(c.servidor_id);
        try { await az.updateStation(c.azuracast_station_id, { is_enabled: false }); } catch (_) {}
        try { await az.stopStation(c.azuracast_station_id); } catch (_) {}
      }
      radios++;
    }
  }
  res.json({ ok: true, message: `Revendedor suspendido${radios ? ` (${radios} radios fuera del aire)` : ' (sus radios siguen al aire)'}`, radios_suspendidas: radios });
}));

/** POST /api/provision/resellers/:id/reactivar (UnsuspendAccount). */
router.post('/resellers/:id/reactivar', wrap(async (req, res) => {
  const r = await resellerModel.findById(Number(req.params.id));
  if (!r) return res.status(404).json({ error: 'Servicio no encontrado' });
  await resellerModel.update(r.id, { activo: true });

  let radios = 0;
  if (req.body?.radios !== false) {
    const clientes = await clienteModel.findByReseller(r.id);
    for (const c of clientes) {
      await clienteModel.update(c.id, { activo: true });
      if (c.azuracast_station_id) {
        const az = await azuracast.paraServidorId(c.servidor_id);
        try { await az.updateStation(c.azuracast_station_id, { is_enabled: true }); } catch (_) {}
        try { await az.restartStation(c.azuracast_station_id); } catch (_) {}
      }
      radios++;
    }
  }
  res.json({ ok: true, message: 'Revendedor reactivado', radios_reactivadas: radios });
}));

/** POST /api/provision/resellers/:id/plan — cambia el paquete (ChangePackage). */
router.post('/resellers/:id/plan', wrap(async (req, res) => {
  const r = await resellerModel.findById(Number(req.params.id));
  if (!r) return res.status(404).json({ error: 'Servicio no encontrado' });
  const { plan_reseller_id, plan_reseller } = req.body || {};
  const p = plan_reseller_id ? await planResellerModel.findById(Number(plan_reseller_id)) : await planResellerModel.findByNombre(plan_reseller);
  if (!p) return res.status(400).json({ error: 'Plan de revendedor no encontrado' });

  // En un downgrade no se le quitan radios ya creadas: solo no podrá crear más.
  const usadas = await clienteModel.countByReseller(r.id);
  const actualizado = await resellerModel.update(r.id, {
    plan: p.nombre, cupo_radios: p.cupo_radios,
    max_oyentes_total: p.max_oyentes_total, espacio_total_mb: p.espacio_total_mb,
  });
  res.json({
    ok: true, message: `Paquete cambiado a ${p.nombre}`,
    cupo_radios: actualizado.cupo_radios, radios_usadas: usadas,
    aviso: usadas > p.cupo_radios ? `Ya tiene ${usadas} radios y el nuevo cupo es ${p.cupo_radios}: no se le quitó ninguna, pero no podrá crear más.` : null,
  });
}));

/** DELETE /api/provision/resellers/:id — da de baja al revendedor (TerminateAccount).
 *  Sus radios NO se borran: quedan sin revendedor (pasan a ser directas del admin). */
router.delete('/resellers/:id', wrap(async (req, res) => {
  const r = await resellerModel.findById(Number(req.params.id));
  if (!r) return res.status(404).json({ error: 'Servicio no encontrado' });
  const usadas = await clienteModel.countByReseller(r.id);
  await userModel.deleteById(r.user_id); // cascade borra el reseller; los clientes quedan con reseller_id NULL
  res.json({ ok: true, message: 'Revendedor terminado', radios_liberadas: usadas });
}));

/** GET /api/provision/resellers/:id — estado y uso del revendedor. */
router.get('/resellers/:id', wrap(async (req, res) => {
  const r = await resellerModel.findById(Number(req.params.id));
  if (!r) return res.status(404).json({ error: 'Servicio no encontrado' });
  const user = await userModel.findById(r.user_id);
  const usadas = await clienteModel.countByReseller(r.id);
  const uso = await resellerModel.usoRecursos(r.id);
  res.json({
    ok: true, servicio_id: r.id, tipo: 'reseller',
    nombre_empresa: r.nombre_empresa, usuario: user?.username, email: user?.email,
    plan: r.plan, activo: r.activo,
    uso: {
      radios: usadas, cupo_radios: r.cupo_radios,
      oyentes: uso.oyentes, max_oyentes_total: r.max_oyentes_total,
      espacio_mb: uso.espacio, espacio_total_mb: r.espacio_total_mb,
    },
  });
}));

/** POST /api/provision/servicios/:id/suspender (SuspendAccount). */
router.post('/servicios/:id/suspender', wrap(async (req, res) => {
  const c = await clienteModel.findById(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Servicio no encontrado' });
  await clienteModel.update(c.id, { activo: false });
  if (c.azuracast_station_id) {
    const az = await azuracast.paraServidorId(c.servidor_id);
    try { await az.updateStation(c.azuracast_station_id, { is_enabled: false }); } catch (_) {}
    try { await az.stopStation(c.azuracast_station_id); } catch (_) {}
  }
  res.json({ ok: true, message: 'Servicio suspendido' });
}));

/** POST /api/provision/servicios/:id/reactivar (UnsuspendAccount). */
router.post('/servicios/:id/reactivar', wrap(async (req, res) => {
  const c = await clienteModel.findById(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Servicio no encontrado' });
  await clienteModel.update(c.id, { activo: true });
  if (c.azuracast_station_id) {
    const az = await azuracast.paraServidorId(c.servidor_id);
    try { await az.updateStation(c.azuracast_station_id, { is_enabled: true }); } catch (_) {}
    try { await az.restartStation(c.azuracast_station_id); } catch (_) {}
  }
  res.json({ ok: true, message: 'Servicio reactivado' });
}));

/** POST /api/provision/servicios/:id/plan — cambia el plan (ChangePackage). */
router.post('/servicios/:id/plan', wrap(async (req, res) => {
  const c = await clienteModel.findById(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Servicio no encontrado' });
  const { plan_id, plan } = req.body || {};
  const p = plan_id ? await planModel.findById(Number(plan_id)) : await planModel.findByNombre(plan);
  if (!p) return res.status(400).json({ error: 'Plan no encontrado' });
  await clienteModel.update(c.id, { plan: p.nombre });
  if (c.azuracast_station_id) {
    const az = await azuracast.paraServidorId(c.servidor_id);
    await provisioning.aplicarLimitesPlan(c.azuracast_station_id, p, az);
  }
  res.json({ ok: true, message: `Plan cambiado a ${p.nombre}` });
}));

/** DELETE /api/provision/servicios/:id — elimina (TerminateAccount). */
router.delete('/servicios/:id', wrap(async (req, res) => {
  const c = await clienteModel.findById(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Servicio no encontrado' });
  if (c.azuracast_station_id) {
    const az = await azuracast.paraServidorId(c.servidor_id);
    try { await az.deleteStation(c.azuracast_station_id); } catch (e) { console.error(e.message); }
  }
  await userModel.deleteById(c.user_id);
  res.json({ ok: true, message: 'Servicio terminado' });
}));

/** GET /api/provision/servicios/:id — estado/uso del servicio. */
router.get('/servicios/:id', wrap(async (req, res) => {
  const c = await clienteModel.findById(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Servicio no encontrado' });
  const { oyentes_totales, al_aire } = await agregarOyentes([c]);
  res.json({
    ok: true, servicio_id: c.id, nombre: c.nombre_empresa, plan: c.plan,
    activo: c.activo, al_aire: al_aire > 0, oyentes: oyentes_totales, url_streaming: c.url_streaming,
  });
}));

module.exports = router;
