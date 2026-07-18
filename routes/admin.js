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
const { generateToken } = require('../services/auth');
// generateToken se usa también para emitir tokens de cliente al impersonar
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
 * body: { email, password, nombre_empresa, plan_id }
 * Crea el usuario + APROVISIONA la estación real en AzuraCast (aplicando el plan).
 */
router.post('/clientes/crear', requireAdmin, wrap(async (req, res) => {
  const { email, password, nombre_empresa, plan_id } = req.body || {};
  if (!email || !password || !nombre_empresa || !plan_id) {
    return res.status(400).json({ error: 'email, password, nombre_empresa y plan_id son requeridos' });
  }

  const plan = await planModel.findById(Number(plan_id));
  if (!plan) return res.status(400).json({ error: 'Plan no encontrado' });

  const existente = await userModel.findByEmail(email);
  if (existente) return res.status(409).json({ error: 'Ya existe un usuario con ese email' });

  // 1) Crear usuario
  const password_hash = await bcrypt.hash(password, 10);
  const user = await userModel.create({ email, password_hash, role: 'cliente' });

  // 2) Aprovisionar estación en AzuraCast aplicando los límites del plan
  let station;
  const dj = {}; // datos de conexión DJ que guardaremos
  try {
    station = await azuracast.createStation(nombre_empresa, `Radio de ${nombre_empresa}`);
    await azuracast.updateStation(station.id, {
      max_bitrate: plan.max_bitrate,
      max_mounts: plan.max_mounts,
      enable_streamers: plan.permite_dj,
      enable_public_page: true,
    });
  } catch (err) {
    await userModel.deleteById(user.id); // rollback del usuario si falla AzuraCast
    if (station?.id) { try { await azuracast.deleteStation(station.id); } catch (_) {} }
    return res.status(err.status || 502).json({ error: 'No se pudo crear la estación: ' + err.message });
  }

  // La estación ya trae un mount /radio.mp3 por defecto: ajustamos su bitrate al plan (no fatal)
  try {
    const mounts = await azuracast.getMounts(station.id);
    const principal = mounts.find((m) => m.is_default) || mounts[0];
    if (principal) {
      const autodjBitrate = plan.max_bitrate > 0 ? Math.min(plan.max_bitrate, 320) : 128;
      await azuracast.updateMount(station.id, principal.id, {
        enable_autodj: true,
        autodj_format: 'mp3',
        autodj_bitrate: autodjBitrate,
      });
    }
  } catch (err) {
    console.error('[provision] ajuste de mount falló:', err.message);
  }

  // 3) Cuenta DJ (si el plan lo permite) — pasos no fatales: si fallan, la estación igual queda creada
  if (plan.permite_dj) {
    try {
      dj.dj_usuario = station.short_name;
      dj.dj_password = crypto.randomBytes(6).toString('hex');
      await azuracast.createStreamer(station.id, {
        streamer_username: dj.dj_usuario,
        streamer_password: dj.dj_password,
        display_name: nombre_empresa,
        is_active: true,
      });
      const admin = await azuracast.getStationAdmin(station.id);
      dj.dj_puerto = admin?.backend_config?.dj_port || null;
    } catch (err) {
      console.error('[provision] cuenta DJ falló:', err.message);
    }
  }

  // 4) Poner la estación al aire (registra servicios en Supervisor)
  try {
    await azuracast.restartStation(station.id);
  } catch (err) {
    console.error('[provision] restart falló:', err.message);
  }

  const url_streaming = `${process.env.AZURACAST_BASE_URL}/listen/${station.short_name}/radio.mp3`;

  // 5) Crear cliente ya vinculado a su estación + datos DJ
  const cliente = await clienteModel.create({
    user_id: user.id,
    nombre_empresa,
    plan: plan.nombre,
    azuracast_station_id: station.id,
    url_streaming,
  });
  if (dj.dj_usuario) {
    await clienteModel.update(cliente.id, dj);
    Object.assign(cliente, dj);
  }

  res.status(201).json({
    message: 'Cliente y estación creados ✅',
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

/** POST /admin/clientes/:id/iniciar — pone la estación al aire (restart). */
router.post('/clientes/:id/iniciar', requireAdmin, wrap(async (req, res) => {
  const cliente = await clienteModel.findById(Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (!cliente.azuracast_station_id) return res.status(400).json({ error: 'El cliente no tiene estación' });
  await azuracast.restartStation(cliente.azuracast_station_id);
  res.json({ message: 'Estación al aire ✅' });
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

module.exports = router;
