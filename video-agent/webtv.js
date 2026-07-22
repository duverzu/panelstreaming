/**
 * webtv.js — la emisión 24/7 (el "AutoDJ" del video)
 * ------------------------------------------------------------------
 * Mantiene el canal del cliente al aire reproduciendo su lista de videos
 * en bucle. Es lo que sus espectadores ven cuando nadie está en vivo.
 *
 * MODO DUAL, elegido automáticamente según los videos de la cuenta:
 *
 *   'copy'      → si todos comparten firma (códec/resolución/fps), se
 *                 copian bytes: CPU casi cero, aguanta muchos canales.
 *   'transcode' → si son heterogéneos (el caso de los clientes que vienen
 *                 de VDO Panel), se normalizan al vuelo a un formato común.
 *                 Gasta ~medio núcleo por canal, como hacía VDO.
 *
 * A futuro, normalizar los videos al SUBIR los lleva al modo 'copy' y
 * libera el CPU. Mientras tanto, 'transcode' hace la migración inmediata
 * sin tener que recodificar 32 archivos antes de cortar.
 * ------------------------------------------------------------------
 */
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || 'ffprobe';
// Parámetros de salida cuando hay que normalizar al vuelo (videos heterogéneos)
const V_RES = process.env.WEBTV_RES || '1280x720';
const V_FPS = process.env.WEBTV_FPS || '30';
const V_KBPS = process.env.WEBTV_KBPS || '2500';
const REINTENTO_MS = Number(process.env.WEBTV_REINTENTO_MS || 5000);

/** Canales en marcha: user -> { proceso, reinicios, desde } */
const canales = new Map();

// Archivo con los canales que DEBEN estar al aire, para reencenderlos si el
// agente o el servidor se reinician. Guarda lo justo para volver a arrancar.
const ESTADO_FILE = process.env.WEBTV_ESTADO || path.join(__dirname, 'canales-activos.json');
const opciones = new Map();   // user -> { dirCuenta, puertoRtmp, host }

async function persistir() {
  const datos = {};
  for (const [user, o] of opciones) datos[user] = o;
  try { await fsp.writeFile(ESTADO_FILE, JSON.stringify(datos, null, 2)); } catch (_) {}
}

/** Reenciende al arrancar los canales que estaban al aire (tras un reinicio). */
async function restaurar() {
  let datos = {};
  try { datos = JSON.parse(await fsp.readFile(ESTADO_FILE, 'utf8')); } catch { return; }
  const users = Object.keys(datos);
  if (users.length) console.log(`[webtv] restaurando ${users.length} canal(es): ${users.join(', ')}`);
  for (const [user, o] of Object.entries(datos)) {
    // Si un ffmpeg de una ejecución anterior sigue empujando a este canal,
    // matarlo antes de arrancar el nuevo (evita dos emisores por canal).
    await matarHuerfanos(user).catch(() => {});
    await iniciar(user, o).catch((e) => console.error(`[webtv] no se pudo restaurar ${user}:`, e.message));
  }
}

/** Mata ffmpeg de ejecuciones previas que empujen a <user>stream/play. */
function matarHuerfanos(user) {
  return new Promise((resolve) => {
    execFile('pgrep', ['-fx', `.*${user}stream/play.*`], (e, out) => {
      const pids = String(out || '').trim().split(/\s+/).filter(Boolean);
      for (const pid of pids) { try { process.kill(Number(pid), 'SIGTERM'); } catch (_) {} }
      if (pids.length) console.log(`[webtv] ${user}: ${pids.length} emisor(es) huérfano(s) eliminados`);
      setTimeout(resolve, 500);
    });
  });
}

const VIDEO = /\.(mp4|mkv|mov|webm|flv|ts)$/i;

/**
 * Arma el archivo de lista que consume ffmpeg.
 * Se ordena por nombre para que la programación sea predecible: el cliente
 * puede numerar sus archivos (01-, 02-…) y saber en qué orden salen.
 */
