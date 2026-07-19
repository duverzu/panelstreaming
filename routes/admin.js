/**
 * routes/admin.js
 * ------------------------------------------------------------------
 * Panel Super Admin — rutas montadas bajo /admin
 * Ahora con PostgreSQL real vía la capa de modelos.
 * ------------------------------------------------------------------
 */

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const userModel = require('../models/userModel');
const clienteModel = require('../models/clienteModel');
const suscripcionModel = require('../models/suscripcionModel');
const planModel = require('../models/planModel');
const resellerModel = require('../models/resellerModel');
const biblioteca = require('../services/biblioteca');
const provisioning = require('../services/provisioning');
const { generateToken } = require('../services/auth');
// generateToken se usa también para emitir tokens de cliente al impersonar
const azuracast = require('../services/azuracast');
const authFactory = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');

const router = express.Router();

const requireAdmin = [authFactory('admin'), isAdmin];

/** Envuelve un handler async para que los errores caigan en el manejador global. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Formatea bytes a algo legible (B/KB/MB/GB/TB). */
function humanBytes(n) {
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = Number(n) || 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return v.toFixed(1) + ' ' + u[i];
}

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
 * body: { email, password, nombre_empresa, plan_id }
 * Crea el usuario + APROVISIONA la estación real en AzuraCast (aplicando el plan).
 */
router.post('/clientes/crear', requireAdmin, wrap(async (req, res) => {
  const { email, password, nombre_empresa, plan_id } = req.body || {};
  const resultado = await provisioning.crearClienteConEstacion({ email, password, nombre_empresa, plan_id });
  res.status(201).json({ message: 'Cliente y estación creados ✅', ...resultado });
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

  // Eliminar la estación en AzuraCast (si falla, seguimos borrando en la BD igual)
  if (cliente.azuracast_station_id) {
    try {
      await azuracast.deleteStation(cliente.azuracast_station_id);
    } catch (err) {
      console.error('[DELETE cliente] no se pudo borrar estación:', err.message);
    }
  }

  await userModel.deleteById(cliente.user_id);
  res.json({ message: 'Cliente eliminado ✅' });
}));

/**
 * POST /admin/clientes/:id/impersonar
 * Emite un token de CLIENTE para que el super admin entre a revisar el
 * panel de ese cliente. El token incluye `impersonated_by` con el id del admin.
 */
