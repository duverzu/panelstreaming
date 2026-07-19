/**
 * middleware/apiKey.js — autentica peticiones de integraciones externas.
 * Acepta la llave en el header Authorization: Bearer <token> o X-Api-Key.
 */
const apiKeyModel = require('../models/apiKeyModel');

module.exports = async function apiKeyAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : (req.headers['x-api-key'] || '').trim();
  if (!token) return res.status(401).json({ error: 'API key requerida (Authorization: Bearer <token>)' });
  try {
    const key = await apiKeyModel.findByToken(token);
    if (!key || !key.activo) return res.status(401).json({ error: 'API key inválida o desactivada' });
    apiKeyModel.touch(key.id).catch(() => {});
    req.apiKey = key;
    next();
  } catch (e) {
    res.status(500).json({ error: 'Error validando la API key' });
  }
};
