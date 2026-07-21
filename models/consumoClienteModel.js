/**
 * models/consumoClienteModel.js — consumo de banda por RADIO y día.
 *
 * Lo llena el Guardián de Banda atribuyendo los oyentes de cada estación a
 * su cliente. Sumando los clientes de un revendedor sale su consumo total.
 */
const { query } = require('../config/database');

/** Suma bytes al consumo de HOY de una radio (upsert). */
async function registrar(clienteId, bytes) {
  await query(
    `INSERT INTO consumo_cliente (cliente_id, fecha, bytes)
     VALUES ($1, CURRENT_DATE, $2)
     ON CONFLICT (cliente_id, fecha) DO UPDATE SET bytes = consumo_cliente.bytes + EXCLUDED.bytes`,
    [clienteId, bytes]
  );
}

/** Serie diaria de los últimos N días de un revendedor (suma de sus radios). */
async function serieReseller(resellerId, dias = 30) {
  const { rows } = await query(
    `SELECT d.fecha, COALESCE(SUM(cc.bytes), 0)::bigint AS bytes
       FROM generate_series(CURRENT_DATE - ($2::int - 1), CURRENT_DATE, '1 day') AS d(fecha)
       LEFT JOIN clientes c        ON c.reseller_id = $1
       LEFT JOIN consumo_cliente cc ON cc.cliente_id = c.id AND cc.fecha = d.fecha
      GROUP BY d.fecha ORDER BY d.fecha`,
    [resellerId, dias]
  );
  return rows.map((r) => ({ fecha: r.fecha, bytes: Number(r.bytes) }));
}

/** Consumo del mes en curso de un revendedor (bytes). */
async function totalMesReseller(resellerId) {
  const { rows } = await query(
    `SELECT COALESCE(SUM(cc.bytes), 0)::bigint AS bytes
       FROM consumo_cliente cc JOIN clientes c ON c.id = cc.cliente_id
      WHERE c.reseller_id = $1 AND cc.fecha >= date_trunc('month', CURRENT_DATE)`,
    [resellerId]
  );
  return Number(rows[0].bytes);
}

/** Consumo del mes en curso por revendedor: { reseller_id: bytes } (para el listado). */
async function totalMesPorReseller() {
  const { rows } = await query(
    `SELECT c.reseller_id, COALESCE(SUM(cc.bytes), 0)::bigint AS bytes
       FROM consumo_cliente cc JOIN clientes c ON c.id = cc.cliente_id
      WHERE c.reseller_id IS NOT NULL AND cc.fecha >= date_trunc('month', CURRENT_DATE)
      GROUP BY c.reseller_id`
  );
  const mapa = {};
  rows.forEach((r) => { mapa[r.reseller_id] = Number(r.bytes); });
  return mapa;
}

/** Consumo del mes de cada radio de un revendedor: { cliente_id: bytes }. */
async function totalMesPorClienteDeReseller(resellerId) {
  const { rows } = await query(
    `SELECT cc.cliente_id, COALESCE(SUM(cc.bytes), 0)::bigint AS bytes
       FROM consumo_cliente cc JOIN clientes c ON c.id = cc.cliente_id
      WHERE c.reseller_id = $1 AND cc.fecha >= date_trunc('month', CURRENT_DATE)
      GROUP BY cc.cliente_id`,
    [resellerId]
  );
  const mapa = {};
  rows.forEach((r) => { mapa[r.cliente_id] = Number(r.bytes); });
  return mapa;
}

/** Consumo del mes en curso de UNA radio (bytes). Se calcula en SQL para que
 *  el corte de mes lo haga Postgres y no dependa de la zona horaria del proceso. */
async function totalMesCliente(clienteId) {
  const { rows } = await query(
    `SELECT COALESCE(SUM(bytes), 0)::bigint AS bytes
       FROM consumo_cliente
      WHERE cliente_id = $1 AND fecha >= date_trunc('month', CURRENT_DATE)`,
    [clienteId]
  );
  return Number(rows[0].bytes);
}

/** Serie diaria de UNA radio (para el panel del cliente / detalle). */
async function serieCliente(clienteId, dias = 30) {
  const { rows } = await query(
    `SELECT d.fecha, COALESCE(cc.bytes, 0)::bigint AS bytes
       FROM generate_series(CURRENT_DATE - ($2::int - 1), CURRENT_DATE, '1 day') AS d(fecha)
       LEFT JOIN consumo_cliente cc ON cc.cliente_id = $1 AND cc.fecha = d.fecha
      ORDER BY d.fecha`,
    [clienteId, dias]
  );
  return rows.map((r) => ({ fecha: r.fecha, bytes: Number(r.bytes) }));
}

module.exports = {
  registrar, serieReseller, totalMesReseller, totalMesPorReseller,
  totalMesPorClienteDeReseller, serieCliente, totalMesCliente,
};
