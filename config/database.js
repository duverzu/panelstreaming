/**
 * config/database.js
 * ------------------------------------------------------------------
 * Conexión real a PostgreSQL mediante un pool de conexiones (pg).
 * Toda la app usa `query()` — las rutas nunca abren conexiones a mano.
 * ------------------------------------------------------------------
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // En producción con SSL gestionado por el propio servidor local no hace falta
  // configurar ssl. Si algún día usas una BD remota con SSL, se agrega aquí.
});

// Si el pool tiene un error de conexión inesperado, lo logueamos (no tumbamos el proceso).
pool.on('error', (err) => {
  console.error('[PG] Error inesperado en el pool:', err.message);
});

/** Ejecuta una consulta parametrizada. Devuelve el resultado de pg. */
function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
