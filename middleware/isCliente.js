/**
 * middleware/isCliente.js
 * ------------------------------------------------------------------
 * Debe usarse DESPUÉS del middleware de auth('cliente').
 * Confirma que el rol del token sea 'cliente'.
 * ------------------------------------------------------------------
 */

module.exports = function isCliente(req, res, next) {
  if (!req.user || req.user.role !== 'cliente') {
    return res.status(403).json({ error: 'Acceso denegado: se requiere rol de cliente' });
  }
  next();
};