router.post('/clientes/:id/impersonar', requireAdmin, wrap(async (req, res) => {
  const cliente = await clienteModel.findById(Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const user = await userModel.findById(cliente.user_id);
  if (!user) return res.status(404).json({ error: 'Usuario del cliente no encontrado' });

  const token = generateToken(user.id, 'cliente', {
    cliente_id: cliente.id,
    impersonated_by: req.user.sub,
  });

  res.json({
    token,
    cliente: { id: cliente.id, nombre_empresa: cliente.nombre_empresa, email: user.email },
  });
}));

/**
 * GET /admin/clientes/estados
 * Estado de la estación de cada cliente (online/offline/suspendido/sin-estacion).
 */
router.get('/clientes/estados', requireAdmin, wrap(async (req, res) => {
  const clientes = await clienteModel.findAllWithEmail();
  const estados = {};
  await Promise.all(clientes.map(async (c) => {
    if (!c.activo) { estados[c.id] = 'suspendido'; return; }
    if (!c.azuracast_station_id) { estados[c.id] = 'sin-estacion'; return; }
    try {
      const st = await azuracast.getStationStatus(c.azuracast_station_id);
      estados[c.id] = st.backendRunning ? 'online' : 'offline';
    } catch {
      estados[c.id] = 'error';
    }
  }));
  res.json({ estados });
}));

/** POST /admin/clientes/:id/reaplicar-plan — vuelve a empujar los límites del plan a la estación. */
router.post('/clientes/:id/reaplicar-plan', requireAdmin, wrap(async (req, res) => {
  const cliente = await clienteModel.findById(Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (!cliente.azuracast_station_id) return res.status(400).json({ error: 'El cliente no tiene estación' });
  const plan = await planModel.findByNombre(cliente.plan);
  if (!plan) return res.status(400).json({ error: `El plan "${cliente.plan}" ya no existe` });
  await provisioning.aplicarLimitesPlan(cliente.azuracast_station_id, plan);
  res.json({ message: 'Límites del plan re-aplicados ✅' });
}));

/** POST /admin/clientes/:id/iniciar — pone la estación al aire (restart). */
router.post('/clientes/:id/iniciar', requireAdmin, wrap(async (req, res) => {
  const cliente = await clienteModel.findById(Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (!cliente.azuracast_station_id) return res.status(400).json({ error: 'El cliente no tiene estación' });
  await azuracast.restartStation(cliente.azuracast_station_id);
  res.json({ message: 'Estación al aire ✅' });
}));

/** POST /admin/clientes/:id/biblioteca — copia la música de cortesía a la estación. */
router.post('/clientes/:id/biblioteca', requireAdmin, wrap(async (req, res) => {
  const cliente = await clienteModel.findById(Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (!cliente.azuracast_station_id) return res.status(400).json({ error: 'El cliente no tiene estación' });
  const r = await biblioteca.copiarAEstacion(cliente.azuracast_station_id);
  if (!r.total) return res.json({ message: 'No hay música en la biblioteca del servidor todavía.', ...r });
  res.json({ message: `Música de cortesía agregada: ${r.copiados}/${r.total} tracks ✅`, ...r });
}));

/** POST /admin/clientes/:id/parar — detiene la transmisión (sin suspender). */
router.post('/clientes/:id/parar', requireAdmin, wrap(async (req, res) => {
  const cliente = await clienteModel.findById(Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (!cliente.azuracast_station_id) return res.status(400).json({ error: 'El cliente no tiene estación' });
  await azuracast.stopStation(cliente.azuracast_station_id);
  res.json({ message: 'Transmisión detenida ✅' });
}));

/** POST /admin/clientes/:id/suspender — desactiva el cliente y apaga su estación. */
router.post('/clientes/:id/suspender', requireAdmin, wrap(async (req, res) => {
  const cliente = await clienteModel.findById(Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  await clienteModel.update(cliente.id, { activo: false });
  if (cliente.azuracast_station_id) {
    try { await azuracast.updateStation(cliente.azuracast_station_id, { is_enabled: false }); } catch (_) {}
    try { await azuracast.stopStation(cliente.azuracast_station_id); } catch (_) {}
  }
  res.json({ message: 'Cliente suspendido ✅' });
}));

/** POST /admin/clientes/:id/reactivar — reactiva el cliente y pone su estación al aire. */
router.post('/clientes/:id/reactivar', requireAdmin, wrap(async (req, res) => {
  const cliente = await clienteModel.findById(Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  await clienteModel.update(cliente.id, { activo: true });
  if (cliente.azuracast_station_id) {
    try { await azuracast.updateStation(cliente.azuracast_station_id, { is_enabled: true }); } catch (_) {}
    try { await azuracast.restartStation(cliente.azuracast_station_id); } catch (_) {}
  }
  res.json({ message: 'Cliente reactivado ✅' });
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
//  MONITOREO DEL SERVIDOR (VPS)
// ==================================================================

/**
 * GET /admin/servidor
 * Métricas del VPS (CPU, RAM, disco) tomadas de AzuraCast, ya simplificadas.
 */
router.get('/servidor', requireAdmin, wrap(async (req, res) => {
  const s = await azuracast.getServerStats();

  const memTotal = Number(s.memory?.total_bytes || 0);
  const memFree = Number(s.memory?.free_bytes || 0);
  const memUsed = Math.max(0, memTotal - memFree);

  const diskTotal = Number(s.disk?.total_bytes || 0);
  const diskUsed = Number(s.disk?.used_bytes || 0);

  const pct = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);

  // Velocidad de salida actual (suma de interfaces reales, sin loopback)
  let txBytes = 0;
  (s.network || []).forEach((n) => {
    if (n.interface_name === 'lo') return;
    txBytes += Number(n.transmitted?.speed_bytes || 0);
  });

  res.json({
    cpu: {
      usado_pct: Math.round(Number(s.cpu?.total?.usage || 0)),
      cores: Array.isArray(s.cpu?.cores) ? s.cpu.cores.length : null,
      load: s.cpu?.load || [],
    },
    memoria: {
      total: s.memory?.total_readable || '—',
      usado_pct: pct(memUsed, memTotal),
    },
    disco: {
      total: s.disk?.total_readable || '—',
      usado: s.disk?.used_readable || '—',
      usado_pct: pct(diskUsed, diskTotal),
    },
    transferencia: {
      velocidad: humanBytes(txBytes) + '/s',
    },
  });
}));

// ==================================================================
//  ESTADÍSTICAS GLOBALES
// ==================================================================

router.get('/estadisticas', requireAdmin, wrap(async (req, res) => {
  const s = await clienteModel.stats();

  // Oyentes reales + ranking desde el nowplaying global de AzuraCast
  let oyentes_totales = 0;
  let al_aire = 0;
  let ranking = [];
  try {
    const clientes = await clienteModel.findAllWithEmail();
    const porStation = {};
    clientes.forEach((c) => { if (c.azuracast_station_id) porStation[c.azuracast_station_id] = c; });

    const np = await azuracast.getNowPlayingAll();
    (np || []).forEach((est) => {
      const stId = est.station?.id;
      const cli = porStation[stId];
      if (!cli) return;
      const oyentes = est.listeners?.current || 0;
      oyentes_totales += oyentes;
      if (est.is_online) al_aire += 1;
      ranking.push({ cliente_id: cli.id, nombre: cli.nombre_empresa, oyentes, online: !!est.is_online });
    });
    ranking.sort((a, b) => b.oyentes - a.oyentes);
  } catch (err) {
    console.error('[estadisticas] nowplaying global falló:', err.message);
  }

  res.json({ ...s, oyentes_totales, al_aire, ranking });
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

// ==================================================================
//  PLANES / PLANTILLAS
// ==================================================================

router.get('/planes', requireAdmin, wrap(async (req, res) => {
  const planes = await planModel.findAll();
  res.json({ planes });
}));

router.post('/planes', requireAdmin, wrap(async (req, res) => {
  const { nombre } = req.body || {};
  if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });
  const plan = await planModel.create(req.body);
  res.status(201).json({ message: 'Plan creado ✅', plan });
}));

router.put('/planes/:id', requireAdmin, wrap(async (req, res) => {
  const existente = await planModel.findById(Number(req.params.id));
  if (!existente) return res.status(404).json({ error: 'Plan no encontrado' });
  const plan = await planModel.update(existente.id, req.body || {});
  res.json({ message: 'Plan actualizado ✅', plan });
}));

router.delete('/planes/:id', requireAdmin, wrap(async (req, res) => {
  const existente = await planModel.findById(Number(req.params.id));
  if (!existente) return res.status(404).json({ error: 'Plan no encontrado' });
  await planModel.deleteById(existente.id);
  res.json({ message: 'Plan eliminado ✅' });
}));

// ==================================================================
//  REVENDEDORES (RESELLERS)
// ==================================================================

router.get('/resellers', requireAdmin, wrap(async (req, res) => {
  const resellers = await resellerModel.findAllWithEmail();
  res.json({ resellers });
}));

/** POST /admin/resellers/crear  body: { email, password, nombre_empresa, cupo_radios, max_oyentes_total, espacio_total_mb } */
router.post('/resellers/crear', requireAdmin, wrap(async (req, res) => {
  const { email, password, nombre_empresa, cupo_radios = 5, max_oyentes_total = 500, espacio_total_mb = 10240 } = req.body || {};
  if (!email || !password || !nombre_empresa) {
    return res.status(400).json({ error: 'email, password y nombre_empresa son requeridos' });
  }
  if (await userModel.findByEmail(email)) {
    return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
  }
  const password_hash = await bcrypt.hash(password, 10);
  const user = await userModel.create({ email, password_hash, role: 'reseller' });
  const reseller = await resellerModel.create({
    user_id: user.id, nombre_empresa,
    cupo_radios: Number(cupo_radios),
    max_oyentes_total: Number(max_oyentes_total),
    espacio_total_mb: Number(espacio_total_mb),
  });
  res.status(201).json({
    message: 'Revendedor creado ✅',
    reseller: { ...reseller, email },
    credenciales: { email, password },
  });
}));

/** PUT /admin/resellers/:id  body: { cupo_radios, activo, nombre_empresa, max_oyentes_total, espacio_total_mb } */
router.put('/resellers/:id', requireAdmin, wrap(async (req, res) => {
  const reseller = await resellerModel.findById(Number(req.params.id));
  if (!reseller) return res.status(404).json({ error: 'Revendedor no encontrado' });
  const { cupo_radios, activo, nombre_empresa, max_oyentes_total, espacio_total_mb } = req.body || {};
  const num = (v) => (v === undefined ? undefined : Number(v));
  const actualizado = await resellerModel.update(reseller.id, {
    cupo_radios: num(cupo_radios),
    activo: activo === undefined ? undefined : Boolean(activo),
    nombre_empresa,
    max_oyentes_total: num(max_oyentes_total),
    espacio_total_mb: num(espacio_total_mb),
  });
  res.json({ message: 'Revendedor actualizado ✅', reseller: actualizado });
}));

/** DELETE /admin/resellers/:id — elimina el revendedor (sus clientes quedan sin revendedor). */
router.delete('/resellers/:id', requireAdmin, wrap(async (req, res) => {
  const reseller = await resellerModel.findById(Number(req.params.id));
  if (!reseller) return res.status(404).json({ error: 'Revendedor no encontrado' });
  await userModel.deleteById(reseller.user_id); // cascade borra el reseller; clientes quedan con reseller_id NULL
  res.json({ message: 'Revendedor eliminado ✅' });
}));

/** POST /admin/resellers/:id/impersonar — el admin entra al panel del revendedor. */
router.post('/resellers/:id/impersonar', requireAdmin, wrap(async (req, res) => {
  const reseller = await resellerModel.findById(Number(req.params.id));
  if (!reseller) return res.status(404).json({ error: 'Revendedor no encontrado' });
  const user = await userModel.findById(reseller.user_id);
  const token = generateToken(user.id, 'reseller', { reseller_id: reseller.id, impersonated_by: req.user.sub });
  res.json({ token, reseller: { id: reseller.id, nombre_empresa: reseller.nombre_empresa, email: user.email } });
}));

module.exports = router;