async function escribirLista(dirVideos, destino) {
  let archivos = [];
  try {
    archivos = (await fsp.readdir(dirVideos))
      .filter((f) => VIDEO.test(f))
      .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  } catch (_) { /* carpeta inexistente */ }

  if (archivos.length === 0) return { total: 0, ruta: null };

  // Formato del demuxer `concat`: una línea por archivo, con la ruta entre
  // comillas simples y las comillas internas escapadas.
  const lineas = archivos.map((f) => {
    const completo = path.join(dirVideos, f).replace(/'/g, "'\\''");
    return `file '${completo}'`;
  });

  await fsp.writeFile(destino, lineas.join('\n') + '\n', 'utf8');
  return { total: archivos.length, ruta: destino, archivos };
}

/** Firma técnica de un video (para saber si la lista es uniforme). */
function firma(archivo) {
  return new Promise((resolve) => {
    execFile(FFPROBE, ['-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,width,height,r_frame_rate',
      '-of', 'csv=p=0', archivo], (err, out) => resolve(err ? null : out.trim()));
  });
}

/** ¿Todos los videos comparten firma? Entonces se puede emitir con -c copy. */
async function esUniforme(archivos, dir) {
  const firmas = new Set();
  for (const f of archivos) {
    const s = await firma(path.join(dir, f));
    firmas.add(s || 'desconocida');
    if (firmas.size > 1) return false;
  }
  return firmas.size === 1;
}

/**
 * Argumentos de ffmpeg para emitir la lista en bucle.
 * modo 'copy'      → copia bytes (videos uniformes, CPU casi cero).
 * modo 'transcode' → recodifica al vuelo a un formato común (videos
 *                    heterogéneos): funciona con cualquier mezcla, gasta
 *                    ~medio núcleo por canal, igual que hacía VDO Panel.
 */
function argumentos(lista, destinoRtmp, modo) {
  const base = ['-hide_banner', '-loglevel', 'warning', '-re', '-stream_loop', '-1',
    '-f', 'concat', '-safe', '0', '-i', lista];
  if (modo === 'transcode') {
    return [...base,
      '-vf', `scale=${V_RES.replace('x', ':')}:force_original_aspect_ratio=decrease,pad=${V_RES.replace('x', ':')}:(ow-iw)/2:(oh-ih)/2,fps=${V_FPS}`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', `${V_KBPS}k`, '-g', String(Number(V_FPS) * 2),
      '-c:a', 'aac', '-ar', '44100', '-b:a', '128k',
      '-f', 'flv', destinoRtmp];
  }
  return [...base, '-c', 'copy', '-f', 'flv', destinoRtmp];
}

/**
 * Enciende el canal 24/7 de una cuenta.
 * Si el proceso se cae (video corrupto, disco lleno), se reintenta solo:
 * un canal caído es lo peor que le puede pasar al cliente.
 */
async function iniciar(user, { dirCuenta, puertoRtmp, host = '127.0.0.1' }) {
  if (canales.has(user)) return { ya: true, ...estado(user) };

  const dirVideos = path.join(dirCuenta, 'uploads');
  const lista = path.join(dirCuenta, 'playlist.txt');
  const { total, archivos } = await escribirLista(dirVideos, lista);
  if (!total) return { ok: false, error: 'La cuenta no tiene videos para emitir' };

  // Si los videos no son uniformes, se normalizan al vuelo (como hacía VDO)
  const modo = (await esUniforme(archivos, dirVideos)) ? 'copy' : 'transcode';

  const destino = `rtmp://${host}:${puertoRtmp}/${user}stream/play`;
  const registro = { reinicios: 0, desde: new Date(), total, parar: false, modo };

  const lanzar = () => {
    const proceso = spawn(FFMPEG, argumentos(lista, destino, modo));
    registro.proceso = proceso;

    proceso.stderr.on('data', (d) => {
      const txt = String(d).trim();
      if (txt) console.error(`[webtv:${user}]`, txt.slice(0, 200));
    });

    proceso.on('exit', (codigo) => {
      if (registro.parar) return;                 // lo apagamos nosotros
      registro.reinicios++;
      console.error(`[webtv:${user}] ffmpeg terminó (${codigo}); reintentando en ${REINTENTO_MS / 1000}s`);
      registro.timer = setTimeout(lanzar, REINTENTO_MS);
    });
  };

  lanzar();
  canales.set(user, registro);
  opciones.set(user, { dirCuenta, puertoRtmp, host });
  await persistir();
  return { ok: true, videos: total, modo, destino };
}

/** Apaga el canal 24/7 de una cuenta. */
function detener(user) {
  const r = canales.get(user);
  if (!r) return { ok: false, error: 'Ese canal no está emitiendo' };
  r.parar = true;
  clearTimeout(r.timer);
  try { r.proceso?.kill('SIGTERM'); } catch (_) {}
  canales.delete(user);
  opciones.delete(user);
  persistir();
  return { ok: true };
}

/** Vuelve a leer la carpeta y reinicia: se usa al subir o borrar un video. */
async function recargar(user, opciones) {
  detener(user);
  return iniciar(user, opciones);
}

function estado(user) {
  const r = canales.get(user);
  if (!r) return { emitiendo: false };
  return {
    emitiendo: true,
    videos: r.total,
    modo: r.modo,
    desde: r.desde,
    reinicios: r.reinicios,
    pid: r.proceso?.pid || null,
  };
}

const todos = () => Object.fromEntries([...canales.keys()].map((u) => [u, estado(u)]));

module.exports = { iniciar, detener, recargar, estado, todos, restaurar, escribirLista, argumentos };
