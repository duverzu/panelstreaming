/**
 * routes/public.js
 * ------------------------------------------------------------------
 * Endpoints PÚBLICOS (sin autenticación) para el reproductor embebible.
 * Montado en /api/public. Multi-servidor: busca la radio por shortcode
 * y consulta el servidor donde vive.
 * ------------------------------------------------------------------
 */
const express = require('express');
const azuracast = require('../services/azuracast');
const nowplaying = require('../services/nowplaying');
const clienteModel = require('../models/clienteModel');
const docModel = require('../models/docModel');
const publico = require('../services/publico');
const limite = require('../services/limitePublico');

const router = express.Router();

// Todo lo de aquí es sin credenciales: es la única puerta abierta del panel.
router.use(limite.limitar);

// Un nombre de radio real es corto y sin rarezas. Filtrarlo ANTES de tocar
// nada evita que una inundación de nombres inventados se convierta en una
// inundación de consultas a la base y a AzuraCast.
const NOMBRE_VALIDO = /^[A-Za-z0-9_-]{2,60}$/;
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Este endpoint lo llama la WEB DE CADA CLIENTE, no el panel: una radio con
// 500 oyentes y un widget que refresca cada 5 s son 100 consultas por segundo
// contra el mismo AzuraCast que está emitiendo. Con unos segundos de memoria,
// los oyentes ven lo mismo y al servidor le llega UNA.
const CACHE_MS = Number(process.env.NOWPLAYING_CACHE_MS || 4000);
// Con techo: si alguien pide mil radios que no existen, la caché se recicla
// en vez de crecer hasta quedarse sin memoria.
const cache = limite.crearCache(500);

/** Reescribe la carátula para que salga por el dominio del cliente.
 *  Tal como la manda AzuraCast, delata el servidor de administración: quien
 *  mire el código de la web del cliente ve qué usamos y dónde vive. */
function caratulaPropia(art, shortcode, base) {
  const url = String(art || '');
  if (!url || !base) return '';
  // Carátula del disco: /api/station/<radio>/art/<id>
  const m = url.match(/\/api\/station\/[^/]+\/art\/([A-Za-z0-9._-]+)/);
  if (m) return `${base}/api/public/art/${encodeURIComponent(shortcode)}/${m[1]}`;
  // Imagen por defecto de AzuraCast: /static/... (el proxy ya la sirve)
  const est = url.match(/(\/static\/.+)$/);
  if (est) return `${base}${est[1]}`;
  return '';
}

/** GET /api/public/docs?audiencia=audio|video — publicados (sin contenido). */
router.get('/docs', wrap(async (req, res) => {
  const audiencia = req.query.audiencia === 'video' ? 'video' : req.query.audiencia === 'audio' ? 'audio' : null;
  res.json({ docs: await docModel.findPublicadas(audiencia) });
}));

/** GET /api/public/docs/:id — artículo completo (si está publicado). */
router.get('/docs/:id', wrap(async (req, res) => {
  const doc = await docModel.findById(Number(req.params.id));
  if (!doc || !doc.publicado) return res.status(404).json({ error: 'Artículo no encontrado' });
  res.json({ doc: { id: doc.id, titulo: doc.titulo, categoria: doc.categoria, contenido: doc.contenido } });
}));

/**
 * GET /api/public/nowplaying/:shortcode — qué suena ahora, para la web del
 * cliente. Sin credenciales a propósito: lo consulta el navegador de sus
 * oyentes, que no tiene ninguna que dar. Solo devuelve lo que ya está
 * sonando al aire, que es público por definición.
 */
router.get('/nowplaying/:shortcode', wrap(async (req, res) => {
  const shortcode = String(req.params.shortcode || '');
  if (!NOMBRE_VALIDO.test(shortcode)) return res.status(400).json({ error: 'Radio no válida' });
  const enMemoria = cache.get(shortcode);
  if (enMemoria && Date.now() - enMemoria.at < CACHE_MS) {
    res.set('Cache-Control', `public, max-age=${Math.round(CACHE_MS / 1000)}`);
    return res.json(enMemoria.datos);
  }

  let datos;
  try {
    const cliente = await clienteModel.findByShortName(shortcode);
    const az = await azuracast.paraServidorId(cliente?.servidor_id);
    const np = await az.getNowPlaying(shortcode);
    const n = nowplaying.normalizar(np);
    datos = {
      is_online: n.is_online,
      is_live: n.is_live,
      streamer: n.streamer,
      title: n.titulo,
      artist: n.artista,
      art: caratulaPropia(n.art, shortcode, await publico.deCliente(cliente)),
      fuente: n.fuente,
      listeners: n.listeners,
    };
    cache.set(shortcode, { at: Date.now(), datos });
  } catch {
    datos = { is_online: false, is_live: false, title: '', artist: '', art: '' };
    // El fallo se guarda, pero solo un segundo. Sin esto, pedir en bucle una
    // radio que no existe llega ENTERO a la base y a AzuraCast. Con un
    // segundo, un tropiezo real se reintenta enseguida y una inundación no
    // pasa de la primera consulta.
    cache.set(shortcode, { at: Date.now() - CACHE_MS + 1000, datos });
  }
  res.set('Cache-Control', `public, max-age=${Math.round(CACHE_MS / 1000)}`);
  res.json(datos);
}));

/**
 * GET /api/public/art/:shortcode/:id — la carátula, servida por el dominio
 * del cliente en vez del de AzuraCast.
 *
 * El id se valida y la dirección se arma AQUÍ a partir de la radio: si se
 * aceptara una URL completa por parámetro, esto sería un proxy abierto con el
 * que cualquiera podría hacer peticiones desde nuestro servidor.
 */
router.get('/art/:shortcode/:id', wrap(async (req, res) => {
  const shortcode = String(req.params.shortcode || '');
  const id = String(req.params.id || '');
  if (!NOMBRE_VALIDO.test(shortcode) || !/^[A-Za-z0-9._-]{1,80}$/.test(id)) return res.status(400).end();

  const cliente = await clienteModel.findByShortName(shortcode);
  const servidor = cliente?.servidor_id ? await require('../models/servidorModel').findById(cliente.servidor_id) : null;
  const base = String(servidor?.url || process.env.AZURACAST_BASE_URL || '').replace(/\/+$/, '');
  if (!base) return res.status(404).end();

  try {
    const r = await require('axios').get(`${base}/api/station/${encodeURIComponent(shortcode)}/art/${id}`, {
      responseType: 'arraybuffer', timeout: 10000,
      // Una carátula son unos cientos de KB. El tope evita que una respuesta
      // enorme —por error o a propósito— se cargue entera en memoria.
      maxContentLength: 8 * 1024 * 1024, maxBodyLength: 8 * 1024 * 1024,
    });
    res.set('Content-Type', r.headers['content-type'] || 'image/jpeg');
    // La carátula de una canción no cambia nunca: se deja cachear a fondo
    // para no volver a pedirla en cada refresco del widget.
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(r.data));
  } catch { res.status(404).end(); }
}));

module.exports = router;
