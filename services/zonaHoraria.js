/**
 * zonaHoraria.js — hora LOCAL del cliente para la programación.
 * ------------------------------------------------------------------
 * Antes las cuñas y el anuncio de hora usaban la hora del SERVIDOR (UTC),
 * así que todo sonaba corrido (p.ej. 5h en Colombia). Aquí calculamos la
 * hora en la zona horaria del cliente (por defecto America/Bogota).
 * ------------------------------------------------------------------
 */
const DEFAULT_TZ = process.env.TZ_DEFAULT || 'America/Bogota';

/** Hora y minuto actuales (números 0-23 / 0-59) en una zona horaria IANA. */
function partesEnZona(tz = DEFAULT_TZ) {
  try {
    const p = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || DEFAULT_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date());
    const hora = Number(p.find((x) => x.type === 'hour').value) % 24;   // 24 → 0
    const minuto = Number(p.find((x) => x.type === 'minute').value);
    return { hora, minuto };
  } catch (_) {
    const d = new Date();   // zona inválida: cae a la del servidor
    return { hora: d.getHours(), minuto: d.getMinutes() };
  }
}

// Zonas comunes para el selector del panel (Latinoamérica + algunas globales).
const ZONAS = [
  'America/Bogota', 'America/Mexico_City', 'America/Lima', 'America/Santiago',
  'America/Argentina/Buenos_Aires', 'America/Caracas', 'America/Guayaquil',
  'America/Panama', 'America/New_York', 'America/Los_Angeles', 'America/Sao_Paulo',
  'Europe/Madrid', 'UTC',
];

module.exports = { partesEnZona, DEFAULT_TZ, ZONAS };
