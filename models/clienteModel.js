/**
 * models/clienteModel.js — acceso a la tabla `clientes`
 */
const { query } = require('../config/database');

/** Todos los clientes, incluyendo el email de su usuario. */
async function findAllWithEmail() {
  const { rows } = await query(
    `SELECT c.*, u.email, u.username
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
  reseller_id = null,
  servidor_id = null,
  short_name = null,
  tipo = 'audio',
}) {
  const { rows } = await query(
    `INSERT INTO clientes (user_id, nombre_empresa, plan, azuracast_station_id, url_streaming, reseller_id, servidor_id, short_name, tipo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [user_id, nombre_empresa, plan, azuracast_station_id, url_streaming, reseller_id, servidor_id, short_name, tipo]
  );
  return rows[0];
}

/** Busca un cliente por el shortcode de su estación (para reproductor/embed público). */
async function findByShortName(shortName) {
  const { rows } = await query('SELECT * FROM clientes WHERE short_name = $1 LIMIT 1', [shortName]);
  return rows[0] || null;
}

/** Clientes de un revendedor (con email). */
async function findByReseller(resellerId) {
  const { rows } = await query(
    `SELECT c.*, u.email, u.username FROM clientes c JOIN users u ON u.id = c.user_id
     WHERE c.reseller_id = $1 ORDER BY c.id`,
    [resellerId]
  );
  return rows;
}

/** Cuenta cuántas radios tiene un revendedor. */
async function countByReseller(resellerId) {
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM clientes WHERE reseller_id = $1', [resellerId]);
  return rows[0].n;
}

/** Actualiza solo los campos permitidos que vengan definidos. */
async function update(id, fields) {
  const allowed = ['nombre_empresa', 'plan', 'activo', 'azuracast_station_id', 'url_streaming',
    'dj_puerto', 'dj_usuario', 'dj_password'];
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

/**
 * Reescribe la URL de escucha de todas las radios de un servidor cuando cambia
 * su dominio público (las radios ya creadas la tienen guardada en la fila).
 * Devuelve cuántas se actualizaron.
 */
async function reescribirUrls(servidorId, baseUrlPublica, esDefecto = false) {
  const base = String(baseUrlPublica).replace(/\/+$/, '');
  const { rowCount } = await query(
    `UPDATE clientes
        SET url_streaming = $1 || '/listen/' || short_name || '/radio.mp3'
      WHERE short_name IS NOT NULL
        AND (servidor_id = $2 OR ($3 AND servidor_id IS NULL))`,
    [base, servidorId, esDefecto]
  );
  return rowCount;
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

module.exports = { reescribirUrls, findAllWithEmail, findById, findByUserId, findByShortName, create, update, stats, findByReseller, countByReseller };
