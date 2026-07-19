/**
 * services/stats.js — agregación de oyentes multi-servidor.
 * Consulta el nowplaying de CADA servidor y evita colisión de station ids.
 */
const azuracast = require('./azuracast');

/** @param clientes lista con {id, nombre_empresa, azuracast_station_id, servidor_id} */
async function agregarOyentes(clientes) {
  const grupos = {}; // key ('def' | servidor_id) -> clientes[]
  clientes.forEach((c) => {
    if (!c.azuracast_station_id) return;
    const key = c.servidor_id == null ? 'def' : String(c.servidor_id);
    (grupos[key] ||= []).push(c);
  });

  let oyentes_totales = 0;
  let al_aire = 0;
  const ranking = [];

  for (const key of Object.keys(grupos)) {
    const az = await azuracast.paraServidorId(key === 'def' ? null : Number(key));
    const mapa = {};
    try {
      const np = await az.getNowPlayingAll();
      (np || []).forEach((est) => { if (est.station?.id != null) mapa[est.station.id] = est; });
    } catch (e) { console.error('[stats] nowplaying:', e.message); }

    grupos[key].forEach((c) => {
      const est = mapa[c.azuracast_station_id];
      const oy = est?.listeners?.current || 0;
      const online = !!est?.is_online;
      oyentes_totales += oy;
      if (online) al_aire += 1;
      ranking.push({ cliente_id: c.id, nombre: c.nombre_empresa, oyentes: oy, online });
    });
  }
  ranking.sort((a, b) => b.oyentes - a.oyentes);
  return { oyentes_totales, al_aire, ranking };
}

module.exports = { agregarOyentes };
