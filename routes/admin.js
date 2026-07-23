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
const planResellerModel = require('../models/planResellerModel');
const resellerModel = require('../models/resellerModel');
const servidorModel = require('../models/servidorModel');
const consumoModel = require('../models/consumoModel');
const consumoClienteModel = require('../models/consumoClienteModel');
const docModel = require('../models/docModel');
const apiKeyModel = require('../models/apiKeyModel');
const biblioteca = require('../services/biblioteca');
const provisioning = require('../services/provisioning');
const { agregarOyentes } = require('../services/stats');
const { generateToken } = require('../services/auth');
// generateToken se usa también para emitir tokens de cliente al impersonar
const azuracast = require('../services/azuracast');
const videoNode = require('../services/videoNode');
const authFactory = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');

const router = express.Router();

const requireAdmin = [authFactory('admin'), isAdmin];

/** Envuelve un handler async para que los errores caigan en el manejador global. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Cliente AzuraCast del servidor de esa radio. */
const azDe = (cliente) => azuracast.paraServidorId(cliente?.servidor_id);

/**
 * Nodo de video del cliente (null si no es de video). La cuenta en el nodo se
 * identifica con el short_name del cliente, igual que en el panel del cliente.
 */
async function nodoVideoDe(cliente) {
  if (!cliente || cliente.tipo !== 'video' || !cliente.servidor_id) return null;
  const s = await servidorModel.findById(cliente.servidor_id);
  if (!s || s.tipo !== 'video') return null;
  return { nodo: videoNode.crearCliente(s.url, s.api_key), user: cliente.short_name };
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const { usuario, email, password } = req.body || {};
  const identificador = (usuario || email || '').trim();
  if (!identificador || !password) {
    return res.status(400).json({ error: 'usuario y password son requeridos' });
  }

  const user = await userModel.findByLogin(identificador);
  if (!user || user.role !== 'admin') return res.status(401).json({ error: 'Credenciales inválidas' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

  const token = generateToken(user.id, 'admin');
  res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
}));

router.post('/logout', requireAdmin, (req, res) => {
  res.json({ message: 'Sesión cerrada. Elimina el token en el cliente.' });
});

/** POST /admin/password — el super admin cambia su propia contraseña. */
router.post('/password', requireAdmin, wrap(async (req, res) => {
  const { actual, nueva } = req.body || {};
  if (!actual || !nueva) return res.status(400).json({ error: 'Contraseña actual y nueva son requeridas' });
  if (String(nueva).length < 8) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
  const user = await userModel.findById(req.user.sub);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  const ok = await bcrypt.compare(actual, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'La contraseña actual no es correcta' });
  await userModel.updatePassword(user.id, await bcrypt.hash(nueva, 10));
  res.json({ message: 'Contraseña actualizada ✅' });
}));

// ==================================================================
//  GESTIÓN DE CLIENTES
// ==================================================================

router.get('/clientes', requireAdmin, wrap(async (req, res) => {
  const clientes = await clienteModel.findAllWithEmail();
  res.json({ clientes });
}));

/**
 * POST /admin/clientes/crear
 * body: { email, password, nombre_empresa, plan_id, username? }
 * Crea el usuario + APROVISIONA la estación real en AzuraCast (aplicando el plan).
 * El acceso es por `username` (si no se envía se genera): así un mismo email
 * puede tener varias radios.
 */
router.post('/clientes/crear', requireAdmin, wrap(async (req, res) => {
  const { email, username, password, nombre_empresa, plan_id } = req.body || {};
  const resultado = await provisioning.crearClienteConEstacion({ email, username, password, nombre_empresa, plan_id });
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
      const az = await azDe(cliente);
      await az.deleteStation(cliente.azuracast_station_id);
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
    cliente: { id: cliente.id, nombre_empresa: cliente.nombre_empresa, tipo: cliente.tipo || 'audio', username: user.username, email: user.email },
  });
}));

/**
 * GET /admin/clientes/estados
 * Estado de la estación de cada cliente (online/offline/suspendido/sin-estacion).
 */
