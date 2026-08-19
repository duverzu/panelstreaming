/**
 * services/banda.js
 * ------------------------------------------------------------------
 * La cuenta del guardián: a partir del consumo diario de un mes y un tope,
 * saca a cuánto se termina el mes, qué día se agotaría y en qué estado va.
 *
 * Vive aquí y no dentro de una ruta porque lo usan los NODOS del panel y las
 * MÁQUINAS vigiladas. Copiado en los dos sitios, el día que se toque un umbral
 * solo se arreglaría uno, y dos tarjetas iguales dirían cosas distintas.
 * ------------------------------------------------------------------
 */
const GB = 1024 ** 3;

/**
 * @param {Array<{fecha, bytes}>} dias  consumo diario del mes en curso
 * @param {number|null} tope_gb
 * @param {Date} [ahora]
 */
function calcular(dias, tope_gb, ahora = new Date()) {
  const tope = Number(tope_gb) || null;
  const gb = dias.reduce((a, d) => a + Number(d.bytes), 0) / GB;

  const diaActual = ahora.getUTCDate();
  const diasDelMes = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() + 1, 0)).getUTCDate();
  const diasRestantes = Math.max(0, diasDelMes - diaActual);

  // El ritmo sale de los últimos 7 días, no del mes entero: si una radio se
  // dio de alta hace tres días, promediar sobre 30 la haría parecer inofensiva.
  const ultimos = dias.slice(-7);
  const promedio = ultimos.length
    ? ultimos.reduce((a, d) => a + Number(d.bytes), 0) / GB / ultimos.length
    : gb / Math.max(1, diaActual);

  const proyeccion = gb + promedio * diasRestantes;

  let dia_agotamiento = null;
  if (tope && promedio > 0 && proyeccion > tope) {
    const faltan = Math.max(0, (tope - gb) / promedio);
    const dia = Math.ceil(diaActual + faltan);
    if (dia <= diasDelMes) dia_agotamiento = dia;
  }

  const pct = tope ? (gb / tope) * 100 : null;
  const pctProy = tope ? (proyeccion / tope) * 100 : null;

  // Manda lo ya consumido, pero la proyección puede adelantar el estado: aún
  // vas por el 40% y al ritmo actual revientas el tope.
  let estado = 'sin-tope';
  if (tope) {
    if (pct >= 90) estado = 'critico';
    else if (pct >= 75 || (pctProy != null && pctProy >= 100)) estado = 'riesgo';
    else if (pct >= 50 || (pctProy != null && pctProy >= 80)) estado = 'atencion';
    else estado = 'ok';
  }

  const r2 = (n) => Math.round(n * 100) / 100;
  return {
    consumido_gb: r2(gb),
    tope_gb: tope,
    pct: tope ? Math.min(100, Math.round(pct)) : null,
    promedio_diario_gb: r2(promedio),
    proyeccion_gb: r2(proyeccion),
    proyeccion_pct: pctProy != null ? Math.round(pctProy) : null,
    dia_agotamiento,
    dias_restantes: diasRestantes,
    dias_del_mes: diasDelMes,
    estado,
    desde_dia: dias.length ? new Date(dias[0].fecha).getUTCDate() : null,
    por_dia: dias.map((d) => ({ dia: new Date(d.fecha).getUTCDate(), gb: r2(Number(d.bytes) / GB) })),
  };
}

module.exports = { calcular, GB };
