/**
 * video-agent — agente del nodo de VIDEO
 * ------------------------------------------------------------------
 * Corre EN el VPS de video y le cuenta al panel qué hay ahí: cuentas,
 * videos, espacio y consumo. El panel nunca entra por SSH ni toca discos
 * remotos: le pregunta a este agente por HTTP.
 *
 * FASE A: SOLO LECTURA. No crea, no borra, no modifica nada. Se puede
 * instalar con VDO Panel funcionando sin ningún riesgo.
 *
 * Autenticación: cabecera `Authorization: Bearer <AGENT_TOKEN>`.
 * Además conviene limitar el puerto por firewall a la IP del panel.
 * ------------------------------------------------------------------
 */
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const readline = require('readline');

const PORT = Number(process.env.PORT || 3000);
const TOKEN = process.env.AGENT_TOKEN || '';
const BASE = process.env.HOME_BASE || '/home';
const CONF_DIR = process.env.NGINX_CONF_DIR || '/etc/nginx/conf.d';
// Carpetas de /home que no son clientes (el propio panel, etc.)
const IGNORAR = (process.env.IGNORAR || 'vdopanel,ubuntu,lost+found').split(',').map((s) => s.trim());

const app = express();
app.use(express.json());

// ---- Autenticación ------------------------------------------------
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  if (!TOKEN) return res.status(500).json({ error: 'AGENT_TOKEN no configurado en el agente' });
  const h = req.headers.authorization || '';
  const enviado = h.startsWith('Bearer ') ? h.slice(7) : req.headers['x-api-key'];
  if (enviado !== TOKEN) return res.status(401).json({ error: 'Token inválido' });
  next();
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const existe = (p) => fs.promises.access(p).then(() => true).catch(() => false);

// ---- Utilidades ---------------------------------------------------

/** Tamaño total y archivos de una carpeta (recursivo, sin seguir enlaces). */
async function medirCarpeta(dir) {
  let bytes = 0;
  const archivos = [];
  async function recorrer(d) {
    let entradas;
    try { entradas = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entradas) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { await recorrer(p); continue; }
      if (!e.isFile()) continue;
      try {
        const st = await fsp.stat(p);
        bytes += st.size;
        archivos.push({ nombre: e.name, ruta: path.relative(dir, p), bytes: st.size, modificado: st.mtime });
      } catch (_) { /* archivo que desapareció mientras leíamos */ }
    }
  }
  await recorrer(dir);
  return { bytes, archivos };
}

/** Puertos del cliente, leídos de la configuración de nginx que ya existe. */
async function puertosDe(user) {
  const leer = async (archivo, regex) => {
    try {
      const txt = await fsp.readFile(path.join(CONF_DIR, archivo), 'utf8');
      const m = txt.match(regex);
      return m ? Number(m[1]) : null;
    } catch { return null; }
  };
  return {
    http: await leer(`${user}-http.http`, /listen\s+(\d+)\s*ssl/),
    rtmp: await leer(`${user}-rtmp.conf`, /listen\s+(\d+)\s*;/),
  };
}

/**
 * ¿Está transmitiendo ahora? Si hay un .m3u8 de HLS modificado hace menos
 * de un minuto, hay emisión: HLS reescribe la lista con cada fragmento.
 */
async function estaAlAire(dir) {
  const candidatos = ['live-streaming/hls', 'stream/hls', 'stream-hybrid/hls'];
  for (const sub of candidatos) {
    const d = path.join(dir, sub);
    let entradas;
    try { entradas = await fsp.readdir(d); } catch { continue; }
    for (const f of entradas.filter((x) => x.endsWith('.m3u8'))) {
      try {
        const st = await fsp.stat(path.join(d, f));
        if (Date.now() - st.mtimeMs < 60000) return { al_aire: true, fuente: sub.split('/')[0] };
      } catch (_) {}
    }
  }
  return { al_aire: false, fuente: null };
}

const MESES = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

/**
 * Bytes servidos por día, leyendo el access.log de nginx del cliente.
 * Formato combinado: ... [21/Jul/2026:10:00:00 -0500] "GET /x" 200 12345 ...
 * El 10º campo es el tamaño de la respuesta.
 */
