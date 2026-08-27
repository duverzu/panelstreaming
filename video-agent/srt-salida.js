/**
 * video-agent/srt-salida.js
 * ------------------------------------------------------------------
 * Mantiene lista la salida SRT de los canales que la tienen activada.
 *
 * POR QUÉ NO "BAJO DEMANDA": la idea original era abrir el extractor solo
 * cuando alguien pedía el canal. Suena eficiente, pero en la práctica el
 * PRIMER intento del operador fallaba siempre: mientras ffmpeg conecta con
 * nginx, reconoce las pistas y empieza a publicar, pasan entre 10 y 20
 * segundos, y el decodificador ya se rindió. Medido: fallaba 3 de cada 5
 * veces, y cambiaba de canal en cada prueba.
 *
 * Un cable operador no reintenta con paciencia: engancha y espera señal. Así
 * que el extractor se deja ENCENDIDO mientras el canal esté al aire y tenga la
 * salida activada. Cuesta un ffmpeg en modo copia por canal —CPU casi nula— a
 * cambio de que la señal esté siempre ahí.
 * ------------------------------------------------------------------
 */
const { spawn } = require('child_process');

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const INTERVALO_MS = Number(process.env.SRT_SALIDA_REVISION_MS || 30000);

const vivos = new Map();   // canal -> proceso

/** Abre el puente de ese canal, si no está ya abierto. */
function abrir(canal) {
  if (vivos.has(canal)) return;

  // -analyzeduration/-probesize: sin esto ffmpeg decide qué pistas trae el
  // canal con lo poco que ve en su primer medio segundo, y en un canal cuyos
  // fotogramas clave van espaciados se queda SOLO CON EL AUDIO — al operador
  // le llega sonido y pantalla negra.
  const p = spawn(FFMPEG, [
    '-hide_banner', '-loglevel', 'warning', '-nostdin',
    '-analyzeduration', '10000000', '-probesize', '10000000',
    '-i', `rtmp://127.0.0.1:1935/asilivehls/${canal}`,
    '-c', 'copy', '-f', 'rtsp', '-rtsp_transport', 'tcp',
    `rtsp://127.0.0.1:8554/${canal}`,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  vivos.set(canal, p);
  console.log(`[srt-salida] ${canal}: puente abierto`);
  p.stderr.on('data', (d) => {
    const t = String(d).trim();
    if (t) console.error(`[srt-salida:${canal}] ${t.slice(0, 160)}`);
  });
  p.on('exit', () => {
    vivos.delete(canal);
    console.log(`[srt-salida] ${canal}: puente cerrado`);
  });
}

/** Cierra el puente de un canal. */
function cerrar(canal) {
  const p = vivos.get(canal);
  if (!p) return;
  p.kill('SIGTERM');
  vivos.delete(canal);
}

/**
 * Deja abiertos los puentes que deben estarlo y cierra los demás.
 * @param habilitados  canales con salida SRT activada
 * @param alAire       función async (canal) -> bool
 */
async function sincronizar(habilitados, alAire) {
  const deben = new Set();
  for (const canal of habilitados) {
    // Sin señal que sacar, abrir el puente solo produce un ffmpeg fallando y
    // reintentando. Se espera a que el canal esté al aire.
    if (await alAire(canal).catch(() => false)) deben.add(canal);
  }
  for (const canal of deben) abrir(canal);
  for (const canal of [...vivos.keys()]) if (!deben.has(canal)) cerrar(canal);
}

function iniciar(habilitados, alAire) {
  const tic = () => sincronizar(habilitados(), alAire).catch((e) => console.error('[srt-salida]', e.message));
  tic();
  setInterval(tic, INTERVALO_MS).unref();
  console.log(`🛰️  Salida SRT: puentes vigilados cada ${INTERVALO_MS / 1000}s`);
}

module.exports = { iniciar, sincronizar, abrir, cerrar, vivos };
