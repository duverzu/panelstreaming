/**
 * models/planModel.js — acceso a la tabla `planes`
 */
const { query } = require('../config/database');

function normaliza(row) {
  if (!row) return row;
  return { ...row, precio_mensual: Number(row.precio_mensual) };
}

async function findAll() {
  const { rows } = await query('SELECT * FROM planes ORDER BY precio_mensual, id');
  return rows.map(normaliza);
}

/** Planes globales (del admin, reseller_id NULL). */
async function findGlobales() {
  const { rows } = await query('SELECT * FROM planes WHERE reseller_id IS NULL ORDER BY id');
  return rows.map(normaliza);
}

/** Solo los planes propios de un revendedor. */
async function findDeReseller(resellerId) {
  const { rows } = await query('SELECT * FROM planes WHERE reseller_id = $1 ORDER BY id', [resellerId]);
  return rows.map(normaliza);
}

async function findById(id) {
  const { rows } = await query('SELECT * FROM planes WHERE id = $1 LIMIT 1', [id]);
  return normaliza(rows[0]) || null;
}

async function findByNombre(nombre) {
  const { rows } = await query('SELECT * FROM planes WHERE nombre = $1 LIMIT 1', [nombre]);
  return normaliza(rows[0]) || null;
}

async function create(p) {
  const { rows } = await query(
    `INSERT INTO planes (nombre, precio_mensual, max_bitrate, max_oyentes, espacio_mb, max_mounts,
                         permite_dj, reseller_id, tipo, max_resolucion, permite_restream)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [p.nombre, p.precio_mensual || 0,
     p.max_bitrate ?? (p.tipo === 'video' ? 2500 : 128),
     p.max_oyentes ?? 100,
     p.espacio_mb ?? (p.tipo === 'video' ? 51200 : 1024),
     p.max_mounts ?? 1, p.permite_dj ?? true, p.reseller_id ?? null,
     p.tipo === 'video' ? 'video' : 'audio',
     p.max_resolucion ?? '720p', p.permite_restream ?? false]
  );
  return normaliza(rows[0]);
}

async function update(id, fields) {
  const allowed = ['nombre', 'precio_mensual', 'max_bitrate', 'max_oyentes', 'espacio_mb', 'max_mounts', 'permite_dj', 'activo', 'tipo', 'max_resolucion', 'permite_restream'];
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
  const { rows } = await query(`UPDATE planes SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, values);
  return normaliza(rows[0]) || null;
}

async function deleteById(id) {
  await query('DELETE FROM planes WHERE id = $1', [id]);
}

module.exports = { findAll, findGlobales, findDeReseller, findById, findByNombre, create, update, deleteById };
