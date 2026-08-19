/**
 * services/playerExterno.js
 * ------------------------------------------------------------------
 * Consulta la plataforma de players (streaminghd.co) para mostrarle al
 * cliente, dentro de su panel, EL MISMO player que ya tiene configurado
 * allá (colores, logo, redes). Así no hay dos players distintos.
 *
 * El token vive solo aquí (backend). El navegador del cliente nunca lo ve:
 * le pide al panel y el panel le pide a la plataforma.
 *
 * La API no tiene endpoint por cliente, devuelve la lista completa (~465),
 * así que se cachea unos minutos en memoria.
 * ------------------------------------------------------------------
 */
const axios = require('axios');

const API_URL = process.env.PLAYER_API_URL || '';
const API_TOKEN = process.env.PLAYER_API_TOKEN || '';
const WEB_BASE = (process.env.PLAYER_WEB_URL || '').replace(/\/+$/, '');
// Dónde edita el cliente su player. Si no se define, se usa la del player.
const EDIT_BASE = (process.env.PLAYER_EDIT_URL || '').replace(/\/+$/, '');
const TTL_MS = Number(process.env.PLAYER_CACHE_MS || 5 * 60 * 1000);
// Acceso directo: la plataforma emite un enlace temporal (~10 min) para un `user`.
// Si no se define, se deduce del mismo host de la API.
const MAGIC_URL = process.env.PLAYER_MAGIC_URL
  || (API_URL ? API_URL.replace(/\/clientes\/?$/, '') + '/magic-link' : '');

let cache = { at: 0, porUser: null };

const activo = () => Boolean(API_URL && API_TOKEN);

/** Trae la lista (cacheada) indexada por `user`. */
async function cargar() {
  if (cache.porUser && Date.now() - cache.at < TTL_MS) return cache.porUser;

  const { data } = await axios.get(API_URL, {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
    timeout: 10000,
  });
  const lista = Array.isArray(data) ? data : data?.data || [];
  const porUser = {};
  lista.forEach((c) => { if (c?.user) porUser[String(c.user).toLowerCase()] = c; });

  cache = { at: Date.now(), porUser };
  return porUser;
}

/**
 * Player configurado para una radio, o null si no está en la plataforma
 * (o si la integración no está configurada / la API falla).
 */
async function buscar(user) {
  if (!activo() || !user) return null;
  try {
    const porUser = await cargar();
    const c = porUser[String(user).toLowerCase()];
    if (!c) return null;

    const url = WEB_BASE ? `${WEB_BASE}/${c.user}` : null;
    return {
      encontrado: true,
      nombre: c.nombre,
      user: c.user,
      url,
      url_editar: EDIT_BASE || url,
      // Código listo para pegar en la web del cliente
      embed: url ? `<iframe src="${url}" width="100%" height="480" frameborder="0" allow="autoplay" style="border:0"></iframe>` : null,
      estado: c.estado,
      estilo: c.player_style,
      logo: c.logo || null,
      stream: c.stream || null,
      colores: {
        primario: c.color_primario, secundario: c.color_secundario,
        texto: c.color_texto, iconos: c.color_iconos,
        en_vivo: c.color_en_vivo, fondo: c.color_fondo,
      },
      redes: {
        facebook: c.facebook, instagram: c.instagram, twitter: c.twitter,
        whatsapp: c.whatsapp, tiktok: c.tiktok, website: c.website,
        android: c.androidapp, ios: c.iosapp,
      },
      ubicacion: [c.ciudad, c.departamento, c.pais].filter(Boolean).join(', ') || null,
    };
  } catch (e) {
    console.error('[playerExterno]', e.message);
    return null; // nunca romper el panel por una integración externa
  }
}

/**
 * Pide a la plataforma un enlace de acceso directo para ese `user`.
 * Se genera SIEMPRE en el backend: el token nunca llega al navegador y el
 * enlace es de un solo uso y corta duración, así que no se cachea.
 * Devuelve la URL o null si la plataforma no lo permite.
 */
