/**
 * video-agent/salud.js
 * ------------------------------------------------------------------
 * Lo que el nodo sabe de sí mismo y el panel no puede averiguar desde fuera:
 * cuánto CPU gasta, cuánta memoria queda, si le queda disco y si sus dos
 * servicios siguen de pie.
 *
 * El CPU se mide con una muestra de fondo cada 5 s en vez de al vuelo: para
 * saber el uso hay que comparar dos lecturas separadas en el tiempo, y hacer
 * esperar 5 s a quien pregunta convertiría cada carga del panel en una espera.
 * ------------------------------------------------------------------
 */
const fs = require('fs');
const fsp = fs.promises;
const { exec } = require('child_process');

const MUESTREO_MS = 5000;

/** Suma de los contadores de /proc/stat, separando el tiempo ocioso y el robado. */
function leerCpu() {
  try {
    const linea = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0];
    const n = linea.trim().split(/\s+/).slice(1).map(Number);
    // user nice system idle iowait irq softirq steal guest guest_nice
    const total = n.slice(0, 8).reduce((a, b) => a + b, 0);
    return { total, ocioso: (n[3] || 0) + (n[4] || 0), robado: n[7] || 0 };
  } catch (_) { return null; }
}

let anterior = leerCpu();
let cpuActual = { usado_pct: null, robado_pct: null };

setInterval(() => {
  const ahora = leerCpu();
  if (!ahora || !anterior) { anterior = ahora; return; }
  const dt = ahora.total - anterior.total;
  if (dt > 0) {
    const dOcioso = ahora.ocioso - anterior.ocioso;
    const dRobado = ahora.robado - anterior.robado;
    cpuActual = {
      // El robado NO es trabajo nuestro: es el hipervisor dándole nuestro turno
      // a otro inquilino. Se reporta aparte porque no se arregla optimizando.
      usado_pct: Math.max(0, Math.round(((dt - dOcioso - dRobado) / dt) * 100)),
      robado_pct: Math.max(0, Math.round((dRobado / dt) * 100)),
    };
  }
  anterior = ahora;
}, MUESTREO_MS).unref();

/** Memoria, contando la caché como disponible — que es lo que es. */
async function memoria() {
  try {
    const txt = await fsp.readFile('/proc/meminfo', 'utf8');
    const kb = (clave) => {
      const m = txt.match(new RegExp(`^${clave}:\\s+(\\d+) kB`, 'm'));
      return m ? Number(m[1]) * 1024 : 0;
    };
    const total = kb('MemTotal');
    const disponible = kb('MemAvailable');
    return {
      total_bytes: total,
      disponible_bytes: disponible,
      usado_bytes: Math.max(0, total - disponible),
      usado_pct: total ? Math.round(((total - disponible) / total) * 100) : null,
    };
  } catch (_) { return null; }
}

/** Espacio del disco donde viven los videos. */
function disco(ruta = '/') {
  return new Promise((resolve) => {
    exec(`df -PB1 ${ruta}`, (err, salida) => {
      if (err) return resolve(null);
      const l = String(salida).trim().split('\n').pop().split(/\s+/);
      const total = Number(l[1]) || 0;
      const usado = Number(l[2]) || 0;
      resolve({
        total_bytes: total, usado_bytes: usado,
        libre_bytes: Math.max(0, total - usado),
        usado_pct: total ? Math.round((usado / total) * 100) : null,
      });
    });
  });
}

/** ¿Sigue de pie? Se comprueba el proceso, no el servicio de systemd: lo que
 *  importa es que esté atendiendo, no cómo lo arrancaron. */
function procesoVivo(patron) {
  return new Promise((resolve) => {
    exec(`pgrep -f ${JSON.stringify(patron)}`, (err, salida) => {
      resolve(Boolean(!err && String(salida).trim()));
    });
  });
}

async function carga() {
  try {
    const [uno, cinco, quince] = (await fsp.readFile('/proc/loadavg', 'utf8')).split(/\s+/).map(Number);
    return [uno, cinco, quince];
  } catch (_) { return []; }
}

/** Foto completa del nodo. */
async function estado({ nucleos, rutaVideos = '/' } = {}) {
  const [mem, dsk, load, nginx, mediamtx] = await Promise.all([
    memoria(), disco(rutaVideos), carga(),
    procesoVivo('nginx: master'), procesoVivo('mediamtx'),
  ]);
  return {
    ok: true,
    cpu: { ...cpuActual, nucleos: nucleos || require('os').cpus().length, carga: load },
    memoria: mem,
    disco: dsk,
    servicios: { nginx, mediamtx },
    uptime_s: Math.round(require('os').uptime()),
  };
}

module.exports = { estado };
