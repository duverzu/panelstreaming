/**
 * routes/cliente.js
 * ------------------------------------------------------------------
 * Panel Cliente — rutas montadas bajo /cliente
 * Cada cliente solo accede a SU estación. El cliente_id viaja
 * dentro del token, nunca se confía en un id que mande el frontend.
 * ------------------------------------------------------------------
 */

const express = require('express');
const { db, bcrypt } = require('../config/database');
const { generateToken } = require('../services/auth');
const azuracast = require('../services/azuracast');
const authFactory = require('../middleware/auth');
const isCliente = require('../middleware/isCliente');

const router = express.Router();

const requireCliente = [authFactory('cliente'), isCliente];

/** Helper: obtiene el cliente asociado al token actual. */
function getClienteFromReq(req) {
  return db.clientes.find((c) => c.id === req.user.cliente_id);
}

// ==================================================================
//  AUTENTICACIÓN
// ==================================================================

/**
 * POST /cliente/login
 * body: { email, password }
 * -> token JWT de cliente (incluye cliente_id en el payload)
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email y password son requeridos' });
  }

  const user = db.users.find((u) => u.email === email && u.role === 'cliente');
  if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

  const cliente = db.clientes.find((c) => c.user_id === user.id);
  if (!cliente) return res.status(403).json({ error: 'El usuario no tiene un cliente asociado' });
  if (!cliente.activo) return res.status(403).json({ error: 'Cuenta desactivada. Contacta al administrador.' });

  // Guardamos cliente_id dentro del token para aislar el acceso.
  const token = generateToken(user.id, 'cliente', { cliente_id: cliente.id });
  res.json({
    token,
    user: { id: user.id, email: user.email, role: user.role, cliente_id: cliente.id },
  });
});

/** POST /cliente/logout */
router.post('/logout', requireCliente, (req, res) => {
  res.json({ message: 'Sesión cerrada. Elimina el token en el cliente.' });
});

/**
 * GET /cliente/perfil
 * Datos del cliente logueado.
 */
router.get('/perfil', requireCliente, (req, res) => {
  const cliente = getClienteFromReq(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  const user = db.users.find((u) => u.id === cliente.user_id);

  res.json({
    perfil: {
      email: user?.email,
      nombre_empresa: cliente.nombre_empresa,
      plan: cliente.plan,
      created_at: cliente.created_at,
      activo: cliente.activo,
    },
  });
});

// ==================================================================
//  MI ESTACIÓN
// ==================================================================

/**
 * GET /cliente/mi-estacion
 * Detalles de SU estación. Si hay station_id real, consulta AzuraCast;
 * si no, devuelve un mock básico.
 */
router.get('/mi-estacion', requireCliente, async (req, res) => {
  const cliente = getClienteFromReq(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const base = {
    nombre: cliente.nombre_empresa,
    plan: cliente.plan,
    url_streaming: cliente.url_streaming,
    azuracast_station_id: cliente.azuracast_station_id,
  };

  if (!cliente.azuracast_station_id) {
    return res.json({ estacion: { ...base, aviso: 'Estación aún no aprovisionada en AzuraCast (mock).' } });
  }

  try {
    const station = await azuracast.getStation(cliente.azuracast_station_id);
    res.json({ estacion: { ...base, azuracast: station } });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
});

/**
 * GET /cliente/nowplaying
 * Info en vivo desde AzuraCast (canción actual, oyentes, historial).
 */
router.get('/nowplaying', requireCliente, async (req, res) => {
  const cliente = getClienteFromReq(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const stationId = cliente.azuracast_station_id || 1; // fallback a la 1 para pruebas
  try {
    const data = await azuracast.getNowPlaying(stationId);
    res.json({ nowplaying: data });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
});

/**
 * PUT /cliente/mi-estacion
 * Editar nombre/descripción de su radio (por ahora solo en memoria).
 */
router.put('/mi-estacion', requireCliente, (req, res) => {
  const cliente = getClienteFromReq(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const { nombre } = req.body || {};
  if (nombre !== undefined) cliente.nombre_empresa = nombre;

  res.json({ message: 'Estación actualizada ✅', estacion: { nombre: cliente.nombre_empresa } });
});

// ==================================================================
//  MEDIA (placeholder — se completa con multer en el siguiente paso)
// ==================================================================

/** GET /cliente/media — lista canciones (mock) */
router.get('/media', requireCliente, (req, res) => {
  const cliente = getClienteFromReq(req);
  const media = db.media.filter((m) => m.cliente_id === cliente.id);
  res.json({ media });
});

// ==================================================================
//  ESTADÍSTICAS PERSONALES (mock)
// ==================================================================

/** GET /cliente/estadisticas */
router.get('/estadisticas', requireCliente, (req, res) => {
  res.json({
    oyentes_hoy: 0,
    oyentes_semana: 0,
    oyentes_mes: 0,
    cancion_mas_escuchada: null,
    pico_audiencia: 0,
  });
});

/** GET /cliente/estadisticas/historico */
router.get('/estadisticas/historico', requireCliente, (req, res) => {
  res.json({ historico: [] });
});

module.exports = router;
