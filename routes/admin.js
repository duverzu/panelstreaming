/**
 * routes/admin.js
 * ------------------------------------------------------------------
 * Panel Super Admin — rutas montadas bajo /admin
 * ------------------------------------------------------------------
 */

const express = require('express');
const { db, nextId, bcrypt } = require('../config/database');
const { generateToken } = require('../services/auth');
const azuracast = require('../services/azuracast');
const authFactory = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');

const router = express.Router();

// Middleware combinado: valida token de admin + confirma rol.
const requireAdmin = [authFactory('admin'), isAdmin];

// ==================================================================
//  AUTENTICACIÓN
// ==================================================================

/**
 * POST /admin/login
 * body: { email, password }
 * -> token JWT de admin
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email y password son requeridos' });
  }

  const user = db.users.find((u) => u.email === email && u.role === 'admin');
  if (!user) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const token = generateToken(user.id, 'admin');
  res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
});

/**
 * POST /admin/logout
 * Con JWT stateless, el logout real se hace en el cliente borrando el token.
 * (En el futuro: blacklist de tokens en Redis/BD.)
 */
router.post('/logout', requireAdmin, (req, res) => {
  res.json({ message: 'Sesión cerrada. Elimina el token en el cliente.' });
});

// ==================================================================
//  GESTIÓN DE CLIENTES
// ==================================================================

/**
 * GET /admin/clientes
 * Lista todos los clientes con su email de acceso.
 */
router.get('/clientes', requireAdmin, (req, res) => {
  const clientes = db.clientes.map((c) => {
    const user = db.users.find((u) => u.id === c.user_id);
    return { ...c, email: user?.email || null };
  });
  res.json({ clientes });
});

/**
 * POST /admin/clientes/crear
 * body: { email, password, nombre_empresa, plan }
 * - Crea user + cliente en memoria.
 * - (Mock) crea estación en AzuraCast: por ahora la dejamos comentada
 *   para no depender de la conexión real. Descomenta cuando integres.
 */
router.post('/clientes/crear', requireAdmin, async (req, res) => {
  const { email, password, nombre_empresa, plan = 'basico' } = req.body || {};

  if (!email || !password || !nombre_empresa) {
    return res.status(400).json({ error: 'email, password y nombre_empresa son requeridos' });
  }

  if (db.users.some((u) => u.email === email)) {
    return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
  }

  // 1) Crear usuario
  const userId = nextId('users');
  const user = {
    id: userId,
    email,
    password_hash: await bcrypt.hash(password, 10),
    role: 'cliente',
    created_at: new Date().toISOString(),
  };
  db.users.push(user);

  // 2) (Integración real futura) crear estación en AzuraCast
  let stationId = null;
  let urlStreaming = null;
  // try {
  //   const station = await azuracast.createStation(nombre_empresa);
  //   stationId = station.id;
  //   urlStreaming = station.listen_url || null;
  // } catch (err) {
  //   return res.status(err.status || 502).json({ error: err.message });
  // }

  // 3) Crear cliente
  const clienteId = nextId('clientes');
  const cliente = {
    id: clienteId,
    user_id: userId,
    nombre_empresa,
    plan,
    azuracast_station_id: stationId,
    url_streaming: urlStreaming,
    created_at: new Date().toISOString(),
    activo: true,
  };
  db.clientes.push(cliente);

  res.status(201).json({
    message: 'Cliente creado ✅',
    cliente: { ...cliente, email },
    credenciales: { email, password }, // para compartir con el cliente
  });
});

/**
 * PUT /admin/clientes/:id
 * Edita datos del cliente (nombre_empresa, plan, activo).
 */
