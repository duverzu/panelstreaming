/**
 * normalizar.js — lleva los videos de una cuenta a un formato uniforme
 * ------------------------------------------------------------------
 * Recodifica cada video a un mismo códec/resolución/fps una sola vez.
 * Con todos iguales, la emisión pasa de modo 'transcode' (~1 núcleo por
 * canal, permanente) a modo 'copy' (~2%, casi nada).
 *
 * Se hace en SEGUNDO PLANO y de a un video a la vez (nice), para no
 * competir con las emisiones que están al aire. La emisión sigue con los
 * originales hasta que la cuenta queda entera normalizada; recién ahí se
 * reemplazan y se reinicia el canal en modo copy.
 * ------------------------------------------------------------------
 */
const { spawn, execFile } = require('child_process');
const fsp = require('fs/promises');
const path = require('path');

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || 'ffprobe';
const RES = process.env.NORM_RES || '1280x720';
const FPS = process.env.NORM_FPS || '30';
const KBPS = process.env.NORM_KBPS || '2500';

const VIDEO = /\.(mp4|mkv|mov|webm|flv)$/i;

// Trabajos en curso: user -> { total, hechos, actual, cancelar }
const trabajos = new Map();

/** Normaliza UN archivo a <destino>. Resuelve false si ffmpeg falla. */
function unVideo(entrada, destino) {
  return new Promise((resolve) => {
    // nice/ionice para no robarle CPU ni disco a las emisiones al aire
    const args = [
      '-hide_banner', '-loglevel', 'error', '-y', '-i', entrada,
      '-vf', `scale=${RES.replace('x', ':')}:force_original_aspect_ratio=decrease,` +
             `pad=${RES.replace('x', ':')}:(ow-iw)/2:(oh-ih)/2,fps=${FPS}`,
      '-c:v', 'libx264', '-preset', 'medium', '-b:v', `${KBPS}k`,
      '-pix_fmt', 'yuv420p', '-g', String(Number(FPS) * 2),
      '-c:a', 'aac', '-ar', '44100', '-b:a', '128k', '-movflags', '+faststart',
      destino,
    ];
    const p = spawn('nice', ['-n', '15', 'ionice', '-c', '3', FFMPEG, ...args]);
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('exit', (c) => {
      if (c === 0) return resolve(true);
      console.error(`[normalizar] falló ${path.basename(entrada)}:`, err.slice(-200));
      resolve(false);
    });
  });
}

/**
 * Normaliza toda una cuenta. Trabaja sobre copias en uploads/.normalizado
 * y solo al final reemplaza los originales, para no dañar la emisión en curso.
 * @param onFin  callback(resultado) cuando termina (para reiniciar el canal)
 */
async function cuenta(user, dirCuenta, onFin) {
  if (trabajos.has(user)) return { ya: true, ...estado(user) };

  const uploads = path.join(dirCuenta, 'uploads');
  const tmp = path.join(uploads, '.normalizado');
  await fsp.mkdir(tmp, { recursive: true });

  let archivos = [];
  try {
    archivos = (await fsp.readdir(uploads)).filter((f) => VIDEO.test(f));
  } catch (_) {}
  if (archivos.length === 0) return { ok: false, error: 'La cuenta no tiene videos' };

  const trabajo = { total: archivos.length, hechos: 0, fallidos: 0, actual: null, cancelar: false };
  trabajos.set(user, trabajo);

  (async () => {
    for (const f of archivos) {
      if (trabajo.cancelar) break;
      trabajo.actual = f;
      // El destino es .mp4 siempre (formato uniforme), respetando el nombre base
      const base = f.replace(/\.[^.]+$/, '') + '.mp4';
      const ok = await unVideo(path.join(uploads, f), path.join(tmp, base));
      ok ? trabajo.hechos++ : trabajo.fallidos++;
    }

    let reemplazados = 0;
    if (!trabajo.cancelar && trabajo.fallidos === 0) {
      // Reemplazar originales por las versiones normalizadas
      for (const f of archivos) {
        const base = f.replace(/\.[^.]+$/, '') + '.mp4';
        const nuevo = path.join(tmp, base);
        try {
          await fsp.rename(nuevo, path.join(uploads, base));
          if (base !== f) await fsp.unlink(path.join(uploads, f)).catch(() => {});
          reemplazados++;
        } catch (e) { console.error('[normalizar] reemplazo:', e.message); }
      }
    }
    await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});

    trabajo.actual = null;
    trabajos.delete(user);
    const resultado = {
      ok: !trabajo.cancelar && trabajo.fallidos === 0,
      normalizados: reemplazados, fallidos: trabajo.fallidos, cancelado: trabajo.cancelar,
    };
    if (onFin) onFin(resultado);
    console.log(`[normalizar] ${user}: ${JSON.stringify(resultado)}`);
  })();

  return { ok: true, iniciado: true, total: trabajo.total };
}

