/**
 * models/docModel.js — artículos de documentación / centro de ayuda.
 * Cada artículo tiene una `audiencia`: 'audio' (clientes de radio), 'video'
 * (clientes de streaming de video) o 'todos'. El cliente ve la suya + 'todos'.
 */
const { query } = require('../config/database');

/** Lista publicada (sin el contenido pesado), filtrada por audiencia. */
async function findPublicadas(audiencia) {
  const cond = audiencia ? "AND (audiencia = $1 OR audiencia = 'todos')" : '';
  const { rows } = await query(
    `SELECT id, titulo, categoria, orden, audiencia FROM documentacion
      WHERE publicado = true ${cond} ORDER BY categoria, orden, id`,
    audiencia ? [audiencia] : []
  );
  return rows;
}

/** Todos (admin), opcionalmente acotado a una audiencia. */
async function findAll(audiencia) {
  const cond = audiencia ? 'WHERE audiencia = $1' : '';
  const { rows } = await query(
    `SELECT id, titulo, categoria, orden, publicado, audiencia, updated_at
       FROM documentacion ${cond} ORDER BY categoria, orden, id`,
    audiencia ? [audiencia] : []
  );
  return rows;
}

async function findById(id) {
  const { rows } = await query('SELECT * FROM documentacion WHERE id = $1 LIMIT 1', [id]);
  return rows[0] || null;
}

async function create({ titulo, categoria = 'General', contenido = '', orden = 0, publicado = true, audiencia = 'audio' }) {
  const { rows } = await query(
    `INSERT INTO documentacion (titulo, categoria, contenido, orden, publicado, audiencia)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [titulo, categoria, contenido, orden, publicado, audiencia === 'video' || audiencia === 'todos' ? audiencia : 'audio']
  );
  return rows[0];
}

async function update(id, fields) {
  const allowed = ['titulo', 'categoria', 'contenido', 'orden', 'publicado', 'audiencia'];
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
