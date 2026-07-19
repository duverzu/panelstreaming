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
 * POST /api/provision/servicios — CREA una radio (CreateAccount).
 * body: { email, nombre_empresa, plan_id | plan, password? }
 */
router.post('/servicios', wrap(async (req, res) => {
  const { email, nombre_empresa, plan_id, plan, password } = req.body || {};
  let pid = plan_id;
  if (!pid && plan) { const p = await planModel.findByNombre(plan); pid = p?.id; }
  if (!pid) return res.status(400).json({ error: 'Indica plan_id o plan (nombre) válido' });

  const pass = password || crypto.randomBytes(6).toString('hex');
  const r = await provisioning.crearClienteConEstacion({ email, password: pass, nombre_empresa, plan_id: pid });

  res.status(201).json({
    ok: true,
    servicio_id: r.cliente.id,
    login: { url: panelUrl(), email: r.credenciales.email, password: r.credenciales.password },
    estacion: {
      id: r.cliente.azuracast_station_id,
      url_streaming: r.cliente.url_streaming,
      dj_usuario: r.cliente.dj_usuario || null,
      dj_password: r.cliente.dj_password || null,
      dj_puerto: r.cliente.dj_puerto || null,
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
