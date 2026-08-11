/**
 * routes/auth.js
 * ------------------------------------------------------------------
 * Login ÚNICO para admin y cliente (montado en /api/auth).
 * El backend detecta el rol del usuario y devuelve el token correcto
 * (con su secret correspondiente) + el rol, para que el frontend
 * redirija al panel adecuado.
 * ------------------------------------------------------------------
 */

const express = require('express');
const bcrypt = require('bcryptjs');

const userModel = require('../models/userModel');
const clienteModel = require('../models/clienteModel');
const resellerModel = require('../models/resellerModel');
const { generateToken, verifyToken } = require('../services/auth');
const { capacidadesCliente } = require('../services/capacidadesCliente');
const rateLimit = require('../middleware/rateLimit');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Máx 10 intentos por usuario por minuto (freno a la fuerza bruta de claves).
const limiteLogin = rateLimit({ max: 10, ventanaMs: 60000, clave: (req) => (req.body?.usuario || req.body?.email || req.ip) });

router.post('/login', limiteLogin, wrap(async (req, res) => {
  // Se entra con USUARIO. Se acepta `email` por compatibilidad con cuentas viejas
  // (solo funciona si ese correo tiene una única cuenta; si tiene varias radios
  // el correo es ambiguo y debe usar su usuario).
  const { usuario, email, password } = req.body || {};
  const identificador = (usuario || email || '').trim();
  if (!identificador || !password) {
    return res.status(400).json({ error: 'usuario y password son requeridos' });
  }

  const user = await userModel.findByLogin(identificador);
  if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

  // --- Admin ---
  if (user.role === 'admin') {
    const token = generateToken(user.id, 'admin');
    return res.json({
      token,
      role: 'admin',
      user: { id: user.id, username: user.username, email: user.email, role: 'admin' },
    });
  }

  // --- Revendedor ---
  if (user.role === 'reseller') {
    const reseller = await resellerModel.findByUserId(user.id);
    if (!reseller) return res.status(403).json({ error: 'El usuario no tiene un revendedor asociado' });
    if (!reseller.activo) return res.status(403).json({ error: 'Cuenta de revendedor desactivada.' });
    const token = generateToken(user.id, 'reseller', { reseller_id: reseller.id });
    return res.json({
      token,
      role: 'reseller',
      user: { id: user.id, username: user.username, email: user.email, role: 'reseller', reseller_id: reseller.id, nombre_empresa: reseller.nombre_empresa },
    });
  }

  // --- Cliente ---
  const cliente = await clienteModel.findByUserId(user.id);
  if (!cliente) return res.status(403).json({ error: 'El usuario no tiene un cliente asociado' });
  if (!cliente.activo) return res.status(403).json({ error: 'Cuenta desactivada. Contacta al administrador.' });

  const token = generateToken(user.id, 'cliente', { cliente_id: cliente.id });
  const cap = await capacidadesCliente(cliente);
  res.json({
    token,
    role: 'cliente',
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: 'cliente',
      cliente_id: cliente.id,
      nombre_empresa: cliente.nombre_empresa,
      tipo: cliente.tipo || 'audio',
      ...cap,
    },
  });
}));

/**
 * POST /api/auth/sso — canjea un token SSO corto (generado por el panel de
 * facturación vía /api/provision/servicios/:id/login) por una sesión normal
 * de cliente. El token corto vive pocos minutos y solo sirve para esto.
 */
router.post('/sso', rateLimit({ max: 30, ventanaMs: 60000 }), wrap(async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token requerido' });

  let payload;
  try { payload = verifyToken(token, 'cliente'); }
  catch { return res.status(401).json({ error: 'Enlace inválido o vencido. Pide uno nuevo.' }); }
  if (!payload.sso) return res.status(401).json({ error: 'Token no válido para inicio de sesión' });

  const cliente = await clienteModel.findById(payload.cliente_id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (!cliente.activo) return res.status(403).json({ error: 'Cuenta desactivada. Reactívala para entrar.' });
  const user = await userModel.findById(cliente.user_id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const sesion = generateToken(cliente.user_id, 'cliente', { cliente_id: cliente.id });
  const cap = await capacidadesCliente(cliente);
  res.json({
    token: sesion,
    role: 'cliente',
    user: {
      id: user.id, username: user.username, email: user.email, role: 'cliente',
      cliente_id: cliente.id, nombre_empresa: cliente.nombre_empresa, tipo: cliente.tipo || 'audio', ...cap,
    },
  });
}));

module.exports = router;
