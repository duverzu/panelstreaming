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
const { generateToken } = require('../services/auth');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email y password son requeridos' });
  }

  const user = await userModel.findByEmail(email);
  if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

  // --- Admin ---
  if (user.role === 'admin') {
    const token = generateToken(user.id, 'admin');
    return res.json({
      token,
      role: 'admin',
      user: { id: user.id, email: user.email, role: 'admin' },
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
      user: { id: user.id, email: user.email, role: 'reseller', reseller_id: reseller.id, nombre_empresa: reseller.nombre_empresa },
    });
  }

  // --- Cliente ---
  const cliente = await clienteModel.findByUserId(user.id);
  if (!cliente) return res.status(403).json({ error: 'El usuario no tiene un cliente asociado' });
  if (!cliente.activo) return res.status(403).json({ error: 'Cuenta desactivada. Contacta al administrador.' });

  const token = generateToken(user.id, 'cliente', { cliente_id: cliente.id });
  res.json({
    token,
    role: 'cliente',
    user: {
      id: user.id,
      email: user.email,
      role: 'cliente',
      cliente_id: cliente.id,
      nombre_empresa: cliente.nombre_empresa,
    },
  });
}));

module.exports = router;
