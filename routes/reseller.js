/**
 * routes/reseller.js
 * ------------------------------------------------------------------
 * Panel del REVENDEDOR — montado en /api/reseller.
 * Solo puede gestionar SUS propios clientes, hasta su cupo de radios.
 * ------------------------------------------------------------------
 */
const express = require('express');

const userModel = require('../models/userModel');
const clienteModel = require('../models/clienteModel');
const resellerModel = require('../models/resellerModel');
const planModel = require('../models/planModel');
const provisioning = require('../services/provisioning');
const azuracast = require('../services/azuracast');
const { generateToken } = require('../services/auth');
const authFactory = require('../middleware/auth');
const isReseller = require('../middleware/isReseller');

const router = express.Router();
const requireReseller = [authFactory('reseller'), isReseller];
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Carga el revendedor del token y verifica que un cliente le pertenezca. */
async function getReseller(req) {
  return resellerModel.findById(req.user.reseller_id);
}
async function clientePropio(req, id) {
  const cliente = await clienteModel.findById(Number(id));
  if (!cliente || cliente.reseller_id !== req.user.reseller_id) return null;
  return cliente;
}

// ---- Perfil / cupo -----------------------------------------------
router.get('/perfil', requireReseller, wrap(async (req, res) => {
  const reseller = await getReseller(req);
  if (!reseller) return res.status(404).json({ error: 'Revendedor no encontrado' });
  const usadas = await clienteModel.countByReseller(reseller.id);
  const uso = await resellerModel.usoRecursos(reseller.id);
  res.json({
    perfil: {
      nombre_empresa: reseller.nombre_empresa,
      cupo_radios: reseller.cupo_radios,
      radios_usadas: usadas,
      disponibles: Math.max(0, reseller.cupo_radios - usadas),
      max_oyentes_total: reseller.max_oyentes_total,
      oyentes_usados: uso.oyentes,
      espacio_total_mb: reseller.espacio_total_mb,
      espacio_usado_mb: uso.espacio,
    },
  });
}));

// ---- Planes: globales (del admin) + los propios del revendedor ----
router.get('/planes', requireReseller, wrap(async (req, res) => {
  res.json({ planes: await planModel.findParaReseller(req.user.reseller_id) });
}));

router.post('/planes', requireReseller, wrap(async (req, res) => {
  if (!req.body?.nombre) return res.status(400).json({ error: 'nombre es requerido' });
  const plan = await planModel.create({ ...req.body, reseller_id: req.user.reseller_id });
  res.status(201).json({ message: 'Plan creado ✅', plan });
}));

router.put('/planes/:id', requireReseller, wrap(async (req, res) => {
  const plan = await planModel.findById(Number(req.params.id));
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
  if (plan.reseller_id !== req.user.reseller_id) return res.status(403).json({ error: 'Solo puedes editar tus propios planes' });
  const actualizado = await planModel.update(plan.id, req.body || {});
  res.json({ message: 'Plan actualizado ✅', plan: actualizado });
}));

router.delete('/planes/:id', requireReseller, wrap(async (req, res) => {
  const plan = await planModel.findById(Number(req.params.id));
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
  if (plan.reseller_id !== req.user.reseller_id) return res.status(403).json({ error: 'Solo puedes eliminar tus propios planes' });
  await planModel.deleteById(plan.id);
  res.json({ message: 'Plan eliminado ✅' });
}));

// ---- Estadísticas del revendedor (sus radios) --------------------
router.get('/estadisticas', requireReseller, wrap(async (req, res) => {
  const clientes = await clienteModel.findByReseller(req.user.reseller_id);
  const porStation = {};
  clientes.forEach((c) => { if (c.azuracast_station_id) porStation[c.azuracast_station_id] = c; });

  let oyentes_totales = 0;
  let al_aire = 0;
  const ranking = [];
  try {
    const np = await azuracast.getNowPlayingAll();
    (np || []).forEach((est) => {
      const cli = porStation[est.station?.id];
      if (!cli) return;
      const oy = est.listeners?.current || 0;
      oyentes_totales += oy;
      if (est.is_online) al_aire += 1;
      ranking.push({ cliente_id: cli.id, nombre: cli.nombre_empresa, oyentes: oy, online: !!est.is_online });
    });
    ranking.sort((a, b) => b.oyentes - a.oyentes);
  } catch (e) { console.error('[reseller stats]', e.message); }

  res.json({
    total_radios: clientes.length,
    activas: clientes.filter((c) => c.activo).length,
    estaciones: Object.keys(porStation).length,
    oyentes_totales, al_aire, ranking,
  });
}));

// ---- Sus clientes ------------------------------------------------
router.get('/clientes', requireReseller, wrap(async (req, res) => {
  res.json({ clientes: await clienteModel.findByReseller(req.user.reseller_id) });
}));

