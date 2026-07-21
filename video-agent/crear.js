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

/** Elimina la configuración de una cuenta (no borra sus videos). */
async function eliminarConfig(user) {
  const u = slug(user);
  for (const f of [`${u}.rtmp`, `${u}.http`]) {
    try { await fsp.unlink(path.join(CONF, f)); } catch (_) {}
  }
  return { user: u };
}

module.exports = { crearCuenta, eliminarConfig, puertosUsados, slug };
