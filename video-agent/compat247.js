/**
 * compat247.js — emisión 24/7 (AutoDJ) para la capa asilivehd.
 * ------------------------------------------------------------------
 * Reusa el motor de webtv.js (escribirLista/argumentos) pero empuja al app
 * `asilive247` de la capa (puerto 1935, nombre de stream = usuario), que
 * reenvía a `asilivehls` → /live/<user>.m3u8. Así un canal asilivehd puede
 * tener AutoDJ SIN cambiar su URL.
 *
 * El "vivo pisa al 24/7" lo maneja el on_publish de la capa (server.js):
 * pausa aquí cuando el cliente entra en vivo y reanuda al terminar.
 * ------------------------------------------------------------------
 */
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const webtv = require('./webtv');

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const RTMP = process.env.COMPAT_RTMP || 'rtmp://127.0.0.1:1935';
const HOME = process.env.HOME_BASE || '/home';
const REINTENTO_MS = Number(process.env.WEBTV_REINTENTO_MS || 5000);
const ESTADO = path.join(__dirname, 'compat-247.json');
const canales = new Map();   // user -> registro

/** Mata ffmpeg de ejecuciones previas que empujen a asilive247/<user>. */
function matarHuerfanos(user) {
  return new Promise((resolve) => {
    execFile('pgrep', ['-x', 'ffmpeg'], (e, out) => {
      const pids = String(out || '').trim().split(/\s+/).filter(Boolean);
      const mio = canales.get(user)?.proceso?.pid;
      for (const pid of pids) {
        if (Number(pid) === mio) continue;
        let cmd = '';
        try { cmd = fs.readFileSync(`/proc/${pid}/cmdline`).toString().replace(/\0/g, ' '); } catch { continue; }
        if (cmd.includes(`asilive247/${user}`)) { try { process.kill(Number(pid), 'SIGKILL'); } catch (_) {} }
      }
      setTimeout(resolve, 500);
    });
  });
}

/** Enciende el 24/7 de un canal asilivehd (empuja su lista en bucle). */
async function iniciar(user) {
  if (canales.has(user)) return { ya: true, ...estado(user) };
  const dirCuenta = path.join(HOME, user);
  const dirVideos = path.join(dirCuenta, 'uploads');
  const lista = path.join(dirCuenta, 'playlist.txt');
  // transcode: acepta cualquier mezcla de videos (los clientes suben de todo).
  const reg = { desde: new Date(), reinicios: 0, parar: false, modo: 'transcode' };
  canales.set(user, reg);

  let info;
  try { info = await webtv.escribirLista(dirVideos, lista); }
  catch (e) { canales.delete(user); throw e; }
  if (!info.total) { canales.delete(user); return { ok: false, error: 'La cuenta no tiene videos para emitir' }; }
  reg.total = info.total;

  const destino = `${RTMP}/asilive247/${user}`;
  const lanzar = () => {
    const proceso = spawn(FFMPEG, webtv.argumentos(lista, destino, reg.modo));
    reg.proceso = proceso;
    proceso.stderr.on('data', (d) => {
      const t = String(d).trim();
      if (t && !/Non-monotonic DTS|changing to \d+/i.test(t)) console.error(`[compat247:${user}]`, t.slice(0, 180));
    });
    proceso.on('exit', () => { if (reg.parar) return; reg.reinicios++; reg.timer = setTimeout(lanzar, REINTENTO_MS); });
  };
  lanzar();
  persistir();
  return { ok: true, videos: info.total, modo: reg.modo };
}

/** Apaga el 24/7 (lo llama el on_publish cuando el cliente entra en vivo). */
function detener(user) {
  const r = canales.get(user);
  if (!r) return { ok: false };
  r.parar = true; clearTimeout(r.timer);
  try { r.proceso?.kill('SIGTERM'); } catch (_) {}
  canales.delete(user); persistir();
  return { ok: true };
}

/** Reinicia (al subir/borrar un video). */
async function recargar(user) {
  detener(user);
  await matarHuerfanos(user).catch(() => {});
  return iniciar(user);
}

const emitiendo = (user) => canales.has(user);
function estado(user) {
  const r = canales.get(user);
  return r ? { emitiendo: true, videos: r.total || 0, modo: r.modo, desde: r.desde, reinicios: r.reinicios } : { emitiendo: false };
}

function persistir() { try { fs.writeFileSync(ESTADO, JSON.stringify([...canales.keys()])); } catch (_) {} }
async function restaurar() {
  let users = [];
  try { users = JSON.parse(fs.readFileSync(ESTADO, 'utf8')); } catch { return; }
  if (users.length) console.log(`[compat247] restaurando ${users.length}: ${users.join(', ')}`);
  for (const u of users) {
    await matarHuerfanos(u).catch(() => {});
    iniciar(u).catch((e) => console.error(`[compat247] restaurar ${u}:`, e.message));
  }
}

module.exports = { iniciar, detener, recargar, emitiendo, estado, restaurar };