router.put('/clientes/:id', requireAdmin, (req, res) => {
  const cliente = db.clientes.find((c) => c.id === Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const { nombre_empresa, plan, activo } = req.body || {};
  if (nombre_empresa !== undefined) cliente.nombre_empresa = nombre_empresa;
  if (plan !== undefined) cliente.plan = plan;
  if (activo !== undefined) cliente.activo = Boolean(activo);

  res.json({ message: 'Cliente actualizado ✅', cliente });
});

/**
 * DELETE /admin/clientes/:id
 * Elimina cliente + su usuario (y, en el futuro, su estación en AzuraCast).
 */
router.delete('/clientes/:id', requireAdmin, async (req, res) => {
  const idx = db.clientes.findIndex((c) => c.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Cliente no encontrado' });

  const cliente = db.clientes[idx];

  // (Integración real futura) eliminar estación en AzuraCast
  // if (cliente.azuracast_station_id) {
  //   try { await azuracast.deleteStation(cliente.azuracast_station_id); }
  //   catch (err) { return res.status(err.status || 502).json({ error: err.message }); }
  // }

  db.clientes.splice(idx, 1);
  const userIdx = db.users.findIndex((u) => u.id === cliente.user_id);
  if (userIdx !== -1) db.users.splice(userIdx, 1);

  res.json({ message: 'Cliente eliminado ✅' });
});

/**
 * GET /admin/clientes/:id/estacion
 * Detalles de la estación del cliente (desde AzuraCast).
 */
router.get('/clientes/:id/estacion', requireAdmin, async (req, res) => {
  const cliente = db.clientes.find((c) => c.id === Number(req.params.id));
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
});

// ==================================================================
//  ESTADÍSTICAS GLOBALES
// ==================================================================

/**
 * GET /admin/estadisticas
 * Métricas globales (mock por ahora).
 */
router.get('/estadisticas', requireAdmin, (req, res) => {
  res.json({
    total_clientes: db.clientes.length,
    clientes_activos: db.clientes.filter((c) => c.activo).length,
    estaciones: db.clientes.filter((c) => c.azuracast_station_id).length,
    oyentes_totales: 0, // TODO: agregar sumando nowplaying de cada estación
  });
});

/**
 * GET /admin/estadisticas/cliente/:id
 * Estadísticas de un cliente concreto (mock).
 */
router.get('/estadisticas/cliente/:id', requireAdmin, (req, res) => {
  const cliente = db.clientes.find((c) => c.id === Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json({ cliente_id: cliente.id, oyentes_hoy: 0, oyentes_semana: 0, oyentes_mes: 0 });
});

// ==================================================================
//  FACTURACIÓN / SUSCRIPCIONES
// ==================================================================

/** GET /admin/suscripciones */
router.get('/suscripciones', requireAdmin, (req, res) => {
  res.json({ suscripciones: db.suscripciones });
});

/** POST /admin/suscripciones/crear  body: { cliente_id, plan_tipo, precio_mensual } */
router.post('/suscripciones/crear', requireAdmin, (req, res) => {
  const { cliente_id, plan_tipo, precio_mensual } = req.body || {};
  if (!cliente_id || !plan_tipo || precio_mensual === undefined) {
    return res.status(400).json({ error: 'cliente_id, plan_tipo y precio_mensual son requeridos' });
  }
  if (!db.clientes.some((c) => c.id === Number(cliente_id))) {
    return res.status(404).json({ error: 'Cliente no encontrado' });
  }

  const suscripcion = {
    id: nextId('suscripciones'),
    cliente_id: Number(cliente_id),
    plan_tipo,
    precio_mensual: Number(precio_mensual),
    fecha_inicio: new Date().toISOString(),
    fecha_proxima_renovacion: null,
    estado: 'activa',
  };
  db.suscripciones.push(suscripcion);
  res.status(201).json({ message: 'Suscripción creada ✅', suscripcion });
});

/** PUT /admin/suscripciones/:id  body: { plan_tipo, precio_mensual, estado } */
router.put('/suscripciones/:id', requireAdmin, (req, res) => {
  const sus = db.suscripciones.find((s) => s.id === Number(req.params.id));
  if (!sus) return res.status(404).json({ error: 'Suscripción no encontrada' });

  const { plan_tipo, precio_mensual, estado } = req.body || {};
  if (plan_tipo !== undefined) sus.plan_tipo = plan_tipo;
  if (precio_mensual !== undefined) sus.precio_mensual = Number(precio_mensual);
  if (estado !== undefined) sus.estado = estado;

  res.json({ message: 'Suscripción actualizada ✅', suscripcion: sus });
});

module.exports = router;