router.get('/clientes/estados', requireReseller, wrap(async (req, res) => {
  const clientes = await clienteModel.findByReseller(req.user.reseller_id);
  const estados = {};
  await Promise.all(clientes.map(async (c) => {
    if (!c.activo) { estados[c.id] = 'suspendido'; return; }
    if (!c.azuracast_station_id) { estados[c.id] = 'sin-estacion'; return; }
    try {
      const st = await azuracast.getStationStatus(c.azuracast_station_id);
      estados[c.id] = st.backendRunning ? 'online' : 'offline';
    } catch { estados[c.id] = 'error'; }
  }));
  res.json({ estados });
}));

/** POST /reseller/clientes/crear — crea una radio si le queda cupo. */
router.post('/clientes/crear', requireReseller, wrap(async (req, res) => {
  const reseller = await getReseller(req);
  if (!reseller || !reseller.activo) return res.status(403).json({ error: 'Tu cuenta de revendedor no está activa' });

  const usadas = await clienteModel.countByReseller(reseller.id);
  if (usadas >= reseller.cupo_radios) {
    return res.status(403).json({ error: `Cupo agotado (${usadas}/${reseller.cupo_radios} radios). Pide más cupo al administrador.` });
  }

  const { email, password, nombre_empresa, plan_id } = req.body || {};

  // Verificar límites agregados de la cuenta (oyentes y espacio totales)
  const plan = await planModel.findById(Number(plan_id));
  if (!plan) return res.status(400).json({ error: 'Plan no encontrado' });
  const uso = await resellerModel.usoRecursos(reseller.id);
  if (uso.oyentes + plan.max_oyentes > reseller.max_oyentes_total) {
    return res.status(403).json({ error: `Sin oyentes disponibles: usarías ${uso.oyentes + plan.max_oyentes}/${reseller.max_oyentes_total}. Elige un plan menor o pide más al administrador.` });
  }
  if (uso.espacio + plan.espacio_mb > reseller.espacio_total_mb) {
    return res.status(403).json({ error: `Sin espacio disponible: usarías ${uso.espacio + plan.espacio_mb}/${reseller.espacio_total_mb} MB. Elige un plan menor o pide más al administrador.` });
  }

  const resultado = await provisioning.crearClienteConEstacion({
    email, password, nombre_empresa, plan_id, reseller_id: reseller.id,
  });
  res.status(201).json({ message: 'Cliente y estación creados ✅', ...resultado });
}));

router.delete('/clientes/:id', requireReseller, wrap(async (req, res) => {
  const cliente = await clientePropio(req, req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (cliente.azuracast_station_id) {
    try { await azuracast.deleteStation(cliente.azuracast_station_id); } catch (e) { console.error(e.message); }
  }
  await userModel.deleteById(cliente.user_id);
  res.json({ message: 'Cliente eliminado ✅' });
}));

// ---- Controles (solo sus clientes) -------------------------------
async function control(req, res, accion) {
  const cliente = await clientePropio(req, req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (!cliente.azuracast_station_id) return res.status(400).json({ error: 'Sin estación' });
  await accion(cliente);
  res.json({ message: 'Listo ✅' });
}
router.post('/clientes/:id/iniciar', requireReseller, wrap((req, res) => control(req, res, (c) => azuracast.restartStation(c.azuracast_station_id))));
router.post('/clientes/:id/parar', requireReseller, wrap((req, res) => control(req, res, (c) => azuracast.stopStation(c.azuracast_station_id))));

router.post('/clientes/:id/suspender', requireReseller, wrap(async (req, res) => {
  const cliente = await clientePropio(req, req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  await clienteModel.update(cliente.id, { activo: false });
  if (cliente.azuracast_station_id) {
    try { await azuracast.updateStation(cliente.azuracast_station_id, { is_enabled: false }); } catch (_) {}
    try { await azuracast.stopStation(cliente.azuracast_station_id); } catch (_) {}
  }
  res.json({ message: 'Cliente suspendido ✅' });
}));
router.post('/clientes/:id/reactivar', requireReseller, wrap(async (req, res) => {
  const cliente = await clientePropio(req, req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  await clienteModel.update(cliente.id, { activo: true });
  if (cliente.azuracast_station_id) {
    try { await azuracast.updateStation(cliente.azuracast_station_id, { is_enabled: true }); } catch (_) {}
    try { await azuracast.restartStation(cliente.azuracast_station_id); } catch (_) {}
  }
  res.json({ message: 'Cliente reactivado ✅' });
}));

/** POST /reseller/clientes/:id/impersonar — entrar al panel de SU cliente. */
router.post('/clientes/:id/impersonar', requireReseller, wrap(async (req, res) => {
  const cliente = await clientePropio(req, req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  const user = await userModel.findById(cliente.user_id);
  const token = generateToken(user.id, 'cliente', { cliente_id: cliente.id, impersonated_by: req.user.sub });
  res.json({ token, cliente: { id: cliente.id, nombre_empresa: cliente.nombre_empresa, email: user.email } });
}));

module.exports = router;
