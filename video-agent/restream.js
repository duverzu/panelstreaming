/**
 * restream.js — reenvía el canal del cliente a Facebook Live (como hacía VDO)
 * ------------------------------------------------------------------
 * Toma la salida pública del canal (rtmp://127.0.0.1:<puerto>/<user>hybrid/play)
 * y la empuja a Facebook por RTMPS con la clave del cliente. Facebook exige
 * RTMPS + H.264/AAC + keyframe de 2s, así que se transcodifica al vuelo con
 * esos parámetros (≈medio núcleo por restream, igual que VDO).
 *
 * La config vive en el nodo (restream.json, modo 600): por cuenta guarda la
 * clave de Facebook y si está activo. Sobrevive reinicios (restaurar()).
 * ------------------------------------------------------------------
 */
const { spawn } = require('child_process');
const path = require('path');
const fsp = require('fs/promises');

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const REINTENTO_MS = Number(process.env.RESTREAM_REINTENTO_MS || 8000);
// Ingesta RTMPS de Facebook Live (termina en /rtmp/, se le pega la clave)
const FB_BASE = process.env.FACEBOOK_RTMP || 'rtmps://live-api-s.facebook.com:443/rtmp/';
const V_KBPS = process.env.RESTREAM_KBPS || '2500';

const CONFIG = process.env.RESTREAM_CONFIG || path.join(__dirname, 'restream.json');
const procesos = new Map();   // user -> { proceso, parar, timer, reinicios }

// ---- Config persistida (clave + activo por cuenta) ----------------
async function leerConfig() {
  try { return JSON.parse(await fsp.readFile(CONFIG, 'utf8')); } catch { return {}; }
}
async function guardarConfig(datos) {
  const tmp = CONFIG + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(datos, null, 2), { mode: 0o600 });
  await fsp.rename(tmp, CONFIG);
}

function argumentos(origen, destino) {
  return [
    '-hide_banner', '-loglevel', 'warning',
    '-i', origen,
    // Video H.264 compatible con Facebook (keyframe cada 2s = 60 a 30fps)
    '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', `${V_KBPS}k`,
    '-maxrate', `${V_KBPS}k`, '-bufsize', `${Number(V_KBPS) * 2}k`,
    '-g', '60', '-keyint_min', '60', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-ar', '44100', '-b:a', '128k',
    '-f', 'flv', destino,
  ];
}

/** Arranca el ffmpeg que empuja a Facebook (con reintento si se cae). */
function _lanzar(user, origen, destino) {
  const registro = { parar: false, reinicios: 0 };
  const correr = () => {
    const proceso = spawn(FFMPEG, argumentos(origen, destino));
    registro.proceso = proceso;
    proceso.stderr.on('data', (d) => { const t = String(d).trim(); if (t) console.error(`[restream:${user}]`, t.slice(0, 200)); });
    proceso.on('exit', (c) => {
      if (registro.parar) return;
      registro.reinicios++;
      console.error(`[restream:${user}] ffmpeg terminó (${c}); reintentando en ${REINTENTO_MS / 1000}s`);
      registro.timer = setTimeout(correr, REINTENTO_MS);
    });
  };
  correr();
  procesos.set(user, registro);
}

function _detenerProceso(user) {
  const r = procesos.get(user);
  if (!r) return;
  r.parar = true;
  clearTimeout(r.timer);
  try { r.proceso?.kill('SIGTERM'); } catch (_) {}
  procesos.delete(user);
}

/**
 * Configura y aplica el restream de una cuenta.
 * @param opts { facebook_key?, activo, puertoRtmp, host? }
 */
async function configurar(user, { facebook_key, activo, puertoRtmp, host = '127.0.0.1' }) {
  const datos = await leerConfig();
  const prev = datos[user] || {};
  const clave = facebook_key !== undefined ? String(facebook_key || '').trim() : prev.facebook_key || '';
  datos[user] = { facebook_key: clave, activo: Boolean(activo) };
  await guardarConfig(datos);

  _detenerProceso(user);                          // reinicia si ya estaba
  if (datos[user].activo && clave && puertoRtmp) {
    const origen = `rtmp://${host}:${puertoRtmp}/${user}hybrid/play`;
    const destino = FB_BASE.replace(/\/$/, '') + '/' + clave;
    _lanzar(user, origen, destino);
  }
  return estado(user, datos[user]);
}

function estado(user, cfg) {
  const c = cfg || null;
  return {
    activo: procesos.has(user),
    configurado_activo: c ? Boolean(c.activo) : undefined,
    tiene_clave: c ? Boolean(c.facebook_key) : undefined,
  };
}

/** Estado + config (sin exponer la clave completa) para el panel. */
async function ver(user) {
  const datos = await leerConfig();
  const c = datos[user] || {};
  return {
    activo: procesos.has(user),
    encendido: Boolean(c.activo),
    tiene_clave: Boolean(c.facebook_key),
    clave_pista: c.facebook_key ? c.facebook_key.slice(0, 4) + '…' : null,
  };
}

/** Reenciende los restream que estaban activos (tras un reinicio del agente). */
async function restaurar(puertoDe) {
  const datos = await leerConfig();
  for (const [user, c] of Object.entries(datos)) {
    if (!c.activo || !c.facebook_key) continue;
    const puertoRtmp = await puertoDe(user).catch(() => null);
    if (!puertoRtmp) continue;
    const origen = `rtmp://127.0.0.1:${puertoRtmp}/${user}hybrid/play`;
    const destino = FB_BASE.replace(/\/$/, '') + '/' + c.facebook_key;
    _lanzar(user, origen, destino);
    console.log(`[restream] ${user}: reanudado a Facebook`);
  }
}

module.exports = { configurar, ver, estado, restaurar };
