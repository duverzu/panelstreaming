/**
 * middleware/isAdmin.js
 * ------------------------------------------------------------------
 * Debe usarse DESPUÉS del middleware de auth('admin').
 * Confirma que el rol del token sea 'admin'.
 * ------------------------------------------------------------------
 */

module.exports = function isAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado: se requiere rol de administrador' });
  }
  next();
};
