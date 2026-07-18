/**
 * models/mediaModel.js — acceso a la tabla `media`
 */
const { query } = require('../config/database');

async function findByCliente(clienteId) {
  const { rows } = await query(
    'SELECT * FROM media WHERE cliente_id = $1 ORDER BY id DESC',
    [clienteId]
  );
  return rows;
}

async function create({ cliente_id, azuracast_media_id, titulo, artista, duracion, archivo_ruta }) {
  const { rows } = await query(
    `INSERT INTO media (cliente_id, azuracast_media_id, titulo, artista, duracion, archivo_ruta)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [cliente_id, azuracast_media_id, titulo, artista, duracion, archivo_ruta]
  );
  return rows[0];
}

async function deleteById(id, clienteId) {
  // El clienteId asegura que un cliente solo borre SU propia media.
  const { rowCount } = await query(
    'DELETE FROM media WHERE id = $1 AND cliente_id = $2',
    [id, clienteId]
  );
  return rowCount > 0;
}

module.exports = { findByCliente, create, deleteById };