router.get('/clientes/estados', requireAdmin, wrap(async (req, res) => {
  const clientes = await clienteModel.findAllWithEmail();
  const estados = {};

  // Canales de video: se consulta UNA vez por nodo (el agente devuelve todas
  // sus cuentas con al_aire), no una petición por cliente.
  const idsNodos = [...new Set(clientes.filter((c) => c.tipo === 'video' && c.activo && c.servidor_id).map((c) => c.servidor_id))];
  const porNodo = new Map();
  await Promise.all(idsNodos.map(async (sid) => {
    try {
      const s = await servidorModel.findById(sid);
      if (!s || s.tipo !== 'video') return;
      const lista = await videoNode.crearCliente(s.url, s.api_key).cuentas();
      porNodo.set(sid, new Map((lista || []).map((x) => [x.user, x])));
    } catch (_) { /* nodo caído → queda 'error' abajo */ }
  }));

  await Promise.all(clientes.map(async (c) => {
    if (!c.activo) { estados[c.id] = 'suspendido'; return; }

    if (c.tipo === 'video') {
      const mapa = porNodo.get(c.servidor_id);
      if (!mapa) { estados[c.id] = 'error'; return; }
      const cuenta = mapa.get(c.short_name);
      estados[c.id] = !cuenta ? 'sin-estacion' : cuenta.al_aire ? 'online' : 'offline';
      return;
    }

    if (!c.azuracast_station_id) { estados[c.id] = 'sin-estacion'; return; }
    try {
      const az = await azDe(c);
      const st = await az.getStationStatus(c.azuracast_station_id);
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
  const az = await azDe(cliente);
  await provisioning.aplicarLimitesPlan(cliente.azuracast_station_id, plan, az);
  res.json({ message: 'Límites del plan re-aplicados ✅' });
}));

/** POST /admin/clientes/:id/iniciar — pone al aire: estación (audio) o canal 24/7 (video). */
router.post('/clientes/:id/iniciar', requireAdmin, wrap(async (req, res) => {
  const cliente = await clienteModel.findById(Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const v = await nodoVideoDe(cliente);
  if (v) {
    const r = await v.nodo.emision(v.user, true);
    if (!r) return res.status(502).json({ error: 'El nodo de video no respondió' });
    if (r.ok === false) return res.status(400).json({ error: r.error || 'No se pudo iniciar el canal' });
    return res.json({ message: 'Canal al aire ✅', ...r });
  }

  if (!cliente.azuracast_station_id) return res.status(400).json({ error: 'El cliente no tiene estación' });
  const az = await azDe(cliente);
  await az.restartStation(cliente.azuracast_station_id);
  res.json({ message: 'Estación al aire ✅' });
}));

/** POST /admin/clientes/:id/reiniciar — apaga y vuelve a encender la emisión. */
router.post('/clientes/:id/reiniciar', requireAdmin, wrap(async (req, res) => {
  const cliente = await clienteModel.findById(Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const v = await nodoVideoDe(cliente);
  if (v) {
    await v.nodo.emision(v.user, false);
    await esperar(3000);                      // deja que el emisor libere el stream
    const r = await v.nodo.emision(v.user, true);
    if (!r) return res.status(502).json({ error: 'El nodo de video no respondió' });
    if (r.ok === false) return res.status(400).json({ error: r.error || 'No se pudo reiniciar el canal' });
    return res.json({ message: 'Canal reiniciado ✅', ...r });
  }

  if (!cliente.azuracast_station_id) return res.status(400).json({ error: 'El cliente no tiene estación' });
  const az = await azDe(cliente);
  await az.restartStation(cliente.azuracast_station_id);
  res.json({ message: 'Estación reiniciada ✅' });
}));

/** POST /admin/clientes/:id/biblioteca — copia la música de cortesía a la estación. */
router.post('/clientes/:id/biblioteca', requireAdmin, wrap(async (req, res) => {
  const cliente = await clienteModel.findById(Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (!cliente.azuracast_station_id) return res.status(400).json({ error: 'El cliente no tiene estación' });
  const az = await azDe(cliente);
  const r = await biblioteca.copiarAEstacion(cliente.azuracast_station_id, az);
  if (!r.total) return res.json({ message: 'No hay música en la biblioteca del servidor todavía.', ...r });
  res.json({ message: `Música de cortesía agregada: ${r.copiados}/${r.total} tracks ✅`, ...r });
}));

/** POST /admin/clientes/:id/parar — detiene la transmisión (sin suspender). */
router.post('/clientes/:id/parar', requireAdmin, wrap(async (req, res) => {
  const cliente = await clienteModel.findById(Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const v = await nodoVideoDe(cliente);
  if (v) {
    const r = await v.nodo.emision(v.user, false);
    if (!r) return res.status(502).json({ error: 'El nodo de video no respondió' });
    return res.json({ message: 'Canal detenido ✅', ...r });
  }

  if (!cliente.azuracast_station_id) return res.status(400).json({ error: 'El cliente no tiene estación' });
  const az = await azDe(cliente);
  await az.stopStation(cliente.azuracast_station_id);
  res.json({ message: 'Transmisión detenida ✅' });
}));

/** POST /admin/clientes/:id/suspender — desactiva el cliente y apaga su estación. */
router.post('/clientes/:id/suspender', requireAdmin, wrap(async (req, res) => {
  const cliente = await clienteModel.findById(Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  await clienteModel.update(cliente.id, { activo: false });

  const v = await nodoVideoDe(cliente);
  if (v) {
    try { await v.nodo.emision(v.user, false); } catch (_) {}
    return res.json({ message: 'Cliente suspendido ✅ (canal apagado)' });
  }

  if (cliente.azuracast_station_id) {
    const az = await azDe(cliente);
    try { await az.updateStation(cliente.azuracast_station_id, { is_enabled: false }); } catch (_) {}
    try { await az.stopStation(cliente.azuracast_station_id); } catch (_) {}
  }
  res.json({ message: 'Cliente suspendido ✅' });
}));

/** POST /admin/clientes/:id/reactivar — reactiva el cliente y pone su estación al aire. */
router.post('/clientes/:id/reactivar', requireAdmin, wrap(async (req, res) => {
  const cliente = await clienteModel.findById(Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  await clienteModel.update(cliente.id, { activo: true });

  const v = await nodoVideoDe(cliente);
  if (v) {
    try { await v.nodo.emision(v.user, true); } catch (_) {}
    return res.json({ message: 'Cliente reactivado ✅ (canal al aire)' });
  }

  if (cliente.azuracast_station_id) {
    const az = await azDe(cliente);
    try { await az.updateStation(cliente.azuracast_station_id, { is_enabled: true }); } catch (_) {}
    try { await az.restartStation(cliente.azuracast_station_id); } catch (_) {}
  }
  res.json({ message: 'Cliente reactivado ✅' });
}));

/**
 * GET /admin/clientes/:id/accesos — todo lo que se le puede enviar al cliente.
 * OJO: la contraseña del PANEL no viaja aquí porque se guarda con hash bcrypt
 * (no es recuperable). Para eso está POST /clientes/:id/password, que genera
 * una nueva y la muestra una sola vez.
 */
router.get('/clientes/:id/accesos', requireAdmin, wrap(async (req, res) => {
  const cliente = await clienteModel.findById(Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  const user = await userModel.findById(cliente.user_id);
  const tipo = cliente.tipo || 'audio';

  const salida = {
    nombre_empresa: cliente.nombre_empresa,
    tipo,
    usuario: user?.username || null,
    email: user?.email || null,
    password_recuperable: false,   // se guarda con hash, no se puede leer
  };

  if (tipo === 'video') {
    const v = await nodoVideoDe(cliente);
    salida.video = v ? await v.nodo.conexion(v.user) : null;
  } else {
    salida.audio = {
      url_streaming: cliente.url_streaming || null,
      dj_puerto: cliente.dj_puerto || null,
      dj_usuario: cliente.dj_usuario || null,
      dj_password: cliente.dj_password || null,
    };
  }
  res.json(salida);
}));

/**
 * POST /admin/clientes/:id/password — genera una contraseña nueva para el
 * panel del cliente y la devuelve UNA vez (para copiársela y enviársela).
 */
router.post('/clientes/:id/password', requireAdmin, wrap(async (req, res) => {
  const cliente = await clienteModel.findById(Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const nueva = req.body?.password || crypto.randomBytes(6).toString('hex');
  if (String(nueva).length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  await userModel.updatePassword(cliente.user_id, await bcrypt.hash(String(nueva), 10));
  const user = await userModel.findById(cliente.user_id);
  res.json({ message: 'Contraseña actualizada ✅', usuario: user?.username, password: nueva });
}));

router.get('/clientes/:id/estacion', requireAdmin, wrap(async (req, res) => {
  const cliente = await clienteModel.findById(Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (!cliente.azuracast_station_id) {
    return res.status(404).json({ error: 'El cliente no tiene estación asignada aún' });
  }

  try {
    const az = await azDe(cliente);
    const station = await az.getStation(cliente.azuracast_station_id);
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

  const clientes = await clienteModel.findAllWithEmail();
  const { oyentes_totales, al_aire, ranking } = await agregarOyentes(clientes);
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
  const planes = await planModel.findGlobales();
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

/**
 * GET /admin/resellers
 * Además de la ficha, devuelve el USO de cada revendedor: oyentes asignados
 * (suma de los planes de sus radios) vs su tope, espacio, oyentes en vivo y
 * banda consumida en el mes. Es lo que pinta las barras del listado.
 */
router.get('/resellers', requireAdmin, wrap(async (req, res) => {
  const resellers = await resellerModel.findAllWithEmail();
  if (resellers.length === 0) return res.json({ resellers });

  const todos = await clienteModel.findAllWithEmail();
  const deReseller = todos.filter((c) => c.reseller_id != null);

  // Oyentes en vivo (una consulta por servidor) y banda del mes
  const { ranking } = await agregarOyentes(deReseller);
  const oyentesPorCliente = {};
  ranking.forEach((r) => { oyentesPorCliente[r.cliente_id] = r.oyentes; });
  const bandaPorReseller = await consumoClienteModel.totalMesPorReseller();

  const enVivo = {};
  deReseller.forEach((c) => {
    enVivo[c.reseller_id] = (enVivo[c.reseller_id] || 0) + (oyentesPorCliente[c.id] || 0);
  });

  const conUso = await Promise.all(resellers.map(async (r) => {
    const uso = await resellerModel.usoRecursos(r.id);
    const bytes = bandaPorReseller[r.id] || 0;
    return {
      ...r,
      uso: {
        radios: r.radios_usadas, cupo_radios: r.cupo_radios,
        oyentes_asignados: uso.oyentes, max_oyentes_total: r.max_oyentes_total,
        oyentes_en_vivo: enVivo[r.id] || 0,
        espacio_mb: uso.espacio, espacio_total_mb: r.espacio_total_mb,
        banda_mes_bytes: bytes, banda_mes: humanBytes(bytes),
      },
    };
  }));

  res.json({ resellers: conUso });
}));

/**
 * GET /admin/resellers/:id/uso — detalle para el panel expandible:
 * serie diaria de banda (30 días) + sus radios con oyentes y consumo.
 */
router.get('/resellers/:id/uso', requireAdmin, wrap(async (req, res) => {
  const reseller = await resellerModel.findById(Number(req.params.id));
  if (!reseller) return res.status(404).json({ error: 'Revendedor no encontrado' });

  const clientes = await clienteModel.findByReseller(reseller.id);
  // OJO: `banda_mes` es del mes EN CURSO (igual que en el listado); la serie es
  // de 30 días corridos, así que no se suma la serie para obtener el total.
  const [serie, totalMes, bandaPorCliente, { ranking, oyentes_totales, al_aire }] = await Promise.all([
    consumoClienteModel.serieReseller(reseller.id, 30),
    consumoClienteModel.totalMesReseller(reseller.id),
    consumoClienteModel.totalMesPorClienteDeReseller(reseller.id),
    agregarOyentes(clientes),
  ]);
  const oyentesPorCliente = {};
  ranking.forEach((r) => { oyentesPorCliente[r.cliente_id] = { oyentes: r.oyentes, online: r.online }; });

  res.json({
    serie: serie.map((d) => ({ fecha: d.fecha, bytes: d.bytes, gb: +(d.bytes / 1073741824).toFixed(3) })),
    banda_mes: humanBytes(totalMes),
    banda_30d: humanBytes(serie.reduce((a, d) => a + d.bytes, 0)),
    oyentes_totales, al_aire,
    radios: clientes.map((c) => ({
      id: c.id, nombre_empresa: c.nombre_empresa, plan: c.plan, activo: c.activo,
      oyentes: oyentesPorCliente[c.id]?.oyentes || 0,
      online: oyentesPorCliente[c.id]?.online || false,
      banda_mes: humanBytes(bandaPorCliente[c.id] || 0),
      banda_mes_bytes: bandaPorCliente[c.id] || 0,
    })),
  });
}));

/**
 * POST /admin/resellers/crear
 * body: { email, username?, password, nombre_empresa, plan_reseller_id? }
 *   o bien, a medida: { ..., cupo_radios, max_oyentes_total, espacio_total_mb }
 * Con plan, los límites salen del paquete (igual que una radio de un plan).
 */
router.post('/resellers/crear', requireAdmin, wrap(async (req, res) => {
  const { email, username, password, nombre_empresa, plan_reseller_id,
    cupo_radios = 5, max_oyentes_total = 500, espacio_total_mb = 10240 } = req.body || {};
  const resultado = await provisioning.crearReseller({
    email, username, password, nombre_empresa,
    plan_reseller_id: plan_reseller_id || null,
    limites: plan_reseller_id ? null : { cupo_radios, max_oyentes_total, espacio_total_mb },
  });
  res.status(201).json({ message: 'Revendedor creado ✅', ...resultado });
}));

/** PUT /admin/resellers/:id  body: { cupo_radios, activo, nombre_empresa, max_oyentes_total, espacio_total_mb, plan_reseller_id } */
router.put('/resellers/:id', requireAdmin, wrap(async (req, res) => {
  const reseller = await resellerModel.findById(Number(req.params.id));
  if (!reseller) return res.status(404).json({ error: 'Revendedor no encontrado' });
  const { cupo_radios, activo, nombre_empresa, max_oyentes_total, espacio_total_mb, plan_reseller_id } = req.body || {};
  const num = (v) => (v === undefined ? undefined : Number(v));

  // Si mandan un plan, sus límites mandan (upgrade/downgrade del paquete).
  let dePlan = {};
  if (plan_reseller_id) {
    const p = await planResellerModel.findById(Number(plan_reseller_id));
    if (!p) return res.status(400).json({ error: 'Plan de revendedor no encontrado' });
    dePlan = { plan: p.nombre, cupo_radios: p.cupo_radios, max_oyentes_total: p.max_oyentes_total, espacio_total_mb: p.espacio_total_mb };
  }

  const actualizado = await resellerModel.update(reseller.id, {
    cupo_radios: num(cupo_radios),
    activo: activo === undefined ? undefined : Boolean(activo),
    nombre_empresa,
    max_oyentes_total: num(max_oyentes_total),
    espacio_total_mb: num(espacio_total_mb),
    ...dePlan,
  });
  res.json({ message: 'Revendedor actualizado ✅', reseller: actualizado });
}));

// ---- Planes de REVENDEDOR (paquetes de mayorista) -----------------
router.get('/planes-reseller', requireAdmin, wrap(async (req, res) => {
  res.json({ planes: await planResellerModel.findAll() });
}));

router.post('/planes-reseller', requireAdmin, wrap(async (req, res) => {
  if (!req.body?.nombre) return res.status(400).json({ error: 'nombre es requerido' });
  const plan = await planResellerModel.create(req.body);
  res.status(201).json({ message: 'Plan de revendedor creado ✅', plan });
}));

router.put('/planes-reseller/:id', requireAdmin, wrap(async (req, res) => {
  const plan = await planResellerModel.findById(Number(req.params.id));
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
  res.json({ message: 'Plan actualizado ✅', plan: await planResellerModel.update(plan.id, req.body || {}) });
}));

router.delete('/planes-reseller/:id', requireAdmin, wrap(async (req, res) => {
  const plan = await planResellerModel.findById(Number(req.params.id));
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
  await planResellerModel.deleteById(plan.id);
  res.json({ message: 'Plan eliminado ✅' });
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
  res.json({ token, reseller: { id: reseller.id, nombre_empresa: reseller.nombre_empresa, username: user.username, email: user.email } });
}));

// ==================================================================
//  GUARDIÁN DE BANDA
// ==================================================================

/** GET /admin/banda — consumo del mes por servidor + gráfica diaria. */
router.get('/banda', requireAdmin, wrap(async (req, res) => {
  const servidores = await servidorModel.findAllConUso();
  const GB = 1024 ** 3;
  const r2 = (n) => Math.round(n * 100) / 100;

  // Días del mes: lo consumido va a ritmo de `hoy`, y falta hasta `total`.
  const hoy = new Date();
  const diaActual = hoy.getDate();
  const diasDelMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const diasRestantes = diasDelMes - diaActual;

  const out = [];
  for (const s of servidores) {
    const dias = await consumoModel.mesActual(s.id);
    const bytes = dias.reduce((a, d) => a + Number(d.bytes), 0);
    const gb = bytes / GB;
    const tope = s.banda_mensual_gb || 0;

    // Ritmo: promedio de los últimos 7 días con datos (reacciona a un pico
    // reciente mejor que el promedio de todo el mes).
    const ultimos = dias.slice(-7);
    const promedio = ultimos.length
      ? ultimos.reduce((a, d) => a + Number(d.bytes), 0) / GB / ultimos.length
      : gb / Math.max(1, diaActual);

    // A este ritmo, ¿con cuánto se termina el mes?
    const proyeccion = gb + promedio * diasRestantes;

    // ¿Qué día se agotaría el tope? (null si no se agota este mes)
    let dia_agotamiento = null;
    if (tope && promedio > 0 && proyeccion > tope) {
      const faltan = Math.max(0, (tope - gb) / promedio);
      const dia = Math.ceil(diaActual + faltan);
      if (dia <= diasDelMes) dia_agotamiento = dia;
    }

    const pct = tope ? (gb / tope) * 100 : null;
    const pctProy = tope ? (proyeccion / tope) * 100 : null;

    // Estado: manda lo que ya se consumió, pero la proyección puede
    // adelantarlo (aún vas en 40% pero al ritmo actual revientas el tope).
    let estado = 'sin-tope';
    if (tope) {
      // Umbrales bajos a propósito: el estimado NO cuenta el tráfico del panel
      // ni las actualizaciones del servidor, así que se queda corto. Avisar
      // tarde no sirve de nada: cuando Hostinger corta, ya no hay vuelta atrás.
      if (pct >= 90) estado = 'critico';
      else if (pct >= 75 || (pctProy != null && pctProy >= 100)) estado = 'riesgo';
      else if (pct >= 50 || (pctProy != null && pctProy >= 80)) estado = 'atencion';
      else estado = 'ok';
    }

    out.push({
      id: s.id,
      nombre: s.nombre,
      activo: s.activo,
      tipo: s.tipo || 'audio',
      consumido_gb: r2(gb),
      tope_gb: tope,
      pct: tope ? Math.min(100, Math.round(pct)) : null,
      // Proyección a fin de mes
      promedio_diario_gb: r2(promedio),
      proyeccion_gb: r2(proyeccion),
      proyeccion_pct: pctProy != null ? Math.round(pctProy) : null,
      dia_agotamiento,
      dias_restantes: diasRestantes,
      dias_del_mes: diasDelMes,
      estado,
      por_dia: dias.map((d) => ({
        dia: new Date(d.fecha).getUTCDate(),
        gb: r2(Number(d.bytes) / GB),
      })),
    });
  }
  res.json({ servidores: out });
}));

// ==================================================================
//  SERVIDORES (MULTI-SERVIDOR)
// ==================================================================

router.get('/servidores', requireAdmin, wrap(async (req, res) => {
  res.json({ servidores: await servidorModel.findAllConUso() });
}));

/** POST /admin/servidores  body: { nombre, url, api_key, capacidad_radios } */
router.post('/servidores', requireAdmin, wrap(async (req, res) => {
  const { nombre, url, url_publica, api_key, tipo = 'audio', capacidad_radios = 100, banda_mensual_gb = 0 } = req.body || {};
  if (!nombre || !url || !api_key) return res.status(400).json({ error: 'nombre, url y api_key son requeridos' });
  const limpio = String(url).replace(/\/+$/, ''); // sin barra final
  const esVideo = tipo === 'video';

  // Verificar que responde ANTES de guardar, cada uno en su idioma:
  // un nodo de video habla con nuestro agente, no con la API de AzuraCast.
  if (esVideo) {
    const ok = await videoNode.crearCliente(limpio, api_key).verificar();
    if (!ok) {
      return res.status(400).json({
        error: 'El agente de video no respondió. Revisa que esté corriendo (pm2 status), que la URL incluya el puerto (ej: http://IP:3000) y que el token sea el del archivo .env del agente.',
      });
    }
  } else {
    try {
      await azuracast.crearCliente(limpio, api_key).getServerStats();
    } catch (e) {
      return res.status(400).json({ error: 'No se pudo conectar al servidor: ' + e.message });
    }
  }

  const servidor = await servidorModel.create({
    nombre, url: limpio,
    url_publica: url_publica ? String(url_publica).replace(/\/+$/, '') : null,
    api_key, tipo: esVideo ? 'video' : 'audio',
    capacidad_radios: Number(capacidad_radios), banda_mensual_gb: Number(banda_mensual_gb),
  });
  res.status(201).json({ message: 'Servidor agregado ✅', servidor: { ...servidor, api_key: undefined } });
}));

router.put('/servidores/:id', requireAdmin, wrap(async (req, res) => {
  const servidor = await servidorModel.findById(Number(req.params.id));
  if (!servidor) return res.status(404).json({ error: 'Servidor no encontrado' });
  const { nombre, url, url_publica, api_key, capacidad_radios, banda_mensual_gb, activo } = req.body || {};
  const num = (v) => (v === undefined ? undefined : Number(v));
  const limpia = (v) => (v === undefined ? undefined : String(v).replace(/\/+$/, ''));
  const actualizado = await servidorModel.update(servidor.id, {
    nombre, url: url ? limpia(url) : undefined, url_publica: limpia(url_publica), api_key,
    capacidad_radios: num(capacidad_radios), banda_mensual_gb: num(banda_mensual_gb),
    activo: activo === undefined ? undefined : Boolean(activo),
  });

  // Si cambió el dominio público, las radios ya creadas tienen guardada la URL
  // vieja: se reescriben todas para que el cliente vea la nueva.
  let urls_actualizadas = 0;
  if (url_publica !== undefined && limpia(url_publica) !== (servidor.url_publica || '')) {
    const base = limpia(url_publica) || actualizado.url;
    const esDefecto = (actualizado.url || '') === String(process.env.AZURACAST_BASE_URL || '').replace(/\/+$/, '');
    urls_actualizadas = await clienteModel.reescribirUrls(actualizado.id, base, esDefecto);
  }

  res.json({
    message: `Servidor actualizado ✅${urls_actualizadas ? ` (${urls_actualizadas} URLs de radio reescritas)` : ''}`,
    servidor: { ...actualizado, api_key: undefined },
    urls_actualizadas,
  });
}));


/**
 * GET /admin/servidores/:id/cuentas — qué hay en un nodo de VIDEO.
 * Le pregunta al agente que corre en ese VPS. Solo lectura.
 */
router.get('/servidores/:id/cuentas', requireAdmin, wrap(async (req, res) => {
  const servidor = await servidorModel.findById(Number(req.params.id));
  if (!servidor) return res.status(404).json({ error: 'Servidor no encontrado' });
  if (servidor.tipo !== 'video') return res.status(400).json({ error: 'Este servidor no es de video' });

  const nodo = videoNode.crearCliente(servidor.url, servidor.api_key);
  const salud = await nodo.salud();
  if (!salud) {
    return res.status(502).json({
      error: 'No se pudo contactar el agente del nodo. Revisa que esté corriendo y que el token sea correcto.',
      cuentas: [],
    });
  }

  const cuentas = await nodo.cuentas();

  // Cruce con nuestros clientes: cuáles ya están en el panel y cuáles no
  const nuestros = await clienteModel.findAllWithEmail();
  const porShort = {};
  nuestros.forEach((c) => { if (c.short_name) porShort[c.short_name] = c; });

  res.json({
    servidor: { id: servidor.id, nombre: servidor.nombre, url: servidor.url },
    cuentas: cuentas.map((c) => ({
      ...c,
      espacio: humanBytes(c.espacio_bytes),
      // null = existe en el nodo pero todavía no está en el panel
      cliente_id: porShort[c.user]?.id || null,
      nombre_empresa: porShort[c.user]?.nombre_empresa || null,
    })),
  });
}));


/**
 * POST /admin/servidores/:id/cuentas/:user/importar
 * Da de alta en el panel una cuenta que YA existe en el nodo de video.
 *
 * No toca el nodo: solo crea el registro de nuestro lado para poder verla,
 * medirla y facturarla. El cliente no recibe acceso aquí — se le genera
 * después, cuando su panel tenga algo que mostrarle.
 */
router.post('/servidores/:id/cuentas/:user/importar', requireAdmin, wrap(async (req, res) => {
  const servidor = await servidorModel.findById(Number(req.params.id));
  if (!servidor || servidor.tipo !== 'video') return res.status(404).json({ error: 'Nodo de video no encontrado' });

  const user = String(req.params.user);
  if (await clienteModel.findByShortName(user)) {
    return res.status(409).json({ error: `La cuenta "${user}" ya está dada de alta en el panel` });
  }

  // Debe existir de verdad en el nodo (no inventar cuentas)
  const nodo = videoNode.crearCliente(servidor.url, servidor.api_key);
  const cuentas = await nodo.cuentas();
  const enNodo = cuentas.find((c) => c.user === user);
  if (!enNodo) return res.status(404).json({ error: `El nodo no tiene ninguna cuenta llamada "${user}"` });

  const { nombre_empresa, email, plan_id } = req.body || {};
  let plan = null;
  if (plan_id) {
    plan = await planModel.findById(Number(plan_id));
    if (!plan) return res.status(400).json({ error: 'Plan no encontrado' });
    if (plan.tipo !== 'video') return res.status(400).json({ error: 'Ese plan es de audio: elige uno de video' });
  }

  // Usuario de acceso: se crea con contraseña aleatoria que NADIE conoce.
  // El cliente no puede entrar hasta que se le genere una a propósito.
  const usuario = (await userModel.findByUsername(user)) ? await userModel.generarUsername(user) : user;
  const password_hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
  const cuentaUser = await userModel.create({
    username: usuario,
    email: email || `${user}@sin-correo.local`,
    password_hash, role: 'cliente',
  });

  // La URL que el cliente ya tiene publicada (híbrido: vivo + emisión 24/7)
  const base = (servidor.url_publica || servidor.url).replace(/\/+$/, '');
  const url_streaming = enNodo.puertos?.http ? `${base}:${enNodo.puertos.http}/hybrid/play.m3u8` : null;

  const cliente = await clienteModel.create({
    user_id: cuentaUser.id,
    nombre_empresa: nombre_empresa || user,
    plan: plan?.nombre || 'Importado',
    tipo: 'video',
    short_name: user,
    servidor_id: servidor.id,
    url_streaming,
  });

  res.status(201).json({
    message: `Cuenta "${user}" dada de alta ✅`,
    cliente: { ...cliente, username: usuario, sin_acceso: true },
  });
}));

/** GET /admin/servidores/:id/cuentas/:user — detalle y consumo de una cuenta. */
router.get('/servidores/:id/cuentas/:user', requireAdmin, wrap(async (req, res) => {
  const servidor = await servidorModel.findById(Number(req.params.id));
  if (!servidor || servidor.tipo !== 'video') return res.status(404).json({ error: 'Nodo de video no encontrado' });

  const nodo = videoNode.crearCliente(servidor.url, servidor.api_key);
  const [detalle, consumo] = await Promise.all([
    nodo.cuenta(req.params.user),
    nodo.consumo(req.params.user, 30),
  ]);
  if (!detalle) return res.status(502).json({ error: 'El nodo no respondió' });

  res.json({
    ...detalle,
    espacio: humanBytes(detalle.espacio_bytes),
    videos: (detalle.videos || []).map((v) => ({ ...v, tam: humanBytes(v.bytes) })),
    consumo: consumo
      ? {
          total: humanBytes(consumo.total_bytes),
          total_bytes: consumo.total_bytes,
          por_dia: consumo.por_dia.map((d) => ({ fecha: d.fecha, gb: +(d.bytes / 1073741824).toFixed(3) })),
        }
      : null,
  });
}));

router.delete('/servidores/:id', requireAdmin, wrap(async (req, res) => {
  const servidor = await servidorModel.findById(Number(req.params.id));
  if (!servidor) return res.status(404).json({ error: 'Servidor no encontrado' });
  await servidorModel.deleteById(servidor.id);
  res.json({ message: 'Servidor eliminado ✅ (sus radios quedan apuntando al servidor por defecto)' });
}));

// ==================================================================
//  DOCUMENTACIÓN (CENTRO DE AYUDA)
// ==================================================================

router.get('/docs', requireAdmin, wrap(async (req, res) => {
  const audiencia = req.query.audiencia === 'video' ? 'video' : req.query.audiencia === 'audio' ? 'audio' : null;
  res.json({ docs: await docModel.findAll(audiencia) });
}));

router.get('/docs/:id', requireAdmin, wrap(async (req, res) => {
  const doc = await docModel.findById(Number(req.params.id));
  if (!doc) return res.status(404).json({ error: 'Artículo no encontrado' });
  res.json({ doc });
}));

router.post('/docs', requireAdmin, wrap(async (req, res) => {
  if (!req.body?.titulo) return res.status(400).json({ error: 'El título es requerido' });
  const doc = await docModel.create(req.body);
  res.status(201).json({ message: 'Artículo creado ✅', doc });
}));

router.put('/docs/:id', requireAdmin, wrap(async (req, res) => {
  const existente = await docModel.findById(Number(req.params.id));
  if (!existente) return res.status(404).json({ error: 'Artículo no encontrado' });
  const doc = await docModel.update(existente.id, req.body || {});
  res.json({ message: 'Artículo actualizado ✅', doc });
}));

router.delete('/docs/:id', requireAdmin, wrap(async (req, res) => {
  const existente = await docModel.findById(Number(req.params.id));
  if (!existente) return res.status(404).json({ error: 'Artículo no encontrado' });
  await docModel.deleteById(existente.id);
  res.json({ message: 'Artículo eliminado ✅' });
}));

// ==================================================================
//  LLAVES DE API (integración con facturación)
// ==================================================================

router.get('/api-keys', requireAdmin, wrap(async (req, res) => {
  res.json({ keys: await apiKeyModel.findAll() });
}));

/** POST /admin/api-keys — genera una llave nueva (se muestra el token UNA vez). */
router.post('/api-keys', requireAdmin, wrap(async (req, res) => {
  const { nombre } = req.body || {};
  if (!nombre) return res.status(400).json({ error: 'Ponle un nombre a la llave' });
  const token = crypto.randomBytes(24).toString('hex');
  const key = await apiKeyModel.create({ nombre, token });
  res.status(201).json({ message: 'Llave creada ✅', key: { id: key.id, nombre: key.nombre }, token });
}));

router.put('/api-keys/:id', requireAdmin, wrap(async (req, res) => {
  const k = await apiKeyModel.setActivo(Number(req.params.id), Boolean(req.body?.activo));
  if (!k) return res.status(404).json({ error: 'Llave no encontrada' });
  res.json({ message: 'Llave actualizada ✅', key: k });
}));

router.delete('/api-keys/:id', requireAdmin, wrap(async (req, res) => {
  await apiKeyModel.deleteById(Number(req.params.id));
  res.json({ message: 'Llave eliminada ✅' });
}));

module.exports = router;
