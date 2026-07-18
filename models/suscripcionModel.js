/**
 * models/suscripcionModel.js — acceso a la tabla `suscripciones`
 */
const { query } = require('../config/database');

// pg devuelve NUMERIC como string; lo pasamos a número para la API.
function normaliza(row) {
  if (!row) return row;
  return { ...row, precio_mensual: Number(row.precio_mensual) };
}

async function findAll() {
  const { rows } = await query('SELECT * FROM suscripciones ORDER BY id');
  return rows.map(normaliza);
}

async function findById(id) {
  const { rows } = await query('SELECT * FROM suscripciones WHERE id = $1 LIMIT 1', [id]);
  return normaliza(rows[0]) || null;
}

async function create({ cliente_id, plan_tipo, precio_mensual }) {
  const { rows } = await query(
    `INSERT INTO suscripciones (cliente_id, plan_tipo, precio_mensual)
     VALUES ($1, $2, $3) RETURNING *`,
    [cliente_id, plan_tipo, precio_mensual]
  );
  return normaliza(rows[0]);
}

async function update(id, fields) {
  const allowed = ['plan_tipo', 'precio_mensual', 'estado', 'fecha_proxima_renovacion'];
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
    `UPDATE suscripciones SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  return normaliza(rows[0]) || null;
}

module.exports = { findAll, findById, create, update };
