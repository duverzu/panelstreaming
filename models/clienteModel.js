/**
 * models/clienteModel.js — acceso a la tabla `clientes`
 */
const { query } = require('../config/database');

/** Todos los clientes, incluyendo el email de su usuario. */
async function findAllWithEmail() {
  const { rows } = await query(
    `SELECT c.*, u.email
       FROM clientes c
       JOIN users u ON u.id = c.user_id
       ORDER BY c.id`
  );
  return rows;
}

async function findById(id) {
  const { rows } = await query('SELECT * FROM clientes WHERE id = $1 LIMIT 1', [id]);
  return rows[0] || null;
}

async function findByUserId(userId) {
  const { rows } = await query('SELECT * FROM clientes WHERE user_id = $1 LIMIT 1', [userId]);
  return rows[0] || null;
}

async function create({
  user_id,
  nombre_empresa,
  plan = 'basico',
  azuracast_station_id = null,
  url_streaming = null,
}) {
  const { rows } = await query(
    `INSERT INTO clientes (user_id, nombre_empresa, plan, azuracast_station_id, url_streaming)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [user_id, nombre_empresa, plan, azuracast_station_id, url_streaming]
  );
  return rows[0];
}

/** Actualiza solo los campos permitidos que vengan definidos. */
async function update(id, fields) {
  const allowed = ['nombre_empresa', 'plan', 'activo', 'azuracast_station_id', 'url_streaming'];
  const sets = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = $${i++}`);
      values.push(fields[key]);
    }
  }
  if (sets.length === 0) return findById(id);
  values.push(id);
  const { rows } = await query(
    `UPDATE clientes SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  return rows[0] || null;
}

/** Métricas globales para el panel admin. */
async function stats() {
  const { rows } = await query(
    `SELECT
        COUNT(*)::int                                          AS total_clientes,
        COUNT(*) FILTER (WHERE activo)::int                    AS clientes_activos,
        COUNT(*) FILTER (WHERE azuracast_station_id IS NOT NULL)::int AS estaciones
      FROM clientes`
  );
  return rows[0];
}

module.exports = { findAllWithEmail, findById, findByUserId, create, update, stats };
