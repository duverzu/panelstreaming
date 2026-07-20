/**
 * models/userModel.js — acceso a la tabla `users`
 *
 * OJO: el identificador único de login es `username`, NO el email.
 * Un mismo email puede tener VARIAS cuentas (un cliente con varias radios).
 */
const { query } = require('../config/database');

async function findByEmailAndRole(email, role) {
  const { rows } = await query(
    'SELECT * FROM users WHERE email = $1 AND role = $2 ORDER BY id LIMIT 1',
    [email, role]
  );
  return rows[0] || null;
}

async function findByEmail(email) {
  const { rows } = await query('SELECT * FROM users WHERE email = $1 ORDER BY id LIMIT 1', [email]);
  return rows[0] || null;
}

async function findByUsername(username) {
  const { rows } = await query('SELECT * FROM users WHERE lower(username) = lower($1) LIMIT 1', [username]);
  return rows[0] || null;
}

/**
 * Busca al usuario que intenta entrar. Acepta usuario o (por compatibilidad
 * con las cuentas viejas) email — el email solo sirve si es de una sola cuenta.
 */
async function findByLogin(identificador) {
  const porUsuario = await findByUsername(identificador);
  if (porUsuario) return porUsuario;
  const { rows } = await query('SELECT * FROM users WHERE lower(email) = lower($1)', [identificador]);
  return rows.length === 1 ? rows[0] : null; // email duplicado = ambiguo, debe usar su usuario
}

async function findById(id) {
  const { rows } = await query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
  return rows[0] || null;
}

/** Convierte un texto libre en un usuario válido: "Rock FM 88.5" → "rockfm885" */
function slugUsuario(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 40);
}

/**
 * Devuelve un username libre a partir de una base (nombre de la radio o email).
 * Si "rockfm" está ocupado prueba "rockfm2", "rockfm3"...
 */
async function generarUsername(base) {
  let raiz = slugUsuario(base);
  if (raiz.length < 3) raiz = 'radio' + raiz;
  let candidato = raiz;
  for (let n = 2; await findByUsername(candidato); n++) candidato = `${raiz}${n}`;
  return candidato;
}

async function create({ username, email, password_hash, role }) {
  const { rows } = await query(
    'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *',
    [username, email, password_hash, role]
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

module.exports = {
  findByEmailAndRole, findByEmail, findByUsername, findByLogin, findById,
  create, deleteById, updatePassword, generarUsername, slugUsuario,
};
