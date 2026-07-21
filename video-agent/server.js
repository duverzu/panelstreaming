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
const webtv = require('./webtv');
const { crearCuenta, eliminarConfig } = require('./crear');
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
  if (req.path.startsWith('/rtmp/')) {
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
  res.status(200).end();
}));

/** POST /rtmp/fin — nginx avisa que la transmisión terminó (on_publish_done). */
app.post('/rtmp/fin', wrap(async (req, res) => {
  const user = String(req.body?.app || '').replace(/live$/, '');
  if (user) console.log(`[rtmp] ${user}: terminó la transmisión en vivo`);
  res.status(200).end();
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

    // Si el canal está al aire, reiniciarlo para que incluya el nuevo video
    try {
      const lista = await cuentas();
      const c = lista.find((x) => x.user === user);
      if (c && webtv.estado(user).emitiendo) {
        const puertos = await puertosDe(user);
        if (puertos.rtmp) await webtv.recargar(user, { dirCuenta: c.dir, puertoRtmp: puertos.rtmp });
      }
    } catch (e) { console.error('[subir] reinicio canal:', e.message); }

    res.status(201).json({ ok: true, archivo: req.file.filename, bytes: req.file.size });
  });
});

/** DELETE /cuentas/:user/videos/:nombre — borra un video y reinicia el canal. */
app.delete('/cuentas/:user/videos/:nombre', wrap(async (req, res) => {
  const user = String(req.params.user);
  const r = await subida.borrar(user, req.params.nombre);
  if (!r.ok) return res.status(404).json(r);

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

app.use((req, res) => res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` }));
app.use((err, req, res, next) => {
  console.error('[agente]', err.message);
  res.status(err.status || 500).json({ error: err.message });
});

app.listen(PORT, HOST, () => {
  console.log(`🎬 Agente de video escuchando en ${HOST}:${PORT}`);
  // Reencender los canales 24/7 que estaban al aire (sobrevive reinicios)
  webtv.restaurar().catch((e) => console.error('[webtv] restaurar:', e.message));
  if (HOST !== '127.0.0.1') console.warn('   ⚠️  Expuesto fuera del servidor: asegúrate de tener firewall');
  console.log(`   Cuentas en: ${BASE}   ·   Config nginx: ${CONF_DIR}`);
  if (!TOKEN) console.warn('   ⚠️  Falta AGENT_TOKEN: el agente rechazará todas las peticiones');
});