async function consumoDeLog(archivo, dias = 30) {
  const porDia = {};
  if (!(await existe(archivo))) return porDia;

  const desde = new Date();
  desde.setDate(desde.getDate() - (dias - 1));
  desde.setHours(0, 0, 0, 0);

  const rl = readline.createInterface({ input: fs.createReadStream(archivo), crlfDelay: Infinity });
  for await (const linea of rl) {
    const f = linea.match(/\[(\d{2})\/(\w{3})\/(\d{4}):/);
    if (!f) continue;
    const mes = MESES[f[2]];
    if (mes === undefined) continue;
    const fecha = new Date(Number(f[3]), mes, Number(f[1]));
    if (fecha < desde) continue;

    // Los campos van entre comillas: "GET ... " 200 12345
    const m = linea.match(/"\s(\d{3})\s(\d+)/) || linea.match(/"\s+(\d{3})\s+(\d+)/);
    const bytes = m ? Number(m[2]) : 0;
    if (!bytes) continue;

    const clave = fecha.toISOString().slice(0, 10);
    porDia[clave] = (porDia[clave] || 0) + bytes;
  }
  return porDia;
}

/** Lista de cuentas detectadas en disco. */
async function cuentas() {
  let dirs;
  try { dirs = await fsp.readdir(BASE, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const d of dirs) {
    if (!d.isDirectory() || IGNORAR.includes(d.name)) continue;
    const dir = path.join(BASE, d.name);
    // Se considera cuenta de video si tiene carpeta de subidas
    if (!(await existe(path.join(dir, 'uploads')))) continue;
    out.push({ user: d.name, dir });
  }
  return out;
}

// ---- Rutas --------------------------------------------------------

app.get('/health', (req, res) => res.json({ agente: 'video', modo: 'solo-lectura', ok: true }));

/** GET /cuentas — qué clientes hay en este nodo, con su uso. */
app.get('/cuentas', wrap(async (req, res) => {
  const lista = await cuentas();
  const salida = [];
  for (const c of lista) {
    const [{ bytes, archivos }, puertos, aire] = await Promise.all([
      medirCarpeta(path.join(c.dir, 'uploads')),
      puertosDe(c.user),
      estaAlAire(c.dir),
    ]);
    salida.push({
      user: c.user,
      espacio_bytes: bytes,
      videos: archivos.filter((a) => /\.(mp4|mkv|mov|avi|webm|flv)$/i.test(a.nombre)).length,
      archivos: archivos.length,
      puertos,
      ...aire,
    });
  }
  res.json({ total: salida.length, cuentas: salida });
}));

/** GET /cuentas/:user — detalle con la lista de videos. */
app.get('/cuentas/:user', wrap(async (req, res) => {
  const lista = await cuentas();
  const c = lista.find((x) => x.user === req.params.user);
  if (!c) return res.status(404).json({ error: 'Cuenta no encontrada en este nodo' });

  const [{ bytes, archivos }, puertos, aire] = await Promise.all([
    medirCarpeta(path.join(c.dir, 'uploads')),
    puertosDe(c.user),
    estaAlAire(c.dir),
  ]);

  const videos = archivos
    .filter((a) => /\.(mp4|mkv|mov|avi|webm|flv)$/i.test(a.nombre))
    .sort((a, b) => new Date(b.modificado) - new Date(a.modificado));

  res.json({
    user: c.user, espacio_bytes: bytes, puertos, ...aire,
    videos: videos.map((v) => ({ nombre: v.nombre, ruta: v.ruta, bytes: v.bytes, modificado: v.modificado })),
  });
}));

/** GET /cuentas/:user/consumo?dias=30 — bytes servidos por día. */
app.get('/cuentas/:user/consumo', wrap(async (req, res) => {
  const lista = await cuentas();
  const c = lista.find((x) => x.user === req.params.user);
  if (!c) return res.status(404).json({ error: 'Cuenta no encontrada en este nodo' });

  const dias = Math.min(90, Math.max(1, Number(req.query.dias) || 30));
  const porDia = await consumoDeLog(path.join(c.dir, 'logs', 'access.log'), dias);
  const total = Object.values(porDia).reduce((a, b) => a + b, 0);
  res.json({
    user: c.user, dias, total_bytes: total,
    por_dia: Object.entries(porDia).sort().map(([fecha, bytes]) => ({ fecha, bytes })),
  });
}));

app.use((req, res) => res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` }));
app.use((err, req, res, next) => {
  console.error('[agente]', err.message);
  res.status(err.status || 500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`🎬 Agente de video (SOLO LECTURA) en el puerto ${PORT}`);
  console.log(`   Cuentas en: ${BASE}   ·   Config nginx: ${CONF_DIR}`);
  if (!TOKEN) console.warn('   ⚠️  Falta AGENT_TOKEN: el agente rechazará todas las peticiones');
});
