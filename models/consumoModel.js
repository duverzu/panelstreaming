/**
 * models/consumoModel.js — consumo de banda por servidor/día.
 */
const { query } = require('../config/database');

/** Suma bytes al consumo de HOY de un servidor (upsert). */
async function registrar(servidorId, bytes) {
  await query(
    `INSERT INTO consumo_banda (servidor_id, fecha, bytes)
     VALUES ($1, CURRENT_DATE, $2)
     ON CONFLICT (servidor_id, fecha) DO UPDATE SET bytes = consumo_banda.bytes + EXCLUDED.bytes`,
    [servidorId, bytes]
  );
}

/** Consumo diario del mes en curso para un servidor. */
async function mesActual(servidorId) {
  const { rows } = await query(
    `SELECT fecha, bytes FROM consumo_banda
      WHERE servidor_id = $1 AND fecha >= date_trunc('month', CURRENT_DATE)
      ORDER BY fecha`,
    [servidorId]
  );
  return rows;
}

module.exports = { registrar, mesActual };
