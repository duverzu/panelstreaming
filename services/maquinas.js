/**
 * services/maquinas.js
 * ------------------------------------------------------------------
 * Vigila máquinas que NO son nodos del panel: el servidor donde vive el propio
 * panel, el de otro producto, el de un cliente.
 *
 * No hay que instalar NADA en la máquina vigilada. Se le pide una lectura de
 * /proc y df por SSH, con la llave que esas máquinas ya usan entre sí. Un
 * agente propio seria otra pieza que mantener, actualizar y que se puede caer
 * justo cuando hace falta mirar.
 *
 * Solo se ejecutan lecturas. Nada de lo que manda este archivo escribe en la
 * máquina remota.
 * ------------------------------------------------------------------
 */
const { execFile } = require('child_process');
const db = require('../config/database');

const TIEMPO_MS = Number(process.env.MAQUINAS_TIMEOUT_MS || 12000);

// El CPU no se puede leer de una sola muestra: /proc/stat da contadores desde
// el arranque, así que hace falta comparar dos lecturas separadas en el tiempo.
// Se guarda la anterior de cada máquina; la primera consulta devuelve el CPU
// en null y a partir de la segunda ya es real.
const anterior = new Map();

const SONDA = [
  'echo "META $(hostname) $(awk \'{print int($1)}\' /proc/uptime)"',
  'awk \'/^cpu /{print "CPU", $2+$3+$4+$5+$6+$7+$8+$9, $5+$6, $9}\' /proc/stat',
  'grep -E "^(MemTotal|MemAvailable):" /proc/meminfo | awk \'{print "MEM", $1, $2}\'',
  'echo "CORES $(nproc)"',
  'awk \'{print "LOAD", $1, $2, $3}\' /proc/loadavg',
  'df -PB1 / | tail -1 | awk \'{print "DISK", $2, $3}\'',
].join('; ');

/** Ejecuta la sonda: en esta misma máquina si no hay host, o por SSH. */
function sondear(m) {
  return new Promise((resolve) => {
    const local = !m.host || m.host === 'localhost' || m.host === '127.0.0.1';
    const [cmd, args] = local
      ? ['sh', ['-c', SONDA]]
      : ['ssh', [
        '-o', 'BatchMode=yes',              // sin contraseñas: o hay llave o falla
        '-o', 'StrictHostKeyChecking=accept-new',
        '-o', `ConnectTimeout=${Math.round(TIEMPO_MS / 1000)}`,
        '-p', String(m.puerto || 22),
        `${m.usuario || 'root'}@${m.host}`,
        SONDA,
      ]];
    execFile(cmd, args, { timeout: TIEMPO_MS }, (err, salida) => {
      resolve(err ? null : String(salida));
    });
  });
}

/** Convierte la salida cruda de la sonda en cifras. */
function interpretar(texto, id) {
  const d = { mem: {}, };
  for (const linea of String(texto).split('\n')) {
    const p = linea.trim().split(/\s+/);
    if (p[0] === 'META') { d.hostname = p[1]; d.uptime_s = Number(p[2]) || null; }
    else if (p[0] === 'CPU') d.cpu = { total: +p[1], ocioso: +p[2], robado: +p[3] };
    else if (p[0] === 'MEM') d.mem[p[1].replace(':', '')] = Number(p[2]) * 1024;
    else if (p[0] === 'CORES') d.nucleos = Number(p[1]) || null;
    else if (p[0] === 'LOAD') d.carga = [+p[1], +p[2], +p[3]];
    else if (p[0] === 'DISK') d.disco = { total: +p[1], usado: +p[2] };
  }
  if (!d.cpu || !d.disco) return null;

  // CPU: diferencia contra la lectura anterior de ESTA máquina.
  let usado_pct = null, robado_pct = null;
  const prev = anterior.get(id);
  if (prev) {
    const dt = d.cpu.total - prev.total;
    if (dt > 0) {
      const dOcioso = d.cpu.ocioso - prev.ocioso;
      const dRobado = d.cpu.robado - prev.robado;
      // El robado es el turno que el hipervisor le da a otro inquilino: no es
      // trabajo nuestro y no se arregla optimizando, así que va aparte.
      usado_pct = Math.max(0, Math.round(((dt - dOcioso - dRobado) / dt) * 100));
      robado_pct = Math.max(0, Math.round((dRobado / dt) * 100));
    }
  }
  anterior.set(id, d.cpu);

  const memTotal = d.mem.MemTotal || 0;
  const memDisp = d.mem.MemAvailable || 0;
  const memUsado = Math.max(0, memTotal - memDisp);

  return {
    responde: true,
    hostname: d.hostname || null,
    uptime_s: d.uptime_s,
    cpu: { nucleos: d.nucleos, usado_pct, robado_pct, carga: d.carga || [] },
    // La caché cuenta como disponible, que es lo que es: el kernel la suelta
    // en cuanto alguien pide memoria.
    memoria: {
      total_bytes: memTotal,
      usado_bytes: memUsado,
      usado_pct: memTotal ? Math.round((memUsado / memTotal) * 100) : null,
    },
    disco: {
      total_bytes: d.disco.total,
      usado_bytes: d.disco.usado,
      libre_bytes: Math.max(0, d.disco.total - d.disco.usado),
      usado_pct: d.disco.total ? Math.round((d.disco.usado / d.disco.total) * 100) : null,
    },
  };
}

/** Todas las máquinas vigiladas, con su lectura. En paralelo y sin dejar caer
 *  la respuesta por una que no conteste: la que calla sale marcada y el resto
 *  se ve igual. */
async function listar() {
  const { rows } = await db.query('SELECT * FROM maquinas ORDER BY id');
  return Promise.all(rows.map(async (m) => {
    if (!m.activa) return { ...m, responde: false, pausada: true };
    const salida = await sondear(m);
    const salud = salida ? interpretar(salida, m.id) : null;
    return { ...m, ...(salud || { responde: false }) };
  }));
}

async function crear({ nombre, host, usuario, puerto, nota }) {
  const r = await db.query(
    `INSERT INTO maquinas (nombre, host, usuario, puerto, nota)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [String(nombre).trim(), String(host || '').trim() || null,
      String(usuario || 'root').trim(), Number(puerto) || 22, String(nota || '').trim() || null]
  );
  return r.rows[0];
}

async function actualizar(id, c) {
  const r = await db.query(
    `UPDATE maquinas SET
       nombre  = COALESCE($2, nombre),
       host    = COALESCE($3, host),
       usuario = COALESCE($4, usuario),
       puerto  = COALESCE($5, puerto),
       nota    = COALESCE($6, nota),
       activa  = COALESCE($7, activa)
     WHERE id = $1 RETURNING *`,
    [Number(id), c.nombre ?? null, c.host ?? null, c.usuario ?? null,
      c.puerto != null ? Number(c.puerto) : null, c.nota ?? null, c.activa ?? null]
  );
  return r.rows[0] || null;
}

async function borrar(id) {
  await db.query('DELETE FROM maquinas WHERE id = $1', [Number(id)]);
}

module.exports = { listar, crear, actualizar, borrar, sondear, interpretar };
