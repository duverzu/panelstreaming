/**
 * models/servidorModel.js — servidores AzuraCast (multi-servidor)
 */
const { query } = require('../config/database');

async function findById(id) {
  const { rows } = await query('SELECT * FROM servidores WHERE id = $1 LIMIT 1', [id]);
  return rows[0] || null;
}

/** Todos los servidores con su nº de radios asignadas (oculta la api_key). */
async function findAllConUso() {
  const { rows } = await query(
    `SELECT s.id, s.nombre, s.url, s.url_publica, s.tipo, s.capacidad_radios, s.banda_mensual_gb, s.activo, s.created_at,
            (SELECT COUNT(*)::int FROM clientes c WHERE c.servidor_id = s.id) AS radios
       FROM servidores s ORDER BY s.id`
  );
  return rows;
}

/** Elige el servidor activo con más espacio libre (o null si no hay). */
/**
 * Elige el servidor ACTIVO con más espacio, del tipo pedido.
 * `tipo` por defecto 'audio': así todo lo existente se comporta igual.
 */
async function elegirServidor(tipo = 'audio') {
  const { rows } = await query(
    `SELECT s.*, (SELECT COUNT(*)::int FROM clientes c WHERE c.servidor_id = s.id) AS radios
       FROM servidores s
      WHERE s.activo = true AND s.tipo = $1
      ORDER BY (s.capacidad_radios - (SELECT COUNT(*) FROM clientes c WHERE c.servidor_id = s.id)) DESC, s.id
      LIMIT 1`,
    [tipo]
  );
  const s = rows[0];
  if (!s) return null;
  if (s.radios >= s.capacidad_radios) return null; // el más libre ya está lleno
  return s;
}

async function create({ nombre, url, url_publica = null, api_key, tipo = 'audio', capacidad_radios = 100, banda_mensual_gb = 0 }) {
  const { rows } = await query(
    `INSERT INTO servidores (nombre, url, url_publica, api_key, tipo, capacidad_radios, banda_mensual_gb)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [nombre, url, url_publica, api_key, tipo === 'video' ? 'video' : 'audio', capacidad_radios, banda_mensual_gb]
  );
  return rows[0];
}

async function update(id, fields) {
  const allowed = ['nombre', 'url', 'url_publica', 'api_key', 'capacidad_radios', 'banda_mensual_gb', 'activo', 'tipo'];
  const sets = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (fields[key] !== undefined) { sets.push(`${key} = $${i++}`); values.push(fields[key]); }
  }
  if (sets.length === 0) return findById(id);
  values.push(id);
  const { rows } = await query(`UPDATE servidores SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, values);
  return rows[0] || null;
}

async function deleteById(id) {
  await query('DELETE FROM servidores WHERE id = $1', [id]);
}

module.exports = { findById, findAllConUso, elegirServidor, create, update, deleteById };
