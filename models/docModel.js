/**
 * models/docModel.js — artículos de documentación / centro de ayuda.
 */
const { query } = require('../config/database');

/** Lista publicada (sin el contenido pesado). */
async function findPublicadas() {
  const { rows } = await query(
    `SELECT id, titulo, categoria, orden FROM documentacion
      WHERE publicado = true ORDER BY categoria, orden, id`
  );
  return rows;
}

/** Todos (admin). */
async function findAll() {
  const { rows } = await query('SELECT id, titulo, categoria, orden, publicado, updated_at FROM documentacion ORDER BY categoria, orden, id');
  return rows;
}

async function findById(id) {
  const { rows } = await query('SELECT * FROM documentacion WHERE id = $1 LIMIT 1', [id]);
  return rows[0] || null;
}

async function create({ titulo, categoria = 'General', contenido = '', orden = 0, publicado = true }) {
  const { rows } = await query(
    `INSERT INTO documentacion (titulo, categoria, contenido, orden, publicado)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [titulo, categoria, contenido, orden, publicado]
  );
  return rows[0];
}

async function update(id, fields) {
  const allowed = ['titulo', 'categoria', 'contenido', 'orden', 'publicado'];
  const sets = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (fields[key] !== undefined) { sets.push(`${key} = $${i++}`); values.push(fields[key]); }
  }
  sets.push('updated_at = now()');
  if (sets.length === 1) return findById(id);
  values.push(id);
  const { rows } = await query(`UPDATE documentacion SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, values);
  return rows[0] || null;
}

async function deleteById(id) {
  await query('DELETE FROM documentacion WHERE id = $1', [id]);
}

async function contar() {
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM documentacion');
  return rows[0].n;
}

module.exports = { findPublicadas, findAll, findById, create, update, deleteById, contar };
