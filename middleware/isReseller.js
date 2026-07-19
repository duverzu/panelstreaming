/**
 * middleware/isReseller.js — usar DESPUÉS de auth('reseller').
 */
module.exports = function isReseller(req, res, next) {
  if (!req.user || req.user.role !== 'reseller') {
    return res.status(403).json({ error: 'Acceso denegado: se requiere rol de revendedor' });
  }
  next();
};