// ── Normalización automática AL SUBIR ────────────────────────────────
// Con esto la cuenta se mantiene uniforme para siempre y el canal nunca se
// cae a modo 'transcode' por un video que vino en otro formato.

/** Lee los streams del archivo (null si ffprobe falla). */
function analizar(archivo) {
  return new Promise((resolve) => {
    execFile(FFPROBE, ['-v', 'error', '-show_entries',
      'stream=codec_type,codec_name,width,height,r_frame_rate', '-of', 'json', archivo],
    (err, out) => {
      if (err) return resolve(null);
      try { resolve(JSON.parse(out).streams || []); } catch { resolve(null); }
    });
  });
}

/** ¿El archivo YA viene en el formato estándar? Entonces no se toca. */
async function yaEstandar(archivo) {
  const streams = await analizar(archivo);
  if (!streams) return false;                 // no se pudo leer → normalizar por las dudas
  const [W, H] = RES.split('x').map(Number);
  const v = streams.find((s) => s.codec_type === 'video');
  const a = streams.find((s) => s.codec_type === 'audio');
  if (!v || v.codec_name !== 'h264' || v.width !== W || v.height !== H) return false;
  const [n, d] = String(v.r_frame_rate || '0/1').split('/').map(Number);
  if (!d || Math.round(n / d) !== Number(FPS)) return false;
  return Boolean(a && a.codec_name === 'aac');
}

// Cola: se normaliza de a UN video a la vez en todo el nodo, para no robarle
// CPU a las emisiones que están al aire.
const cola = [];
let ocupado = false;

async function bombear() {
  if (ocupado) return;
  ocupado = true;
  while (cola.length) {
    try { await cola.shift()(); } catch (e) { console.error('[normalizar] tarea:', e.message); }
  }
  ocupado = false;
}

/**
 * Normaliza UN video recién subido, en segundo plano.
 * Si ya viene en el formato estándar no gasta CPU: llama a onFin enseguida.
 * @param onFin callback({ok, normalizado, archivo}) cuando ya se puede emitir
 */
function alSubir(user, dirCuenta, nombre, onFin) {
  cola.push(async () => {
    const uploads = path.join(dirCuenta, 'uploads');
    const origen = path.join(uploads, nombre);

    if (await yaEstandar(origen)) {
      console.log(`[normalizar] ${user}: ${nombre} ya está en formato estándar`);
      if (onFin) onFin({ ok: true, normalizado: false, archivo: nombre });
      return;
    }

    // Carpeta temporal propia (no la de la normalización de cuenta completa)
    const tmp = path.join(uploads, '.tmp-subida');
    await fsp.mkdir(tmp, { recursive: true });
    const base = nombre.replace(/\.[^.]+$/, '') + '.mp4';
    const destino = path.join(tmp, base);

    const ok = await unVideo(origen, destino);
    let archivoFinal = nombre;
    if (ok) {
      try {
        await fsp.rename(destino, path.join(uploads, base));
        if (base !== nombre) await fsp.unlink(origen).catch(() => {});
        archivoFinal = base;
      } catch (e) { console.error('[normalizar] reemplazo:', e.message); }
    }
    await fsp.unlink(destino).catch(() => {});   // por si quedó a medias
    console.log(`[normalizar] ${user}: ${nombre} → ${ok ? archivoFinal : 'falló, se deja el original'}`);
    if (onFin) onFin({ ok, normalizado: ok, archivo: archivoFinal });
  });
  bombear();
}

function cancelar(user) {
  const t = trabajos.get(user);
  if (t) t.cancelar = true;
  return { ok: Boolean(t) };
}

function estado(user) {
  const t = trabajos.get(user);
  if (!t) return { normalizando: false };
  return {
    normalizando: true, total: t.total, hechos: t.hechos,
    fallidos: t.fallidos, actual: t.actual,
    porcentaje: Math.round((t.hechos / t.total) * 100),
  };
}

const todos = () => Object.fromEntries([...trabajos.keys()].map((u) => [u, estado(u)]));

module.exports = { cuenta, cancelar, estado, todos, alSubir, yaEstandar };
