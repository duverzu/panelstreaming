/**
 * models/planResellerModel.js — acceso a la tabla `planes_reseller`
 *
 * Paquetes de mayorista que define el super admin y que se venden como
 * servicio (igual que los planes de radio, pero para cuentas de revendedor).
 */
const { query } = require('../config/database');

async function findAll() {
  const { rows } = await query('SELECT * FROM planes_reseller ORDER BY cupo_radios, id');
  return rows;
}

async function findActivos() {
  const { rows } = await query('SELECT * FROM planes_reseller WHERE activo ORDER BY cupo_radios, id');
  return rows;
}

async function findById(id) {
  const { rows } = await query('SELECT * FROM planes_reseller WHERE id = $1 LIMIT 1', [id]);
  return rows[0] || null;
}

async function findByNombre(nombre) {
  const { rows } = await query('SELECT * FROM planes_reseller WHERE lower(nombre) = lower($1) LIMIT 1', [nombre]);
  return rows[0] || null;
}

async function create({ nombre, cupo_radios = 5, max_oyentes_total = 500, espacio_total_mb = 10240, activo = true }) {
  const { rows } = await query(
    `INSERT INTO planes_reseller (nombre, cupo_radios, max_oyentes_total, espacio_total_mb, activo)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [nombre, cupo_radios, max_oyentes_total, espacio_total_mb, activo]
  );
  return rows[0];
}

async function update(id, fields) {
  const allowed = ['nombre', 'cupo_radios', 'max_oyentes_total', 'espacio_total_mb', 'activo'];
  const sets = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (fields[key] !== undefined) { sets.push(`${key} = $${i++}`); values.push(fields[key]); }
  }
  if (sets.length === 0) return findById(id);
  values.push(id);
  const { rows } = await query(`UPDATE planes_reseller SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, values);
  return rows[0] || null;
}

async function deleteById(id) {
  await query('DELETE FROM planes_reseller WHERE id = $1', [id]);
}

module.exports = { findAll, findActivos, findById, findByNombre, create, update, deleteById };
