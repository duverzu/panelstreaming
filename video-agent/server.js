/**
 * video-agent — agente del nodo de VIDEO
 * ------------------------------------------------------------------
 * Corre EN el VPS de video y le cuenta al panel qué hay ahí: cuentas,
 * videos, espacio y consumo. El panel nunca entra por SSH ni toca discos
 * remotos: le pregunta a este agente por HTTP.
 *
 * Lectura (cuentas, videos, consumo) + autenticación del vivo. Todavía no
 * crea cuentas ni borra archivos: eso llega con la fase de escritura.
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
const claves = require('./claves');
const salud = require('./salud');
const bienvenida = require('./bienvenida');
const webtv = require('./webtv');
const restream = require('./restream');
const compat = require('./compat');
const compat247 = require('./compat247');
const { crearCuenta, eliminarConfig, renombrarCuenta } = require('./crear');
const listas = require('./listas');
const fsp2 = require('fs/promises');
const normalizar = require('./normalizar');
const subida = require('./subida');
const { exec } = require('child_process');

const PORT = Number(process.env.PORT || 3000);
// Por defecto solo escucha en el propio servidor: el panel llega por un
// túnel SSH, así el puerto no queda expuesto a internet y el token no
// viaja en claro. Poner 0.0.0.0 solo si se sabe lo que se hace.
const HOST = process.env.HOST || '127.0.0.1';
const TOKEN = process.env.AGENT_TOKEN || '';
const BASE = process.env.HOME_BASE || '/home';
const CONF_DIR = process.env.NGINX_CONF_DIR || '/etc/nginx/conf.d';
// Carpetas de /home que no son clientes (el propio panel, etc.)
const IGNORAR = (process.env.IGNORAR || 'vdopanel,ubuntu,lost+found').split(',').map((s) => s.trim());

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));   // nginx-rtmp envía formularios

// ---- Autenticación ------------------------------------------------
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  // nginx pregunta desde el propio servidor en cada conexión de vídeo:
  // no lleva token, se acepta solo si viene de localhost.
  // MediaMTX y el puente SRT preguntan igual, desde el mismo servidor. Solo
  // esos dos: gestionar QUIÉN tiene SRT (/srt/activos) sí exige token, o
  // cualquier proceso de la máquina podría dárselo a quien quisiera.
  if (req.path.startsWith('/rtmp/') || req.path === '/srt/auth' || req.path === '/srt/token'
      || req.path === '/compat/publicar' || req.path === '/compat/fin') {
    const ip = (req.ip || '').replace('::ffff:', '');
    if (ip === '127.0.0.1' || ip === '::1') return next();
    return res.status(403).end();
  }
  // La subida se autoriza por ticket firmado (el navegador no tiene el token)
  if (req.path === '/subir') return next();
  if (!TOKEN) return res.status(500).json({ error: 'AGENT_TOKEN no configurado en el agente' });
  const h = req.headers.authorization || '';
  const enviado = h.startsWith('Bearer ') ? h.slice(7) : req.headers['x-api-key'];
  if (enviado !== TOKEN) return res.status(401).json({ error: 'Token inválido' });
  next();
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const NGINX = process.env.NGINX_BIN || '/opt/nginx-panel/sbin/nginx';
/** Prueba y recarga nginx. Si la config es inválida, NO recarga (deja lo que había). */
function recargarNginx() {
  return new Promise((resolve) => {
    exec(`${NGINX} -t`, (err, _o, stderr) => {
      if (err) return resolve({ ok: false, error: stderr.trim() });
      exec(`${NGINX} -s reload`, (err2, _o2, stderr2) => {
        resolve(err2 ? { ok: false, error: stderr2.trim() } : { ok: true });
      });
    });
  });
}

const RTMP_LOCAL = Number(process.env.PUERTO_RTMP_BASE || 0); // se lee de la config de cada cuenta
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

/**
 * Puertos del cliente. Los busca en NUESTRA config y en la de VDO Panel,
 * porque durante la migración conviven ambas y después queda solo la nuestra.
 */
