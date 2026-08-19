/**
 * crear.js — provisiona una cuenta de video en el motor propio
 * ------------------------------------------------------------------
 * Hace lo que VDO Panel hacía con su PHP: a partir de las plantillas,
 * genera la configuración de nginx de la cuenta, crea sus carpetas y
 * deja el canal listo. Es la fase de ESCRITURA del agente.
 *
 * No arranca ni recarga nginx por su cuenta: devuelve qué cambió y el
 * llamador decide cuándo recargar (para agrupar varios cambios en un
 * solo reload y no parpadear los canales en marcha).
 * ------------------------------------------------------------------
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const bienvenida = require('./bienvenida');
const listas = require('./listas');

const HOME = process.env.HOME_BASE || '/home';
const CONF = process.env.NGINX_CUENTAS_DIR || '/opt/nginx-panel/conf/cuentas';
const PLANTILLAS = path.join(__dirname, 'plantillas');
const PUERTO_AGENTE = Number(process.env.PORT || 3000);
const DOMINIO = process.env.DOMINIO || 'video.streaminghd.co';
const CERT_FULLCHAIN = process.env.CERT_FULLCHAIN || `/etc/letsencrypt/live/${DOMINIO}/fullchain.pem`;
const CERT_KEY = process.env.CERT_KEY || `/etc/letsencrypt/live/${DOMINIO}/privkey.pem`;

// Rangos para puertos de cuentas NUEVAS (los de VDO Panel se respetan al migrar).
const RANGO_HTTP = [3960, 4960];
const RANGO_RTMP = [2960, 3960];

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function rellenar(nombrePlantilla, reemplazos) {
  let txt = await fsp.readFile(path.join(PLANTILLAS, nombrePlantilla), 'utf8');
  for (const [clave, valor] of Object.entries(reemplazos)) {
    txt = txt.replaceAll(`{{${clave}}}`, String(valor));
  }
  return txt;
}

/** Puertos ya usados por CUALQUIER cuenta (las nuestras y las de VDO Panel). */
async function puertosUsados() {
  const http = new Set();
  const rtmp = new Set();
  const dirs = [CONF, '/etc/nginx/conf.d'];
  for (const dir of dirs) {
    let archivos = [];
    try { archivos = await fsp.readdir(dir); } catch { continue; }
    for (const f of archivos) {
      let txt = '';
      try { txt = await fsp.readFile(path.join(dir, f), 'utf8'); } catch { continue; }
      for (const m of txt.matchAll(/listen\s+(\d+)/g)) {
        const p = Number(m[1]);
        if (/\.rtmp$/.test(f) || /rtmp\s*\{/.test(txt.slice(0, m.index))) rtmp.add(p);
        else http.add(p);
      }
    }
  }
  return { http, rtmp };
}

/** Primer puerto libre de un rango que no choque con nada. */
function libre([desde, hasta], usados, tambien) {
  for (let p = desde; p <= hasta; p++) {
    if (!usados.has(p) && !tambien.has(p)) return p;
  }
  throw new Error(`No hay puertos libres en el rango ${desde}-${hasta}`);
}

/**
 * Crea (o rehace) la configuración de una cuenta.
 * @param user        identificador (== short_name del panel)
 * @param puertos     { http, rtmp } para migrar con los mismos de VDO Panel;
 *                    si se omite, se asignan del rango de cuentas nuevas.
 */
async function crearCuenta(user, { puertos } = {}) {
  const u = slug(user);
  if (u.length < 3) throw new Error('El usuario debe tener al menos 3 caracteres alfanuméricos');

  // Puertos: los pedidos (migración) o los primeros libres (cuenta nueva)
  let { http, rtmp } = puertos || {};
  if (!http || !rtmp) {
    const usados = await puertosUsados();
    http = http || libre(RANGO_HTTP, usados.http, usados.rtmp);
    rtmp = rtmp || libre(RANGO_RTMP, usados.rtmp, usados.http);
  }

  // Carpetas de la cuenta (no se pisan las de VDO Panel si ya existen)
  const dir = path.join(HOME, u);
  for (const sub of ['uploads', 'logs', 'live-streaming/hls', 'stream/hls', 'stream-hybrid/hls']) {
    await fsp.mkdir(path.join(dir, sub), { recursive: true });
  }

  // Los segmentos HLS los escribe el WORKER de nginx, que no corre como root
  // (`nobody`), mientras que estas carpetas las acaba de crear el agente, que
  // sí. Sin este permiso nginx acepta la señal y no da ningún error, pero no
  // escribe ni un segmento: el canal queda mudo sin que nada lo delate.
  for (const sub of ['live-streaming/hls', 'stream/hls', 'stream-hybrid/hls']) {
    await fsp.chmod(path.join(dir, sub), 0o777);
  }

  // Un canal sin videos NO puede arrancar el 24/7: la lista sale vacía y no hay
  // nada que emitir. El cliente le da a «Iniciar» y no pasa nada, sin ningún
  // mensaje que lo explique. Se le deja un clip de bienvenida para que su canal
  // funcione desde el primer minuto; en cuanto suba lo suyo, deja de usarse.
  const puesto = await bienvenida.ponerEn(dir).catch((e) => {
    console.error('[crear] bienvenida:', e.message);
    return false;
  });

  // Y su primera lista de emisión. Sin ninguna lista, el panel del cliente no
  // tiene dónde pulsar «Poner al aire»: esa acción vive DENTRO de una lista.
  // El canal podía emitir, pero el cliente no tenía forma de arrancarlo.
  try {
    const datos = await listas.leer(dir);
    if (!Object.keys(datos.listas || {}).length) {
      const l = await listas.crear(dir, 'Programación principal');
      if (puesto) await listas.fijarVideos(dir, l.id, ['bienvenida.mp4']);
      await listas.marcarActiva(dir, l.id);
    }
  } catch (e) { console.error('[crear] lista por defecto:', e.message); }

  const reemplazos = {
    USER: u, HOME, DOMINIO,
    PUERTO_HTTP: http, PUERTO_RTMP: rtmp, PUERTO_AGENTE,
    CERT_FULLCHAIN, CERT_KEY,
  };

  // Escritura atómica de los dos archivos de configuración
  for (const [plantilla, destino] of [['cuenta.rtmp', `${u}.rtmp`], ['cuenta.http', `${u}.http`]]) {
    const contenido = await rellenar(plantilla, reemplazos);
    const ruta = path.join(CONF, destino);
    const tmp = `${ruta}.tmp`;
    await fsp.writeFile(tmp, contenido);
    await fsp.rename(tmp, ruta);
  }

  return { user: u, puertos: { http, rtmp }, dir };
}

/**
 * Renombra una cuenta conservando TODO lo suyo: sus videos, sus listas y —lo
 * más importante— sus PUERTOS. Si cambiaran, al cliente le cambiaría también
 * la dirección de su canal y la de su OBS, y habría que avisarle: justo lo que
 * se quiere evitar cuando lo que está mal es solo el nombre.
 *
 * Las aplicaciones RTMP de nginx llevan el nombre dentro (`<user>live`,
 * `<user>stream`…), así que la configuración no se puede renombrar: se vuelve
 * a generar desde la plantilla con el nombre nuevo y los mismos puertos.
 *
 * NO recarga nginx ni reanuda la emisión: eso lo decide quien llama, que sabe
 * si el canal estaba al aire.
 */
async function renombrarCuenta(actual, nuevo) {
  const viejo = slug(actual);
  const nueva = slug(nuevo);
  if (nueva.length < 3) throw new Error('El nombre nuevo debe tener al menos 3 caracteres alfanuméricos');
  if (viejo === nueva) return { user: nueva, sin_cambios: true };

  const dirViejo = path.join(HOME, viejo);
  const dirNuevo = path.join(HOME, nueva);
  try { await fsp.access(dirViejo); } catch { throw new Error(`La cuenta ${viejo} no existe en este nodo`); }
  try { await fsp.access(dirNuevo); throw new Error(`Ya hay una cuenta llamada ${nueva}`); } catch (e) {
    if (String(e.message).startsWith('Ya hay')) throw e;   // existe de verdad
  }

  // Sus puertos actuales, para conservarlos.
  let http = null, rtmp = null;
  try {
    const conf = await fsp.readFile(path.join(CONF, `${viejo}.http`), 'utf8');
    http = Number((conf.match(/listen\s+(\d+)/) || [])[1]) || null;
  } catch (_) {}
  try {
    const conf = await fsp.readFile(path.join(CONF, `${viejo}.rtmp`), 'utf8');
    rtmp = Number((conf.match(/listen\s+(\d+)/) || [])[1]) || null;
  } catch (_) {}

  await fsp.rename(dirViejo, dirNuevo);
  await eliminarConfig(viejo);
  const info = await crearCuenta(nueva, { puertos: http && rtmp ? { http, rtmp } : undefined });

  return { user: nueva, anterior: viejo, puertos: info.puertos, conservo_puertos: Boolean(http && rtmp) };
}

/** Elimina la configuración de una cuenta (no borra sus videos). */
async function eliminarConfig(user) {
  const u = slug(user);
  for (const f of [`${u}.rtmp`, `${u}.http`]) {
    try { await fsp.unlink(path.join(CONF, f)); } catch (_) {}
  }
  return { user: u };
}

module.exports = { crearCuenta, renombrarCuenta, eliminarConfig, puertosUsados, slug };
