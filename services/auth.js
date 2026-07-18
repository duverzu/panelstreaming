/**
 * services/auth.js
 * ------------------------------------------------------------------
 * Generación y verificación de tokens JWT.
 * Usamos SECRETS SEPARADOS para admin y cliente, de forma que un
 * token de cliente jamás pueda validarse como admin ni viceversa.
 * ------------------------------------------------------------------
 */

const jwt = require('jsonwebtoken');

const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

/** Devuelve el secret correcto según el rol. */
function getSecret(role) {
  if (role === 'admin') return process.env.JWT_ADMIN_SECRET;
  if (role === 'cliente') return process.env.JWT_CLIENTE_SECRET;
  throw new Error(`Rol desconocido para JWT: ${role}`);
}

/**
 * Genera un token firmado.
 * @param {number} userId
 * @param {'admin'|'cliente'} role
 * @param {object} [extra] - datos extra a incluir (ej: cliente_id)
 */
function generateToken(userId, role, extra = {}) {
  const payload = { sub: userId, role, ...extra };
  return jwt.sign(payload, getSecret(role), { expiresIn: EXPIRES_IN });
}

/**
 * Verifica un token para un rol concreto.
 * @param {string} token
 * @param {'admin'|'cliente'} role
 * @returns {object} payload decodificado
 * @throws si el token es inválido o expiró
 */
function verifyToken(token, role) {
  return jwt.verify(token, getSecret(role));
}

module.exports = { generateToken, verifyToken };