async function puertosDe(user) {
  const CUENTAS_DIR = process.env.NGINX_CUENTAS_DIR || '/opt/nginx-panel/conf/cuentas';
  const buscar = async (candidatos, regex) => {
    for (const ruta of candidatos) {
      try {
        const m = (await fsp.readFile(ruta, 'utf8')).match(regex);
        if (m) return Number(m[1]);
      } catch { /* no existe, siguiente */ }
    }
    return null;
  };
  return {
    http: await buscar([path.join(CUENTAS_DIR, `${user}.http`), path.join(CONF_DIR, `${user}-http.http`)], /listen\s+(\d+)\s*ssl/),
    rtmp: await buscar([path.join(CUENTAS_DIR, `${user}.rtmp`), path.join(CONF_DIR, `${user}-rtmp.conf`)], /listen\s+(\d+)\s*;/),
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

app.get('/health', (req, res) => res.json({ agente: 'video', ok: true }));

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


// ==================================================================
//  VIVO — nginx pregunta aquí antes de dejar transmitir
// ==================================================================

// Reanudaciones del 24/7 pendientes, por cuenta. Se cancelan si el vivo
// reconecta antes del plazo (evita que el 24/7 reviva en medio del directo).
const reanudar24_7 = new Map();

/**
 * POST /rtmp/publicar — lo llama nginx (on_publish) cuando alguien conecta
 * su encoder. El cliente publica en la aplicación `<user>live` usando SU
 * CLAVE como nombre de stream.
 *
 * Responde 2xx para permitir y cualquier otra cosa para rechazar.
 *
 * El renombrado del stream a `play` NO se hace aquí: se probó devolver 302
 * con Location y nginx-rtmp siguió nombrando el HLS con la clave del
 * cliente. Se resuelve en la configuración, reenviando el vivo con el
 * nombre fijo `play` a otra aplicación (ver plantilla cuenta.rtmp).
 */
app.post('/rtmp/publicar', wrap(async (req, res) => {
  const app_ = String(req.body?.app || '');
  const clave = String(req.body?.name || '');
  const user = app_.replace(/live$/, '');

  if (!user || !app_.endsWith('live')) {
    console.error('[rtmp] aplicación desconocida:', app_);
    return res.status(400).end();
  }

  if (!(await claves.valida(user, clave))) {
    console.error(`[rtmp] ${user}: clave incorrecta o vivo desactivado (desde ${req.body?.addr})`);
    return res.status(403).end();
  }

  console.log(`[rtmp] ${user}: al aire desde ${req.body?.addr}`);

  // El vivo TOMA el canal: apagamos la emisión 24/7 para que su ffmpeg deje de
  // empujar a <user>hybrid/play. Si no, el vivo y el 24/7 pelean por el mismo
  // stream ('Already publishing' en nginx-rtmp) y la transmisión se corta.
  // Al terminar el vivo (/rtmp/fin) se reenciende el 24/7.
  try {
    // Cancelar una reanudación pendiente: el vivo sigue en el aire, así que el
    // 24/7 NO debe revivir (esto pasaba al reconectar el encoder).
    const pend = reanudar24_7.get(user);
    if (pend) { clearTimeout(pend); reanudar24_7.delete(user); }

    if (webtv.estado(user).emitiendo) {
      webtv.detener(user);
      console.log(`[rtmp] ${user}: 24/7 en pausa mientras dura el vivo`);
    }
  } catch (e) { console.error('[rtmp] pausar 24/7:', e.message); }

  res.status(200).end();
}));

/** POST /rtmp/fin — nginx avisa que la transmisión terminó (on_publish_done). */
app.post('/rtmp/fin', wrap(async (req, res) => {
  const user = String(req.body?.app || '').replace(/live$/, '');
  res.status(200).end();          // no hacemos esperar a nginx
  if (!user) return;
  console.log(`[rtmp] ${user}: terminó la transmisión en vivo`);

  // Vuelve la emisión 24/7, pero con espera: si el encoder reconecta enseguida
  // (corte breve), el /rtmp/publicar cancela este temporizador y el 24/7 NO
  // revive en medio del vivo. Guardamos el timer por cuenta para poder cancelarlo.
  const anterior = reanudar24_7.get(user);
  if (anterior) clearTimeout(anterior);
  reanudar24_7.set(user, setTimeout(async () => {
    reanudar24_7.delete(user);
    try {
      if (webtv.estado(user).emitiendo) return;      // ya volvió por otra vía
      const lista = await cuentas();
      const c = lista.find((x) => x.user === user);
      const puertos = await puertosDe(user);
      if (c && puertos.rtmp) {
        await webtv.iniciar(user, { dirCuenta: c.dir, puertoRtmp: Number(puertos.rtmp) });
        console.log(`[rtmp] ${user}: 24/7 reanudado`);
      }
    } catch (e) { console.error('[rtmp] reanudar 24/7:', e.message); }
  }, 6000));
}));


// ==================================================================
//  COMPAT asilivehd — app `live` unificada (migración transparente)
//  nginx (app live, puerto 1935) pregunta aquí antes de dejar publicar.
//  El nombre del stream es el usuario y el token va como ?token=.
//  Se valida contra compat-tokens.json (los tokens EXACTOS del viejo).
// ==================================================================
// Reanudaciones del 24/7 pendientes (se cancelan si el vivo reconecta).
const reanudarCompat = new Map();
async function compatTieneVideos(user) {
  try { return (await fsp.readdir(path.join(BASE, user, 'uploads'))).some((f) => /\.(mp4|mkv|mov|webm|flv)$/i.test(f)); }
  catch { return false; }
}

app.post('/compat/publicar', (req, res) => {
  const name = String(req.body?.name || '');
  const token = String(req.body?.token || '');
  if (!compat.valida(name, token)) {
    console.error(`[compat] rechazado "${name}" (token inválido) desde ${req.body?.addr}`);
    return res.status(403).end();
  }
  // El vivo TOMA el canal: cancela una reanudación pendiente y pausa el 24/7
  // (si tiene), para que no peleen por asilivehls/<user>.
  const pend = reanudarCompat.get(name);
  if (pend) { clearTimeout(pend); reanudarCompat.delete(name); }
  if (compat247.emitiendo(name)) { compat247.detener(name); console.log(`[compat] ${name}: 24/7 en pausa mientras dura el vivo`); }
  console.log(`[compat] ${name}: al aire desde ${req.body?.addr}`);
  res.status(200).end();
});

app.post('/compat/fin', (req, res) => {
  const name = String(req.body?.name || '');
  res.status(200).end();
  if (!name) return;
  console.log(`[compat] ${name}: terminó el vivo`);
  // Reanuda el 24/7 tras una espera (si el encoder reconecta enseguida, el
  // /compat/publicar cancela este timer y el 24/7 no revive en medio del vivo).
  const anterior = reanudarCompat.get(name);
  if (anterior) clearTimeout(anterior);
  reanudarCompat.set(name, setTimeout(async () => {
    reanudarCompat.delete(name);
    if (compat247.emitiendo(name)) return;
    if (await compatTieneVideos(name)) {
      compat247.iniciar(name).then((r) => r.ok && console.log(`[compat] ${name}: 24/7 reanudado`)).catch((e) => console.error('[compat] reanudar 24/7:', e.message));
    }
  }, 6000));
});

// GET /compat/clientes — estado de los canales asilivehd (en vivo + viewers).
// Lo consume el panel (con token) para mostrarlos junto al nodo.
const ASILIVE_HLS = process.env.ASILIVE_HLS || '/var/asilive/hls';
const ASILIVE_LOG = process.env.ASILIVE_LOG || '/var/asilive/asilive-access.log';
const COMPAT_DOMINIO = process.env.COMPAT_DOMINIO || 'server.asilivehd.com';

async function compatAlAire(user) {
  try {
    const st = await fsp.stat(path.join(ASILIVE_HLS, `${user}.m3u8`));
    return Date.now() - st.mtimeMs < 30000;   // el HLS se reescribe cada ~3s
  } catch { return false; }
}

/** Viewers por usuario, leyendo el access.log compartido de la capa. */
async function compatViewers(users, ventanaSeg = 60) {
  const sets = {}; users.forEach((u) => (sets[u] = new Set()));
  try {
    const st = await fsp.stat(ASILIVE_LOG);
    const inicio = Math.max(0, st.size - 1024 * 1024);
    const buf = Buffer.alloc(st.size - inicio);
    const fd = await fsp.open(ASILIVE_LOG, 'r');
    await fd.read(buf, 0, buf.length, inicio);
    await fd.close();
    const corte = Date.now() - ventanaSeg * 1000;
    for (const linea of buf.toString('utf8').split('\n')) {
      const m = linea.match(/\/live\/([a-zA-Z0-9_.-]+?)(?:-\d+\.ts|\.m3u8)/);
      if (!m || !sets[m[1]]) continue;
      const t = tiempoDeLinea(linea);
      if (t === null || t < corte) continue;
      const ip = linea.split(' ')[0];
      if (ip && ip !== '127.0.0.1') sets[m[1]].add(ip);
    }
  } catch { /* aún sin log */ }
  const out = {}; users.forEach((u) => (out[u] = sets[u].size)); return out;
}

// ==================================================================
//  ENTRADA SRT (MediaMTX)
// ------------------------------------------------------------------
//  SRT sirve para publicar desde conexiones malas: retransmite lo que se
//  pierde dentro de una ventana de tiempo, en vez de atascarse como hace RTMP
//  sobre TCP. Se usa SOLO para la subida; el publico sigue viendo el HLS.
//
//  MediaMTX recibe el SRT y pregunta AQUI si lo acepta. Que la decision viva
//  en el agente y no en su archivo de configuracion es lo que permite activar
//  o quitar SRT a un cliente al vuelo, sin editar nada ni reiniciar servicios.
// ==================================================================

const SRT_ACTIVOS = process.env.SRT_ACTIVOS || path.join(__dirname, 'srt-activos.json');

/** Canales con SRT habilitado. Se relee en cada consulta: así el panel puede
 *  activarlo o quitarlo y surte efecto en la siguiente conexión. */
function srtHabilitados() {
  try {
    const v = JSON.parse(fs.readFileSync(SRT_ACTIVOS, 'utf8'));
    return Array.isArray(v) ? v : [];
  } catch (_) {
    return [];   // sin archivo todavía: nadie tiene SRT
  }
}

const SRT_SALIDA = process.env.SRT_SALIDA || path.join(__dirname, 'srt-salida.json');

/** Canales que se pueden SACAR por SRT (lo que enganchan los cable
 *  operadores). Va en lista aparte de la entrada a propósito: son permisos
 *  distintos — uno deja subir, el otro deja llevarse la señal. */
function srtSalidaHabilitados() {
  try {
    const v = JSON.parse(fs.readFileSync(SRT_SALIDA, 'utf8'));
    return Array.isArray(v) ? v : [];
  } catch (_) {
    return [];
  }
}

/**
 * POST /srt/auth — lo llama MediaMTX en cada conexión.
 * Responder 20x la acepta; cualquier otra cosa la rechaza.
 * body: { user, password, path, action, protocol, ip, query }
 */
app.post('/srt/auth', (req, res) => {
  const { path: canal, password, action, protocol } = req.body || {};
  // La IP de quien se conecta viene en el CUERPO. `req.ip` es siempre
  // 127.0.0.1 porque quien llama aquí es MediaMTX, desde este mismo servidor:
  // tomarla de ahí daba por local a cualquiera que llegara de internet.
  const ip = String(req.body?.ip || '').replace('::ffff:', '');
  const esLocal = ip === '127.0.0.1' || ip === '::1';

  if (action === 'read') {
    // El puente de entrada lee desde el propio servidor para reenviar a nginx.
    if (esLocal) return res.status(200).end();
    // De fuera solo se llevan la señal los canales con la salida activada.
    // Sin credencial, igual que en el servidor viejo: el operador ya tiene la
    // URL puesta en su cabecera y cambiarla es una visita técnica.
    if (canal && srtSalidaHabilitados().includes(canal)) {
      console.log(`[srt-salida] ${canal}: entregando a ${ip}`);
      return res.status(200).end();
    }
    console.error(`[srt-salida] ${canal}: rechazado desde ${ip}, no tiene salida activada`);
    return res.status(401).end();
  }

  if (action !== 'publish') return res.status(401).end();

  // Nuestro propio extractor de salida, que mete en MediaMTX por RTSP lo que
  // saca de nginx. Solo desde este servidor y solo por RTSP: de fuera el 8554
  // ni siquiera escucha.
  if (esLocal && protocol === 'rtsp') return res.status(200).end();
  if (!canal) return res.status(401).end();

  if (!srtHabilitados().includes(canal)) {
    console.error(`[srt] ${canal}: rechazado, no tiene SRT habilitado`);
    return res.status(401).end();
  }
  // La contraseña del streamid es el MISMO token que ya usa por RTMP: el
  // cliente no tiene que aprenderse una credencial nueva.
  if (!compat.valida(canal, password)) {
    console.error(`[srt] ${canal}: rechazado, token inválido`);
    return res.status(401).end();
  }
  console.log(`[srt] ${canal}: autorizado desde ${ip}`);
  res.status(200).end();
});

/** GET /srt/token?user=X — el puente pide el token para publicar en nginx.
 *  Solo localhost (lo garantiza el middleware de arriba). */
app.get('/srt/token', (req, res) => {
  const user = String(req.query.user || '');
  const t = compat.tokenDe(user);
  if (t === undefined || !srtHabilitados().includes(user)) return res.status(404).end();
  res.type('text/plain').send(String(t));
});

/** GET /srt/activos — qué canales tienen SRT (lo consulta el panel). */
app.get('/srt/activos', (req, res) => res.json({ canales: srtHabilitados() }));

/** GET /srt/salida — qué canales se pueden sacar por SRT. */
app.get('/srt/salida', (req, res) => res.json({ canales: srtSalidaHabilitados() }));

/** PUT /srt/salida/:user — activa o quita la salida SRT. body: { activo } */
app.put('/srt/salida/:user', (req, res) => {
  const user = String(req.params.user || '');
  if (!user) return res.status(400).json({ error: 'Falta el canal' });
  const lista = new Set(srtSalidaHabilitados());
  if (req.body?.activo) lista.add(user); else lista.delete(user);
  fs.writeFileSync(SRT_SALIDA, JSON.stringify([...lista], null, 2), { mode: 0o600 });
  res.json({ ok: true, canales: [...lista] });
});

/** PUT /srt/activos/:user — activa o quita SRT a un canal. body: { activo } */
app.put('/srt/activos/:user', (req, res) => {
  const user = String(req.params.user);
  const activo = req.body?.activo !== false;
  const lista = new Set(srtHabilitados());
  activo ? lista.add(user) : lista.delete(user);
  fs.writeFileSync(SRT_ACTIVOS, JSON.stringify([...lista], null, 2), { mode: 0o600 });
  console.log(`[srt] ${user}: ${activo ? 'activado' : 'desactivado'}`);
  res.json({ ok: true, canales: [...lista] });
});

app.get('/compat/clientes', wrap(async (req, res) => {
  const users = compat.lista();
  const viewers = await compatViewers(users);
  const clientes = [];
  for (const u of users) {
    // Espacio ocupado. Hoy da 0 en todos: estos canales son de PASO (vivo puro)
    // y no guardan nada. Se mide igual porque en cuanto uno active el 24/7 sus
    // videos caen en /home/<user>/uploads, y así el panel lo ve solo, sin tener
    // que volver a tocar el agente. El detalle (/compat/clientes/:user) ya lo
    // medía; faltaba en el listado, y por eso el panel no tenía el dato.
    let espacio_bytes = 0;
    try { espacio_bytes = (await medirCarpeta(path.join(BASE, u, 'uploads'))).bytes; } catch (_) {}
    clientes.push({ user: u, al_aire: await compatAlAire(u), viewers: viewers[u] || 0, espacio_bytes });
  }
  res.json({ total: users.length, clientes });
}));

// GET /compat/clientes/:user — conexión completa de un canal asilivehd
// (para su panel de cliente: RTMP, clave, m3u8, player, estado).
app.get('/compat/clientes/:user', wrap(async (req, res) => {
  const user = String(req.params.user);
  const token = compat.tokenDe(user);
  if (token === undefined) return res.status(404).json({ error: 'No es un canal de la capa asilivehd' });
  const viewers = (await compatViewers([user]))[user] || 0;
  // Videos subidos (para el AutoDJ): se guardan en /home/<user>/uploads
  let espacio_bytes = 0, videos = [];
  try {
    const m = await medirCarpeta(path.join(BASE, user, 'uploads'));
    espacio_bytes = m.bytes;
    videos = m.archivos
      .filter((a) => /\.(mp4|mkv|mov|avi|webm|flv)$/i.test(a.nombre))
      .sort((a, b) => new Date(b.modificado) - new Date(a.modificado))
      .map((v) => ({ nombre: v.nombre, bytes: v.bytes, modificado: v.modificado }));
  } catch (_) {}
  res.json({
    user,
    al_aire: await compatAlAire(user),
    viewers,
    emitiendo_247: compat247.emitiendo(user),
    tiene_videos: videos.length > 0,
    espacio_bytes,
    videos,
    servidor_rtmp: `rtmp://${COMPAT_DOMINIO}/live`,
    clave: `${user}?token=${token}`,
    m3u8: `https://${COMPAT_DOMINIO}/live/${user}.m3u8`,
    player: `https://${COMPAT_DOMINIO}/video/user/?user=${user}`,
  });
}));

/** POST /compat/clientes/:user/24-7 — enciende/apaga el AutoDJ de un canal asilivehd. */
app.post('/compat/clientes/:user/24-7', wrap(async (req, res) => {
  const user = String(req.params.user);
  if (compat.tokenDe(user) === undefined) return res.status(404).json({ error: 'No es un canal asilivehd' });
  if (req.body?.encender === false) return res.json({ ok: true, ...compat247.detener(user) });
  res.json(await compat247.recargar(user));
}));


// ==================================================================
//  ESCRITURA — crear y gestionar cuentas (fase de provisioning)
// ==================================================================

/**
 * POST /cuentas — crea la cuenta en el motor propio.
 * body: { user, http?, rtmp?, iniciar_24_7? }
 *   http/rtmp → puertos exactos (para MIGRAR con los de VDO Panel).
 *               Si se omiten, se asignan del rango de cuentas nuevas.
 */
app.post('/cuentas', wrap(async (req, res) => {
  const { user, http, rtmp, iniciar_24_7, reload = true } = req.body || {};
  if (!user) return res.status(400).json({ error: 'Falta el usuario' });

  const puertos = (http && rtmp) ? { http: Number(http), rtmp: Number(rtmp) } : undefined;
  const info = await crearCuenta(user, { puertos });

  // En la PREPARACIÓN de una migración se pasa reload:false: la config queda
  // escrita pero no se activa (los puertos aún los tiene VDO Panel).
  if (reload) {
    const r = await recargarNginx();
    if (!r.ok) return res.status(500).json({ error: 'nginx rechazó la configuración', detalle: r.error, ...info });
  }

  let webtvEstado = null;
  if (iniciar_24_7) {
    webtvEstado = await webtv.iniciar(info.user, { dirCuenta: info.dir, puertoRtmp: info.puertos.rtmp });
  }

  res.status(201).json({ ok: true, ...info, webtv: webtvEstado });
}));

/**
 * POST /cuentas/:user/renombrar — le cambia el nombre a una cuenta.
 * body: { nuevo }
 *
 * Si estaba al aire, vuelve al aire con el nombre nuevo: el cliente no debería
 * quedarse fuera de antena por corregirle una letra.
 */
app.post('/cuentas/:user/renombrar', wrap(async (req, res) => {
  const actual = String(req.params.user);
  const nuevo = String(req.body?.nuevo || '');
  if (!nuevo) return res.status(400).json({ error: 'Falta el nombre nuevo' });

  const emitia = Boolean(webtv.estado(actual)?.emitiendo);
  if (emitia) webtv.detener(actual);

  let info;
  try { info = await renombrarCuenta(actual, nuevo); }
  catch (e) { return res.status(400).json({ error: e.message }); }

  // La clave de transmisión viaja con la cuenta: el cliente no tiene por qué
  // cambiarla en su OBS por un cambio de nombre nuestro.
  const clave = await claves.obtener(actual);
  if (clave) { await claves.definir(info.user, clave); await claves.quitar(actual); }

  const r = await recargarNginx();
  if (!r.ok) return res.status(500).json({ error: 'nginx rechazó la configuración', detalle: r.error, ...info });

  if (emitia) {
    await webtv.iniciar(info.user, { dirCuenta: path.join(BASE, info.user), puertoRtmp: info.puertos.rtmp })
      .catch((e) => console.error('[renombrar] no volvió al aire:', e.message));
  }
  res.json({ ok: true, ...info, volvio_al_aire: emitia });
}));

/** DELETE /cuentas/:user — quita la config y apaga el canal (NO borra videos). */
app.delete('/cuentas/:user', wrap(async (req, res) => {
  const user = String(req.params.user);
  webtv.detener(user);
  await claves.quitar(user);
  await eliminarConfig(user);
  await recargarNginx();
  res.json({ ok: true, message: 'Cuenta desmontada (sus videos siguen en disco)' });
}));

/** POST /cuentas/:user/24-7 — enciende o apaga la emisión continua. */
app.post('/cuentas/:user/24-7', wrap(async (req, res) => {
  const user = String(req.params.user);
  const encender = req.body?.encender !== false;
  const lista = await cuentas();
  const c = lista.find((x) => x.user === user);
  if (!c) return res.status(404).json({ error: 'Cuenta no encontrada' });

  if (!encender) return res.json({ ok: true, ...webtv.detener(user) });

  // El puerto RTMP se puede pasar explícito (migración) o leer de la config.
  const rtmp = req.body?.rtmp || (await puertosDe(user)).rtmp;
  if (!rtmp) return res.status(400).json({ error: 'No se pudo determinar el puerto RTMP de la cuenta' });
  const r = await webtv.iniciar(user, { dirCuenta: c.dir, puertoRtmp: Number(rtmp) });
  res.json({ ok: true, ...r });
}));

/** POST /cuentas/:user/clave — define/regenera la clave de transmisión en vivo. */
app.post('/cuentas/:user/clave', wrap(async (req, res) => {
  const clave = await claves.definir(String(req.params.user), req.body?.clave);
  res.json({ ok: true, clave });
}));

/** POST /cuentas/:user/clave/activar — suspende o reactiva el vivo sin perder la clave. */
app.post('/cuentas/:user/clave/activar', wrap(async (req, res) => {
  const ok = await claves.activar(String(req.params.user), req.body?.activo !== false);
  res.json({ ok });
}));


// ==================================================================
//  NORMALIZAR — pasar una cuenta de transcode a copy (libera CPU)
// ==================================================================

/**
 * POST /cuentas/:user/normalizar — recodifica los videos a formato uniforme
 * en segundo plano. Al terminar, reinicia el canal en modo copy si estaba
 * al aire. La emisión NO se corta durante el proceso.
 */
// ==================================================================
//  LISTAS y PROGRAMACIÓN por horario
// ==================================================================

async function dirDe(user) {
  const c = (await cuentas()).find((x) => x.user === user);
  return c?.dir || null;
}
/** Aplica el cambio de lista en vivo si el canal está al aire. */
async function refrescarCanal(user) {
  const c = (await cuentas()).find((x) => x.user === user);
  if (c && webtv.estado(user).emitiendo) {
    const p = await puertosDe(user);
    if (p.rtmp) await webtv.recargar(user, { dirCuenta: c.dir, puertoRtmp: p.rtmp });
  }
}

app.get('/cuentas/:user/listas', wrap(async (req, res) => {
  const dir = await dirDe(req.params.user);
  if (!dir) return res.status(404).json({ error: 'Cuenta no encontrada' });
  const datos = await listas.leer(dir);
  let disp = [];
  try { disp = (await fsp2.readdir(path.join(dir, 'uploads'))).filter((f) => /\.(mp4|mkv|mov|webm|flv)$/i.test(f)); } catch (_) {}
  res.json({ ...datos, emitiendo_ahora: listas.listaActual(datos, disp, new Date()).id });
}));
app.post('/cuentas/:user/listas', wrap(async (req, res) => {
  const dir = await dirDe(req.params.user);
  if (!dir) return res.status(404).json({ error: 'Cuenta no encontrada' });
  res.status(201).json(await listas.crear(dir, req.body?.nombre));
}));
app.put('/cuentas/:user/listas/:id', wrap(async (req, res) => {
  const dir = await dirDe(req.params.user);
  if (!dir) return res.status(404).json({ error: 'Cuenta no encontrada' });
  let r = true;
  if (req.body?.nombre !== undefined) r = await listas.renombrar(dir, req.params.id, req.body.nombre);
  if (Array.isArray(req.body?.videos)) r = await listas.fijarVideos(dir, req.params.id, req.body.videos);
  if (!r) return res.status(404).json({ error: 'Lista no encontrada' });
  await refrescarCanal(req.params.user);
  res.json(r);
}));
app.delete('/cuentas/:user/listas/:id', wrap(async (req, res) => {
  const dir = await dirDe(req.params.user);
  if (!dir) return res.status(404).json({ error: 'Cuenta no encontrada' });
  const ok = await listas.borrar(dir, req.params.id);
  await refrescarCanal(req.params.user);
  res.json({ ok });
}));
app.post('/cuentas/:user/activa', wrap(async (req, res) => {
  const dir = await dirDe(req.params.user);
  if (!dir) return res.status(404).json({ error: 'Cuenta no encontrada' });
  const ok = await listas.marcarActiva(dir, req.body?.id || null);
  await refrescarCanal(req.params.user);
  res.json({ ok });
}));
app.put('/cuentas/:user/programacion', wrap(async (req, res) => {
  const dir = await dirDe(req.params.user);
  if (!dir) return res.status(404).json({ error: 'Cuenta no encontrada' });
  const guardadas = await listas.fijarProgramacion(dir, req.body?.programacion || []);
  await refrescarCanal(req.params.user);
  res.json({ ok: true, programacion: guardadas });
}));

/**
 * PUT /cuentas/:user/orden — guarda el orden de emisión (playlist) del cliente.
 * body: { orden: ["02-intro.mp4", "01-nota.mp4", ...] }
 */
app.put('/cuentas/:user/orden', wrap(async (req, res) => {
  const user = String(req.params.user);
  const lista = await cuentas();
  const c = lista.find((x) => x.user === user);
  if (!c) return res.status(404).json({ error: 'Cuenta no encontrada' });

  const orden = Array.isArray(req.body?.orden) ? req.body.orden.map(String) : null;
  if (!orden) return res.status(400).json({ error: 'Falta el orden (lista de nombres)' });

  const limpio = orden.map((f) => path.basename(f));   // a prueba de traversal
  await fsp2.writeFile(path.join(c.dir, 'orden.json'), JSON.stringify(limpio, null, 2));

  if (webtv.estado(user).emitiendo) {
    const puertos = await puertosDe(user);
    if (puertos.rtmp) await webtv.recargar(user, { dirCuenta: c.dir, puertoRtmp: puertos.rtmp });
  }
  res.json({ ok: true, videos: limpio.length });
}));

/** GET /cuentas/:user/orden — el orden guardado (o null). */
app.get('/cuentas/:user/orden', wrap(async (req, res) => {
  const lista = await cuentas();
  const c = lista.find((x) => x.user === String(req.params.user));
  if (!c) return res.status(404).json({ error: 'Cuenta no encontrada' });
  let orden = null;
  try { orden = JSON.parse(await fsp2.readFile(path.join(c.dir, 'orden.json'), 'utf8')); } catch (_) {}
  res.json({ orden });
}));

app.post('/cuentas/:user/normalizar', wrap(async (req, res) => {
  const user = String(req.params.user);
  const lista = await cuentas();
  const c = lista.find((x) => x.user === user);
  if (!c) return res.status(404).json({ error: 'Cuenta no encontrada' });

  const puertos = await puertosDe(user);
  const r = await normalizar.cuenta(user, c.dir, (resultado) => {
    // Al terminar: si el canal estaba emitiendo, reiniciarlo (ya en modo copy)
    if (resultado.ok && webtv.estado(user).emitiendo && puertos.rtmp) {
      webtv.recargar(user, { dirCuenta: c.dir, puertoRtmp: puertos.rtmp })
        .then((x) => console.log(`[normalizar] ${user} reiniciado en modo ${x.modo}`))
        .catch((e) => console.error('[normalizar] reinicio:', e.message));
    }
  });
  res.json(r);
}));

/** GET /cuentas/:user/normalizar — progreso del trabajo. */
app.get('/cuentas/:user/normalizar', wrap(async (req, res) => {
  res.json(normalizar.estado(String(req.params.user)));
}));

/** DELETE /cuentas/:user/normalizar — cancela el trabajo en curso. */
app.delete('/cuentas/:user/normalizar', wrap(async (req, res) => {
  res.json(normalizar.cancelar(String(req.params.user)));
}));


// ==================================================================
//  VIDEOS — subir (directo del navegador) y borrar
// ==================================================================


/** GET /cuentas/:user/conexion — datos para transmitir en vivo (OBS, vMix…). */
app.get('/cuentas/:user/conexion', wrap(async (req, res) => {
  const user = String(req.params.user);
  const puertos = await puertosDe(user);
  if (!puertos.rtmp) return res.status(404).json({ error: 'Cuenta sin configuración de video' });
  const clave = await claves.obtener(user);
  res.json({
    servidor_rtmp: `rtmp://${process.env.DOMINIO || 'video.streaminghd.co'}:${puertos.rtmp}/${user}live`,
    clave,               // el "stream key" que va en OBS
    puerto: puertos.rtmp,
    aplicacion: `${user}live`,
  });
}));

/** POST /cuentas/:user/ticket — el panel pide un ticket de subida para el cliente. */
app.post('/cuentas/:user/ticket', wrap(async (req, res) => {
  res.json(subida.emitirTicket(String(req.params.user)));
}));

/**
 * POST /subir?ticket=... — el NAVEGADOR sube aquí (vía nginx /_subir).
 * No lleva token de agente: se autoriza con el ticket firmado.
 */
app.post('/subir', (req, res) => {
  const user = subida.validarTicket(req.query.ticket);
  if (!user) return res.status(403).json({ error: 'Ticket inválido o vencido. Vuelve a la página de subir.' });
  req.videoUser = user;

  subida.subir(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún video (formatos: mp4, mkv, mov, webm, flv)' });

    // Ya tiene contenido propio: el clip de bienvenida se retira. Era el
    // arranque para que su canal pudiera emitir desde el primer minuto.
    await bienvenida.retirarDe(path.join(BASE, user)).catch(() => {});

    // Cuenta de la capa asilivehd (compat): su AutoDJ es compat247, no el motor
    // por-puerto. Actualiza su 24/7 con el nuevo video, SIN pisar un directo:
    //  - 24/7 ya emitiendo → recargar (refresca la lista)
    //  - nadie al aire     → iniciar (muestra sus videos)
    //  - al aire pero no es el 24/7 → el cliente está EN VIVO: no tocar; el 24/7
    //    entra solo cuando termine el directo (/compat/fin).
    if (compat.tokenDe(user) !== undefined) {
      (async () => {
        try {
          if (compat247.emitiendo(user)) await compat247.recargar(user);
          else if (!(await compatAlAire(user))) await compat247.iniciar(user);
        } catch (e) { console.error('[subir compat]', e.message); }
      })();
      return res.status(201).json({ ok: true, archivo: req.file.filename, bytes: req.file.size });
    }

    // Si el canal está al aire, reiniciarlo para que incluya el nuevo video
    const recargarCanal = async () => {
      try {
        const lista = await cuentas();
        const c = lista.find((x) => x.user === user);
        if (c && webtv.estado(user).emitiendo) {
          const puertos = await puertosDe(user);
          if (puertos.rtmp) await webtv.recargar(user, { dirCuenta: c.dir, puertoRtmp: puertos.rtmp });
        }
      } catch (e) { console.error('[subir] reinicio canal:', e.message); }
    };

    // Se normaliza ANTES de meterlo a la emisión: así la cuenta queda uniforme
    // y el canal sigue en modo 'copy' (CPU casi cero, calidad original) en vez
    // de caer a conversión permanente por un video con otro formato.
    // Si ya viene en el formato estándar, no gasta CPU y recarga enseguida.
    try {
      const lista = await cuentas();
      const c = lista.find((x) => x.user === user);
      if (c && process.env.NORMALIZAR_AL_SUBIR !== '0') {
        normalizar.alSubir(user, c.dir, req.file.filename, recargarCanal);
      } else {
        await recargarCanal();
      }
    } catch (e) {
      console.error('[subir] normalizar:', e.message);
      await recargarCanal();
    }

    res.status(201).json({ ok: true, archivo: req.file.filename, bytes: req.file.size });
  });
});

/** DELETE /cuentas/:user/videos/:nombre — borra un video y reinicia el canal. */
app.delete('/cuentas/:user/videos/:nombre', wrap(async (req, res) => {
  const user = String(req.params.user);
  const r = await subida.borrar(user, req.params.nombre);
  if (!r.ok) return res.status(404).json(r);

  // Canal asilivehd (compat): refresca su 24/7 (compat247), no el motor por-puerto.
  if (compat.tokenDe(user) !== undefined) {
    if (compat247.emitiendo(user)) {
      if (await compatTieneVideos(user)) compat247.recargar(user).catch((e) => console.error('[borrar compat]', e.message));
      else compat247.detener(user);   // se quedó sin videos: apaga el 24/7
    }
    return res.json(r);
  }

  try {
    const lista = await cuentas();
    const c = lista.find((x) => x.user === user);
    if (c && webtv.estado(user).emitiendo) {
      const puertos = await puertosDe(user);
      if (puertos.rtmp) await webtv.recargar(user, { dirCuenta: c.dir, puertoRtmp: puertos.rtmp });
    }
  } catch (e) { console.error('[borrar] reinicio canal:', e.message); }

  res.json(r);
}));

/**
 * GET /nodo/red — contador de tráfico de la(s) interfaz(es) de red del nodo,
 * en bytes acumulados desde el arranque (como el "Ancho de banda" de Hostinger).
 * El Guardián de banda del panel lo muestrea cada pocos minutos y registra el
 * delta, así el VPS de video aparece en el medidor igual que los de audio.
 */
// ── Espectadores en vivo (HLS) ─────────────────────────────────────
// Un espectador pide el .m3u8 y sus segmentos .ts cada pocos segundos.
// Contamos IPs únicas que pidieron HLS en los últimos `ventana` segundos.
function tiempoDeLinea(linea) {
  const m = linea.match(/\[(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{2})(\d{2})\]/);
  if (!m) return null;
  const mes = MESES[m[2]];
  if (mes === undefined) return null;
  const iso = `${m[3]}-${String(mes + 1).padStart(2, '0')}-${m[1]}T${m[4]}:${m[5]}:${m[6]}${m[7]}:${m[8]}`;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

async function viewersDeLog(archivo, ventanaSeg = 60) {
  let fd;
  try {
    const st = await fsp.stat(archivo);
    const inicio = Math.max(0, st.size - 512 * 1024);   // últimos 512 KB alcanzan para 1 min
    const buf = Buffer.alloc(st.size - inicio);
    fd = await fsp.open(archivo, 'r');
    await fd.read(buf, 0, buf.length, inicio);
    const corte = Date.now() - ventanaSeg * 1000;
    const ips = new Set();
    for (const linea of buf.toString('utf8').split('\n')) {
      if (!linea.includes('.m3u8') && !linea.includes('.ts')) continue;   // solo HLS
      const t = tiempoDeLinea(linea);
      if (t === null || t < corte) continue;
      const ip = linea.split(' ')[0];
      if (ip && ip !== '127.0.0.1') ips.add(ip);
    }
    return ips.size;
  } catch { return 0; }
  finally { if (fd) await fd.close().catch(() => {}); }
}

/** GET /viewers — espectadores en vivo por cuenta (IPs únicas de HLS, últimos 60s). */
app.get('/viewers', wrap(async (req, res) => {
  const ventana = Math.min(300, Math.max(15, Number(req.query.ventana) || 60));
  const lista = await cuentas();
  const porCuenta = {};
  let total = 0;
  await Promise.all(lista.map(async (c) => {
    const n = await viewersDeLog(path.join(c.dir, 'logs', 'access.log'), ventana);
    porCuenta[c.user] = n;
    total += n;
  }));
  res.json({ ok: true, ventana, total, cuentas: porCuenta });
}));

/** GET /cuentas/:user/restream — estado del reenvío a Facebook. */
app.get('/cuentas/:user/restream', wrap(async (req, res) => {
  res.json(await restream.ver(String(req.params.user)));
}));

/**
 * PUT /cuentas/:user/restream — configura/enciende el reenvío a Facebook.
 * body: { facebook_key?, encender }
 */
app.put('/cuentas/:user/restream', wrap(async (req, res) => {
  const user = String(req.params.user);
  // Canal asilivehd (compat): la fuente es la capa (asilivehls/<user>), no un
  // puerto propio. Va por acá, sin exigir cuenta por-puerto.
  if (compat.tokenDe(user) !== undefined) {
    const r = await restream.configurar(user, {
      facebook_key: req.body?.facebook_key,
      activo: req.body?.encender !== false,
      origen: path.join(ASILIVE_HLS, `${user}.m3u8`),   // el pull RTMP se cuelga; el HLS sí lee
    });
    return res.json({ ok: true, ...r });
  }
  const lista = await cuentas();
  if (!lista.find((x) => x.user === user)) return res.status(404).json({ error: 'Cuenta no encontrada' });
  const puertoRtmp = (await puertosDe(user)).rtmp;
  const r = await restream.configurar(user, {
    facebook_key: req.body?.facebook_key,
    activo: req.body?.encender !== false,
    puertoRtmp,
  });
  res.json({ ok: true, ...r });
}));

/** GET /nodo/salud — como esta la maquina por dentro (lo que el panel no ve). */
app.get('/nodo/salud', wrap(async (req, res) => {
  const s = await salud.estado({ rutaVideos: BASE });
  // Cuántos canales están al aire, de las DOS fuentes. Contar solo las cuentas
  // propias deja fuera los heredados de asilivehd, que en el dedicado son la
  // mayoría — ese descuido ya ha mordido antes con el disco y con los viewers.
  let alAire = 0, total = 0;
  try {
    const users = compat.lista();
    total += users.length;
    for (const u of users) if (await compatAlAire(u)) alAire++;
  } catch (_) {}
  try {
    const propias = await cuentas();
    total += propias.length;
    for (const c of propias) if ((await estaAlAire(c.dir)).al_aire) alAire++;
  } catch (_) {}
  res.json({ ...s, canales: { al_aire: alAire, total } });
}));

app.get('/nodo/red', wrap(async (req, res) => {
  const txt = await fsp.readFile('/proc/net/dev', 'utf8');
  let rx = 0, tx = 0, iface = null;
  for (const linea of txt.split('\n')) {
    // iface: rx_bytes (7 campos rx) ... tx_bytes ...
    const m = linea.match(/^\s*([^:]+):\s*(\d+)(?:\s+\d+){7}\s+(\d+)/);
    if (!m) continue;
    const nombre = m[1].trim();
    if (nombre === 'lo') continue;                 // ignora loopback
    rx += Number(m[2]);
    tx += Number(m[3]);
    if (!iface) iface = nombre;
  }
  res.json({ ok: true, iface, rx_bytes: rx, tx_bytes: tx });
}));

app.use((req, res) => res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` }));
app.use((err, req, res, next) => {
  console.error('[agente]', err.message);
  res.status(err.status || 500).json({ error: err.message });
});

app.listen(PORT, HOST, () => {
  console.log(`🎬 Agente de video escuchando en ${HOST}:${PORT}`);
  // Reencender los canales 24/7 que estaban al aire (sobrevive reinicios)
  // Al restaurar, no arrancar el 24/7 de una cuenta que está EN VIVO ahora
  // (el HLS del vivo sigue vivo aunque el agente haya reiniciado).
  const hayVivo = async (user, dir) => {
    try { return (await estaAlAire(dir)).fuente === 'live-streaming'; } catch { return false; }
  };
  webtv.restaurar(hayVivo).catch((e) => console.error('[webtv] restaurar:', e.message));
  webtv.iniciarPlanificador();   // cambia de lista sola según la programación por horario
  compat247.restaurar().catch((e) => console.error('[compat247] restaurar:', e.message));   // AutoDJ de canales asilivehd
  // Reanuda los restream a Facebook que estaban activos
  restream.restaurar(async (user) => (await puertosDe(user)).rtmp).catch((e) => console.error('[restream] restaurar:', e.message));
  if (HOST !== '127.0.0.1') console.warn('   ⚠️  Expuesto fuera del servidor: asegúrate de tener firewall');
  console.log(`   Cuentas en: ${BASE}   ·   Config nginx: ${CONF_DIR}`);
  if (!TOKEN) console.warn('   ⚠️  Falta AGENT_TOKEN: el agente rechazará todas las peticiones');
});
