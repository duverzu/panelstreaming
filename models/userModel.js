/**
 * models/userModel.js — acceso a la tabla `users`
 */
const { query } = require('../config/database');

async function findByEmailAndRole(email, role) {
  const { rows } = await query(
    'SELECT * FROM users WHERE email = $1 AND role = $2 LIMIT 1',
    [email, role]
  );
  return rows[0] || null;
}

async function findByEmail(email) {
  const { rows } = await query('SELECT * FROM users WHERE email = $1 LIMIT 1', [email]);
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
  return rows[0] || null;
}

async function create({ email, password_hash, role }) {
  const { rows } = await query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING *',
    [email, password_hash, role]
  );
  return rows[0];
}

/** Borra el usuario; por las FK ON DELETE CASCADE arrastra su cliente, media y suscripciones. */
async function deleteById(id) {
  await query('DELETE FROM users WHERE id = $1', [id]);
}

async function updatePassword(id, password_hash) {
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, id]);
}

module.exports = { findByEmailAndRole, findByEmail, findById, create, deleteById, updatePassword };
