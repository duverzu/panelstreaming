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
const listas = require('./listas');

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

/**
 * Mata ffmpeg de ejecuciones previas que empujen a <user>stream/play.
 * Lee el cmdline de cada ffmpeg en vez de confiar en un patrón de pgrep
 * (pgrep -fx no cazaba bien el destino rtmp): mas robusto.
 */
function matarHuerfanos(user) {
  return new Promise((resolve) => {
    execFile('pgrep', ['-x', 'ffmpeg'], (e, out) => {
      const pids = String(out || '').trim().split(/\s+/).filter(Boolean);
      let matados = 0;
      const mio = canales.get(user)?.proceso?.pid;
      for (const pid of pids) {
        if (Number(pid) === mio) continue;   // no matar el propio, por si acaso
        let cmd = '';
        try { cmd = fs.readFileSync(`/proc/${pid}/cmdline`).toString().replace(/\0/g, ' '); } catch { continue; }
        if (cmd.includes(`${user}stream/play`)) {
          try { process.kill(Number(pid), 'SIGKILL'); matados++; } catch (_) {}
        }
      }
      if (matados) console.log(`[webtv] ${user}: ${matados} emisor(es) huérfano(s) eliminados`);
      setTimeout(resolve, 700);
    });
  });
}

const VIDEO = /\.(mp4|mkv|mov|webm|flv)$/i;   // .ts NO: son fragmentos HLS, no videos

/**
 * Arma el archivo de lista que consume ffmpeg.
 * Se ordena por nombre para que la programación sea predecible: el cliente
 * puede numerar sus archivos (01-, 02-…) y saber en qué orden salen.
 */
