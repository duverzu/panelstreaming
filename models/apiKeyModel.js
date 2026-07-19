/**
 * models/apiKeyModel.js — llaves de API para integraciones externas.
 */
const { query } = require('../config/database');

async function findByToken(token) {
  const { rows } = await query('SELECT * FROM api_keys WHERE token = $1 LIMIT 1', [token]);
  return rows[0] || null;
}

/** Lista para el admin (token enmascarado). */
async function findAll() {
  const { rows } = await query('SELECT id, nombre, token, activo, ultimo_uso, created_at FROM api_keys ORDER BY id');
  return rows.map((k) => ({ ...k, token: k.token.slice(0, 6) + '••••••••' + k.token.slice(-4) }));
}

async function create({ nombre, token }) {
  const { rows } = await query('INSERT INTO api_keys (nombre, token) VALUES ($1,$2) RETURNING *', [nombre, token]);
  return rows[0];
}

async function setActivo(id, activo) {
  const { rows } = await query('UPDATE api_keys SET activo = $1 WHERE id = $2 RETURNING id, nombre, activo', [activo, id]);
  return rows[0] || null;
}

async function deleteById(id) {
  await query('DELETE FROM api_keys WHERE id = $1', [id]);
}

async function touch(id) {
  await query('UPDATE api_keys SET ultimo_uso = now() WHERE id = $1', [id]);
}

module.exports = { findByToken, findAll, create, setActivo, deleteById, touch };
