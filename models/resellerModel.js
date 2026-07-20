/**
 * models/resellerModel.js — acceso a la tabla `resellers`
 */
const { query } = require('../config/database');

async function findByUserId(userId) {
  const { rows } = await query('SELECT * FROM resellers WHERE user_id = $1 LIMIT 1', [userId]);
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await query('SELECT * FROM resellers WHERE id = $1 LIMIT 1', [id]);
  return rows[0] || null;
}

/** Todos los revendedores con email + nº de radios usadas. */
async function findAllWithEmail() {
  const { rows } = await query(
    `SELECT r.*, u.email, u.username,
            (SELECT COUNT(*)::int FROM clientes c WHERE c.reseller_id = r.id) AS radios_usadas
       FROM resellers r JOIN users u ON u.id = r.user_id
       ORDER BY r.id`
  );
  return rows;
}

async function create({ user_id, nombre_empresa, cupo_radios = 5, max_oyentes_total = 500, espacio_total_mb = 10240 }) {
  const { rows } = await query(
    `INSERT INTO resellers (user_id, nombre_empresa, cupo_radios, max_oyentes_total, espacio_total_mb)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [user_id, nombre_empresa, cupo_radios, max_oyentes_total, espacio_total_mb]
  );
  return rows[0];
}

/** Recursos ya usados por el revendedor (suma de los planes de sus radios). */
async function usoRecursos(resellerId) {
  const { rows } = await query(
    `SELECT COALESCE(SUM(p.max_oyentes),0)::int AS oyentes,
            COALESCE(SUM(p.espacio_mb),0)::int  AS espacio
       FROM clientes c LEFT JOIN planes p ON p.nombre = c.plan
      WHERE c.reseller_id = $1`,
    [resellerId]
  );
  return rows[0];
}

async function update(id, fields) {
  const allowed = ['nombre_empresa', 'cupo_radios', 'activo', 'max_oyentes_total', 'espacio_total_mb'];
  const sets = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (fields[key] !== undefined) { sets.push(`${key} = $${i++}`); values.push(fields[key]); }
  }
  if (sets.length === 0) return findById(id);
  values.push(id);
  const { rows } = await query(`UPDATE resellers SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, values);
  return rows[0] || null;
}

module.exports = { findByUserId, findById, findAllWithEmail, create, update, usoRecursos };
