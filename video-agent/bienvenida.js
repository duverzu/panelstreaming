/**
 * video-agent/bienvenida.js
 * ------------------------------------------------------------------
 * El video que se le deja a una cuenta recién creada.
 *
 * Sin ningún video, la emisión 24/7 NO puede arrancar: la lista sale vacía y
 * no hay nada que poner al aire. El cliente le da a «Iniciar» y no pasa nada,
 * sin ningún mensaje que explique por qué.
 *
 * Se GENERA aquí con ffmpeg en vez de traer un clip de fuera: así no depende
 * de material de nadie, no hay licencia que revisar y pesa unos pocos KB.
 * Se crea una sola vez y se copia a cada cuenta nueva.
 * ------------------------------------------------------------------
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { execFile } = require('child_process');

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FUENTE = process.env.FUENTE_TTF || '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const ARCHIVO = path.join(__dirname, 'plantillas', 'bienvenida.mp4');
const SEGUNDOS = Number(process.env.BIENVENIDA_SEG || 20);

/** Crea el clip si todavía no existe. Devuelve su ruta, o null si no se pudo. */
async function asegurar() {
  try { await fsp.access(ARCHIVO); return ARCHIVO; } catch (_) { /* hay que crearlo */ }

  const texto = (process.env.BIENVENIDA_TEXTO || 'Tu canal esta listo').replace(/[:'\\]/g, '');
  const linea2 = (process.env.BIENVENIDA_TEXTO2 || 'Sube tus videos desde el panel').replace(/[:'\\]/g, '');
  const hayFuente = fs.existsSync(FUENTE);

  // Fondo oscuro liso + dos líneas de texto. Nada de imágenes ni música de
  // terceros: se dibuja entero, así que es nuestro y no caduca.
  const filtros = hayFuente
    ? `drawtext=fontfile=${FUENTE}:text='${texto}':fontcolor=white:fontsize=54:x=(w-tw)/2:y=(h/2)-70,`
      + `drawtext=fontfile=${FUENTE}:text='${linea2}':fontcolor=0xb8c0cc:fontsize=30:x=(w-tw)/2:y=(h/2)+10`
    : 'null';

  const args = [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', `color=c=0x0b1220:s=1280x720:d=${SEGUNDOS}:r=25`,
    '-f', 'lavfi', '-i', `anullsrc=channel_layout=stereo:sample_rate=44100:d=${SEGUNDOS}`,
    '-vf', filtros,
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-b:v', '900k',
    '-c:a', 'aac', '-b:a', '96k', '-shortest', ARCHIVO,
  ];

  await fsp.mkdir(path.dirname(ARCHIVO), { recursive: true });
  await new Promise((resolve, reject) => {
    execFile(FFMPEG, args, { timeout: 60000 }, (err, _o, stderr) => (err ? reject(new Error(String(stderr).slice(0, 200))) : resolve()));
  });
  return ARCHIVO;
}

/**
 * Deja el clip en la carpeta de una cuenta. No pisa nada: si la cuenta ya
 * tiene videos, se deja como está — el cliente ya subió lo suyo.
 */
async function ponerEn(dirCuenta) {
  const uploads = path.join(dirCuenta, 'uploads');
  try {
    const hay = (await fsp.readdir(uploads)).some((f) => /\.(mp4|mkv|mov|webm|flv)$/i.test(f));
    if (hay) return false;
  } catch (_) { return false; }

  const origen = await asegurar();
  const destino = path.join(uploads, 'bienvenida.mp4');
  await fsp.copyFile(origen, destino);
  // El worker de nginx lee estos archivos, y no corre como root.
  await fsp.chmod(destino, 0o644).catch(() => {});
  return true;
}

/**
 * Quita el clip de bienvenida en cuanto la cuenta tiene contenido propio.
 *
 * Es un arranque, no contenido: si se queda, el cliente lo ve en su bucle para
 * siempre y encima obliga a recodificar toda la emisión, porque su firma no
 * coincidirá con la de los videos que suba.
 */
async function retirarDe(dirCuenta) {
  const uploads = path.join(dirCuenta, 'uploads');
  const clip = path.join(uploads, 'bienvenida.mp4');
  try {
    const propios = (await fsp.readdir(uploads))
      .filter((f) => /\.(mp4|mkv|mov|webm|flv)$/i.test(f) && f !== 'bienvenida.mp4');
    if (!propios.length) return false;          // todavía es lo único que tiene
    await fsp.unlink(clip);
    return true;
  } catch (_) { return false; }
}

module.exports = { asegurar, ponerEn, retirarDe, ARCHIVO };
