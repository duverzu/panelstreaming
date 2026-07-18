/**
 * middleware/auth.js
 * ------------------------------------------------------------------
 * Fábrica de middleware de autenticación por JWT.
 *
 *   authFactory('admin')   -> valida token de admin
 *   authFactory('cliente') -> valida token de cliente
 *
 * Extrae el token del header:  Authorization: Bearer <token>
 * Si es válido, deja el payload en req.user y continúa.
 * Si no, responde 401 con { error: "..." }.
 * ------------------------------------------------------------------
 */

const { verifyToken } = require('../services/auth');

function authFactory(role) {
  return function auth(req, res, next) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Token no proporcionado. Usa el header Authorization: Bearer <token>' });
    }

    try {
      const payload = verifyToken(token, role);
      req.user = payload; // { sub, role, ...extra }
      next();
    } catch (err) {
      const msg = err.name === 'TokenExpiredError' ? 'Token expirado' : 'Token inválido';
      return res.status(401).json({ error: msg });
    }
  };
}

module.exports = authFactory;
