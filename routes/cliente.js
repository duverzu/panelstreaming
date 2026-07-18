/**
 * routes/cliente.js
 * ------------------------------------------------------------------
 * Panel Cliente — rutas montadas bajo /cliente
 * Cada cliente solo accede a SU estación. El cliente_id viaja dentro
 * del token (nunca se confía en un id enviado por el frontend).
 * Ahora con PostgreSQL real vía la capa de modelos.
 * ------------------------------------------------------------------
 */

const express = require('express');
const bcrypt = require('bcryptjs');

const userModel = require('../models/userModel');
const clienteModel = require('../models/clienteModel');
const mediaModel = require('../models/mediaModel');
const { generateToken } = require('../services/auth');
const azuracast = require('../services/azuracast');
const authFactory = require('../middleware/auth');
const isCliente = require('../middleware/isCliente');

const router = express.Router();

const requireCliente = [authFactory('cliente'), isCliente];

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Obtiene el cliente asociado al token actual (cliente_id va en el JWT). */
function getCliente(req) {
  return clienteModel.findById(req.user.cliente_id);
}

// ==================================================================
//  AUTENTICACIÓN
// ==================================================================

router.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email y password son requeridos' });
  }

  const user = await userModel.findByEmailAndRole(email, 'cliente');
  if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

  const cliente = await clienteModel.findByUserId(user.id);
  if (!cliente) return res.status(403).json({ error: 'El usuario no tiene un cliente asociado' });
  if (!cliente.activo) return res.status(403).json({ error: 'Cuenta desactivada. Contacta al administrador.' });

  const token = generateToken(user.id, 'cliente', { cliente_id: cliente.id });
  res.json({
    token,
    user: { id: user.id, email: user.email, role: user.role, cliente_id: cliente.id },
  });
}));

router.post('/logout', requireCliente, (req, res) => {
  res.json({ message: 'Sesión cerrada. Elimina el token en el cliente.' });
});

router.get('/perfil', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  const user = await userModel.findById(cliente.user_id);

  res.json({
    perfil: {
      email: user?.email,
      nombre_empresa: cliente.nombre_empresa,
      plan: cliente.plan,
      created_at: cliente.created_at,
      activo: cliente.activo,
    },
  });
}));

// ==================================================================
//  MI ESTACIÓN
// ==================================================================

router.get('/mi-estacion', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const base = {
    nombre: cliente.nombre_empresa,
    plan: cliente.plan,
    url_streaming: cliente.url_streaming,
    azuracast_station_id: cliente.azuracast_station_id,
  };

  if (!cliente.azuracast_station_id) {
    return res.json({ estacion: { ...base, aviso: 'Estación aún no aprovisionada en AzuraCast.' } });
  }

  try {
    const station = await azuracast.getStation(cliente.azuracast_station_id);
    res.json({ estacion: { ...base, azuracast: station } });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
}));

router.get('/nowplaying', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const stationId = cliente.azuracast_station_id || 1;
  try {
    const data = await azuracast.getNowPlaying(stationId);
    res.json({ nowplaying: data });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
}));

router.put('/mi-estacion', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const { nombre } = req.body || {};
  const actualizado = await clienteModel.update(cliente.id, { nombre_empresa: nombre });
  res.json({ message: 'Estación actualizada ✅', estacion: { nombre: actualizado.nombre_empresa } });
}));

// ==================================================================
//  MEDIA (listado; el upload con multer llega en el siguiente paso)
// ==================================================================

router.get('/media', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  const media = await mediaModel.findByCliente(cliente.id);
  res.json({ media });
}));

// ==================================================================
//  ESTADÍSTICAS PERSONALES (mock por ahora)
// ==================================================================

router.get('/estadisticas', requireCliente, (req, res) => {
  res.json({
    oyentes_hoy: 0,
    oyentes_semana: 0,
    oyentes_mes: 0,
    cancion_mas_escuchada: null,
    pico_audiencia: 0,
  });
});

router.get('/estadisticas/historico', requireCliente, (req, res) => {
  res.json({ historico: [] });
});

module.exports = router;
