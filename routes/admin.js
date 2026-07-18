/**
 * routes/admin.js
 * ------------------------------------------------------------------
 * Panel Super Admin — rutas montadas bajo /admin
 * Ahora con PostgreSQL real vía la capa de modelos.
 * ------------------------------------------------------------------
 */

const express = require('express');
const bcrypt = require('bcryptjs');

const userModel = require('../models/userModel');
const clienteModel = require('../models/clienteModel');
const suscripcionModel = require('../models/suscripcionModel');
const { generateToken } = require('../services/auth');
const azuracast = require('../services/azuracast');
const authFactory = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');

const router = express.Router();

const requireAdmin = [authFactory('admin'), isAdmin];

/** Envuelve un handler async para que los errores caigan en el manejador global. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ==================================================================
//  AUTENTICACIÓN
// ==================================================================

router.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email y password son requeridos' });
  }

  const user = await userModel.findByEmailAndRole(email, 'admin');
  if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

  const token = generateToken(user.id, 'admin');
  res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
}));

router.post('/logout', requireAdmin, (req, res) => {
  res.json({ message: 'Sesión cerrada. Elimina el token en el cliente.' });
});

// ==================================================================
//  GESTIÓN DE CLIENTES
// ==================================================================

router.get('/clientes', requireAdmin, wrap(async (req, res) => {
  const clientes = await clienteModel.findAllWithEmail();
  res.json({ clientes });
}));

/**
 * POST /admin/clientes/crear
 * body: { email, password, nombre_empresa, plan }
 */
router.post('/clientes/crear', requireAdmin, wrap(async (req, res) => {
  const { email, password, nombre_empresa, plan = 'basico' } = req.body || {};
  if (!email || !password || !nombre_empresa) {
    return res.status(400).json({ error: 'email, password y nombre_empresa son requeridos' });
  }

  const existente = await userModel.findByEmail(email);
  if (existente) return res.status(409).json({ error: 'Ya existe un usuario con ese email' });

  // 1) Crear usuario
  const password_hash = await bcrypt.hash(password, 10);
  const user = await userModel.create({ email, password_hash, role: 'cliente' });

  // 2) (Integración real futura) crear estación en AzuraCast
  let azuracast_station_id = null;
  let url_streaming = null;
  // try {
  //   const station = await azuracast.createStation(nombre_empresa);
  //   azuracast_station_id = station.id;
  //   url_streaming = station.listen_url || null;
  // } catch (err) {
  //   await userModel.deleteById(user.id); // rollback del usuario
  //   return res.status(err.status || 502).json({ error: err.message });
  // }

  // 3) Crear cliente
  const cliente = await clienteModel.create({
    user_id: user.id,
    nombre_empresa,
    plan,
    azuracast_station_id,
    url_streaming,
  });

  res.status(201).json({
    message: 'Cliente creado ✅',
    cliente: { ...cliente, email },
    credenciales: { email, password },
  });
}));

router.put('/clientes/:id', requireAdmin, wrap(async (req, res) => {
  const cliente = await clienteModel.findById(Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const { nombre_empresa, plan, activo } = req.body || {};
  const actualizado = await clienteModel.update(cliente.id, {
    nombre_empresa,
    plan,
    activo: activo === undefined ? undefined : Boolean(activo),
  });

  res.json({ message: 'Cliente actualizado ✅', cliente: actualizado });
}));

/**
 * DELETE /admin/clientes/:id
 * Borra el usuario; por las FK en cascada arrastra el cliente, su media y suscripciones.
 */
router.delete('/clientes/:id', requireAdmin, wrap(async (req, res) => {
  const cliente = await clienteModel.findById(Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  // (Integración real futura) eliminar estación en AzuraCast
  // if (cliente.azuracast_station_id) {
  //   try { await azuracast.deleteStation(cliente.azuracast_station_id); }
  //   catch (err) { return res.status(err.status || 502).json({ error: err.message }); }
  // }

  await userModel.deleteById(cliente.user_id);
  res.json({ message: 'Cliente eliminado ✅' });
}));

router.get('/clientes/:id/estacion', requireAdmin, wrap(async (req, res) => {
  const cliente = await clienteModel.findById(Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (!cliente.azuracast_station_id) {
    return res.status(404).json({ error: 'El cliente no tiene estación asignada aún' });
  }

  try {
    const station = await azuracast.getStation(cliente.azuracast_station_id);
    res.json({ station });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
}));

// ==================================================================
//  ESTADÍSTICAS GLOBALES
// ==================================================================

router.get('/estadisticas', requireAdmin, wrap(async (req, res) => {
  const s = await clienteModel.stats();
  res.json({ ...s, oyentes_totales: 0 }); // TODO: sumar nowplaying de cada estación
}));

router.get('/estadisticas/cliente/:id', requireAdmin, wrap(async (req, res) => {
  const cliente = await clienteModel.findById(Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json({ cliente_id: cliente.id, oyentes_hoy: 0, oyentes_semana: 0, oyentes_mes: 0 });
}));

// ==================================================================
//  FACTURACIÓN / SUSCRIPCIONES
// ==================================================================

router.get('/suscripciones', requireAdmin, wrap(async (req, res) => {
  const suscripciones = await suscripcionModel.findAll();
  res.json({ suscripciones });
}));

router.post('/suscripciones/crear', requireAdmin, wrap(async (req, res) => {
  const { cliente_id, plan_tipo, precio_mensual } = req.body || {};
  if (!cliente_id || !plan_tipo || precio_mensual === undefined) {
    return res.status(400).json({ error: 'cliente_id, plan_tipo y precio_mensual son requeridos' });
  }

  const cliente = await clienteModel.findById(Number(cliente_id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const suscripcion = await suscripcionModel.create({
    cliente_id: Number(cliente_id),
    plan_tipo,
    precio_mensual: Number(precio_mensual),
  });
  res.status(201).json({ message: 'Suscripción creada ✅', suscripcion });
}));

router.put('/suscripciones/:id', requireAdmin, wrap(async (req, res) => {
  const existente = await suscripcionModel.findById(Number(req.params.id));
  if (!existente) return res.status(404).json({ error: 'Suscripción no encontrada' });

  const { plan_tipo, precio_mensual, estado } = req.body || {};
  const suscripcion = await suscripcionModel.update(existente.id, {
    plan_tipo,
    precio_mensual: precio_mensual === undefined ? undefined : Number(precio_mensual),
    estado,
  });
  res.json({ message: 'Suscripción actualizada ✅', suscripcion });
}));

module.exports = router;
