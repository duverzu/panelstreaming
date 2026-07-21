/**
 * webtv.js — la emisión 24/7 (el "AutoDJ" del video)
 * ------------------------------------------------------------------
 * Mantiene el canal del cliente al aire reproduciendo su lista de videos
 * en bucle. Es lo que sus espectadores ven cuando nadie está en vivo.
 *
 * DECISIÓN CLAVE — se transcodifica al SUBIR, no al emitir:
 *
 *   Al subir un video se normaliza UNA vez (mismo códec, resolución y
 *   audio que el resto). Emitir es entonces copiar bytes: ffmpeg apenas
 *   usa CPU y el servidor aguanta muchos canales a la vez.
 *
 *   La alternativa (transcodificar en cada emisión) gasta 1-2 núcleos por
 *   canal permanentemente: con 8 núcleos serían 4 canales como mucho.
 *
 * Si los videos no están normalizados, `-c copy` corta el stream entre
 * archivos. Por eso `normalizado` es requisito, no una optimización.
 * ------------------------------------------------------------------
 */
const { spawn } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const REINTENTO_MS = Number(process.env.WEBTV_REINTENTO_MS || 5000);

/** Canales en marcha: user -> { proceso, reinicios, desde } */
const canales = new Map();

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

/** Argumentos de ffmpeg para emitir la lista en bucle hacia el RTMP local. */
function argumentos(lista, destinoRtmp) {
  return [
    '-hide_banner', '-loglevel', 'warning',
    '-re',                        // a velocidad real: es una emisión, no una conversión
    '-stream_loop', '-1',         // en bucle infinito
    '-f', 'concat', '-safe', '0',
    '-i', lista,
    '-c', 'copy',                 // sin recodificar: los videos ya vienen normalizados
    '-f', 'flv',
    destinoRtmp,
  ];
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
  const { total } = await escribirLista(dirVideos, lista);
  if (!total) return { ok: false, error: 'La cuenta no tiene videos para emitir' };

  const destino = `rtmp://${host}:${puertoRtmp}/${user}stream/play`;
  const registro = { reinicios: 0, desde: new Date(), total, parar: false };

  const lanzar = () => {
    const proceso = spawn(FFMPEG, argumentos(lista, destino));
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
  return { ok: true, videos: total, destino };
}

/** Apaga el canal 24/7 de una cuenta. */
function detener(user) {
  const r = canales.get(user);
  if (!r) return { ok: false, error: 'Ese canal no está emitiendo' };
  r.parar = true;
  clearTimeout(r.timer);
  try { r.proceso?.kill('SIGTERM'); } catch (_) {}
  canales.delete(user);
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
    desde: r.desde,
    reinicios: r.reinicios,
    pid: r.proceso?.pid || null,
  };
}

const todos = () => Object.fromEntries([...canales.keys()].map((u) => [u, estado(u)]));

module.exports = { iniciar, detener, recargar, estado, todos, escribirLista, argumentos };