async function escribirLista(dirVideos, destino) {
  let archivos = [];
  try {
    archivos = (await fsp.readdir(dirVideos)).filter((f) => VIDEO.test(f));
  } catch (_) { /* carpeta inexistente */ }

  // Orden de emisión, por prioridad:
  //  1) listas.json → la lista que toca por horario o la lista activa
  //  2) orden.json  → una sola lista ordenada (compatibilidad nivel 1)
  //  3) orden numérico natural por nombre
  const dirCuenta = path.dirname(dirVideos);
  let seleccion = 'todos';
  const datosListas = await listas.leer(dirCuenta);
  const hayListas = Object.keys(datosListas.listas || {}).length > 0;

  if (hayListas) {
    const r = listas.listaActual(datosListas, archivos, new Date());
    archivos = r.videos;
    seleccion = r.id;
  } else {
    let orden = null;
    try { orden = JSON.parse(await fsp.readFile(path.join(dirCuenta, 'orden.json'), 'utf8')); } catch (_) {}
    if (Array.isArray(orden) && orden.length) {
      const existentes = new Set(archivos);
      archivos = [...orden.filter((f) => existentes.has(f)), ...archivos.filter((f) => !orden.includes(f))];
      seleccion = 'orden';
    } else {
      archivos.sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
    }
  }

  if (archivos.length === 0) return { total: 0, ruta: null, seleccion };

  // Formato del demuxer `concat`: una línea por archivo, con la ruta entre
  // comillas simples y las comillas internas escapadas.
  const lineas = archivos.map((f) => {
    const completo = path.join(dirVideos, f).replace(/'/g, "'\\''");
    return `file '${completo}'`;
  });

  await fsp.writeFile(destino, lineas.join('\n') + '\n', 'utf8');
  return { total: archivos.length, ruta: destino, archivos, seleccion };
}

/**
 * Firma técnica de un video (para saber si la lista es uniforme).
 * Incluye VIDEO y AUDIO: -c copy con el demuxer concat exige que TODOS los
 * archivos compartan también los parámetros de audio (códec, tasa, canales).
 * Ignorar el audio hacía que una lista con audio disparejo eligiera 'copy' y
 * el ffmpeg se cayera a los pocos segundos en bucle.
 */
function firma(archivo) {
  return new Promise((resolve) => {
    execFile(FFPROBE, ['-v', 'error',
      '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels',
      '-of', 'csv=p=0', archivo], (err, out) => resolve(err ? null : out.trim()));
  });
}

/**
 * ¿Todos los videos comparten firma? Entonces se puede emitir con -c copy.
 * Un ffprobe que falla (null) NO cuenta como firma distinta: bajo carga
 * alta (p.ej. restaurar tras un reinicio) algunos fallan transitoriamente,
 * y contarlos como distintos forzaba transcode sin motivo. Se reintenta
 * una vez y, si aun falla, se ignora ese archivo en la comparación.
 */
async function esUniforme(archivos, dir) {
  const firmas = new Set();
  for (const f of archivos) {
    let s = await firma(path.join(dir, f));
    if (!s) s = await firma(path.join(dir, f));   // un reintento
    if (!s) continue;                             // ffprobe falló: no decide
    firmas.add(s);
    if (firmas.size > 1) return false;
  }
  return firmas.size === 1;   // al menos una firma leída y todas iguales
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

  // Reserva ATÓMICA del canal antes de cualquier await. escribirLista/esUniforme
  // hacen ffprobe de todos los videos (lento); sin esta reserva, un segundo
  // iniciar() concurrente pasaría el guard de arriba y arrancaría un SEGUNDO
  // emisor que choca con el primero ("Already publishing"). Reservar aquí hace
  // que el segundo llamado vea el canal ya tomado y se retire con ya:true.
  const registro = { reinicios: 0, desde: new Date(), total: 0, parar: false, modo: 'copy', dirCuenta, puertoRtmp, host };
  canales.set(user, registro);

  const dirVideos = path.join(dirCuenta, 'uploads');
  const lista = path.join(dirCuenta, 'playlist.txt');
  let total, archivos, seleccion;
  try {
    ({ total, archivos, seleccion } = await escribirLista(dirVideos, lista));
    if (!total) { canales.delete(user); return { ok: false, error: 'La cuenta no tiene videos para emitir' }; }
    // Si los videos no son uniformes, se normalizan al vuelo (como hacía VDO)
    registro.modo = (await esUniforme(archivos, dirVideos)) ? 'copy' : 'transcode';
  } catch (e) {
    canales.delete(user);   // liberar la reserva si algo falló antes de arrancar
    throw e;
  }
  registro.total = total;
  registro.seleccion = seleccion;

  const modo = registro.modo;
  const destino = `rtmp://${host}:${puertoRtmp}/${user}stream/play`;

  const lanzar = () => {
    const t0 = Date.now();
    const proceso = spawn(FFMPEG, argumentos(lista, destino, registro.modo));
    registro.proceso = proceso;

    proceso.stderr.on('data', (d) => {
      const txt = String(d).trim();
      if (!txt) return;
      // Ruido conocido del bucle en modo copia: al saltar de un video a otro el
      // audio trae timestamps levemente desordenados y ffmpeg los corrige solo
      // ("changing to N"). Se cuentan pero no se imprimen: si no, sepultan los
      // errores de verdad en el log.
      if (/Non-monotonic DTS|changing to \d+/i.test(txt)) {
        registro.avisosDts = (registro.avisosDts || 0) + 1;
        return;
      }
      console.error(`[webtv:${user}]`, txt.slice(0, 200));
    });

    proceso.on('exit', (codigo) => {
      if (registro.parar) return;                 // lo apagamos nosotros
      registro.reinicios++;
      const vivioMs = Date.now() - t0;

      // Si en modo copy el proceso se cae enseguida varias veces seguidas, los
      // videos no son de verdad compatibles con copia directa (audio distinto,
      // extradata, timestamps del bucle…). Escalamos a transcode, que acepta
      // cualquier mezcla: mejor gastar CPU que dejar el canal caído.
      if (registro.modo === 'copy') {
        registro.fallosCopy = vivioMs < 15000 ? (registro.fallosCopy || 0) + 1 : 0;
        if (registro.fallosCopy >= 2) {
          console.error(`[webtv:${user}] copy inestable (${registro.fallosCopy} caídas rápidas); cambio a transcode`);
          registro.modo = 'transcode';
          registro.fallosCopy = 0;
        }
      }

      console.error(`[webtv:${user}] ffmpeg terminó (${codigo}); reintentando en ${REINTENTO_MS / 1000}s (modo ${registro.modo})`);
      registro.timer = setTimeout(lanzar, REINTENTO_MS);
    });
  };

  lanzar();
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
  detener(user);                       // SIGTERM al emisor actual
  await matarHuerfanos(user).catch(() => {});  // asegura que no queden dos empujando a la vez
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
    avisos_dts: r.avisosDts || 0,   // corregidos solos por ffmpeg, informativo
    pid: r.proceso?.pid || null,
  };
}

const todos = () => Object.fromEntries([...canales.keys()].map((u) => [u, estado(u)]));

/**
 * Planificador: cada minuto revisa, por cada canal, si la lista que debería
 * emitir AHORA (según la programación por horario) cambió respecto a la que
 * está emitiendo. Si cambió, reinicia el canal con la nueva lista.
 */
let planTimer = null;
function iniciarPlanificador() {
  if (planTimer) return;
  planTimer = setInterval(async () => {
    for (const [user, r] of canales) {
      try {
        const datos = await listas.leer(r.dirCuenta);
        if (!Object.keys(datos.listas || {}).length) continue;  // sin listas, nada que planificar
        let disp = [];
        try { disp = (await fsp.readdir(path.join(r.dirCuenta, 'uploads'))).filter((f) => VIDEO.test(f)); } catch (_) {}
        const { id } = listas.listaActual(datos, disp, new Date());
        if (id !== r.seleccion) {
          console.log(`[webtv] ${user}: cambia de lista (${r.seleccion} → ${id})`);
          await recargar(user, { dirCuenta: r.dirCuenta, puertoRtmp: r.puertoRtmp, host: r.host });
        }
      } catch (e) { console.error(`[webtv] planificador ${user}:`, e.message); }
    }
  }, 60000);
}

module.exports = { iniciar, detener, recargar, estado, todos, restaurar, iniciarPlanificador, escribirLista, argumentos };