async function magicLink(user) {
  if (!activo() || !MAGIC_URL || !user) return null;
  try {
    const { data } = await axios.post(
      MAGIC_URL,
      { user },
      { headers: { Authorization: `Bearer ${API_TOKEN}` }, timeout: 10000 }
    );
    // La plataforma puede llamar al campo de varias formas: se aceptan todas.
    const url = data?.url || data?.magic_link || data?.link || data?.magicLink
      || data?.data?.url || data?.data?.magic_link || data?.data?.link;
    return typeof url === 'string' && /^https?:\/\//.test(url) ? url : null;
  } catch (e) {
    console.error('[playerExterno] magic-link:', e.response?.status || '', e.message);
    return null;
  }
}

/** Fuerza recarga (tras crear una radio nueva, para que aparezca al toque). */
function limpiarCache() { cache = { at: 0, porUser: null }; }

/**
 * Crea el player del cliente en la plataforma.
 *
 * OJO con el `user` que devuelve: si el nombre ya estaba tomado, la plataforma
 * asigna `nombre_2`, `nombre_3`… El que vale es el de la RESPUESTA, no el que
 * mandamos — y es el que hay que guardar, porque es con el que se borra
 * después. Dar por hecho que coinciden significa borrar el player de otro.
 */
async function crear({ user, nombre, tipo = 'tvstreaming', url_video = null, stream = null }) {
  if (!activo() || !user) return null;
  try {
    const { data } = await axios.post(API_URL, { user, nombre, tipo, url_video, stream }, {
      headers: { Authorization: `Bearer ${API_TOKEN}` }, timeout: 15000,
    });
    limpiarCache();
    return { user: data?.user || user, id: data?.id ?? null, url: data?.player_url || null };
  } catch (e) {
    console.error('[player] no se pudo crear el de', user + ':', e.response?.status || '', e.message);
    return null;
  }
}

/**
 * Borra el player. Un 404 se cuenta como ÉXITO: ya no está, que es lo que se
 * quería. Tratarlo como fallo dejaría un servicio sin dar de baja por algo que
 * en realidad ya estaba resuelto.
 */
async function borrar(user) {
  if (!activo() || !user) return { ok: false, motivo: 'sin datos' };
  try {
    await axios.delete(`${API_URL}/${encodeURIComponent(user)}`, {
      headers: { Authorization: `Bearer ${API_TOKEN}` }, timeout: 15000,
    });
    limpiarCache();
    return { ok: true };
  } catch (e) {
    if (e.response?.status === 404) { limpiarCache(); return { ok: true, ya_no_estaba: true }; }
    console.error('[player] no se pudo borrar el de', user + ':', e.response?.status || '', e.message);
    return { ok: false, motivo: e.response?.status || e.message };
  }
}

/** Le cambia el nombre (y lo que se le pase) a un player ya creado. */
async function actualizar(user, cambios) {
  if (!activo() || !user) return null;
  try {
    const { data } = await axios.patch(`${API_URL}/${encodeURIComponent(user)}`, cambios, {
      headers: { Authorization: `Bearer ${API_TOKEN}` }, timeout: 15000,
    });
    limpiarCache();
    // La plataforma responde `ok:true` aunque NO haya aplicado el cambio de
    // nombre: devuelve el que ya tenía. Hay que comparar, no fiarse del ok —
    // si no, el panel canta un cambio que no ocurrió.
    const quedo = data?.user || user;
    const pedido = cambios.user;
    return { user: quedo, ok: true, renombrado: !pedido || quedo === pedido };
  } catch (e) {
    console.error('[player] no se pudo actualizar', user + ':', e.response?.status || '', e.message);
    return null;
  }
}

module.exports = { buscar, crear, actualizar, borrar, magicLink, limpiarCache, activo };
