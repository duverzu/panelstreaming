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

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

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

/** GET /api/public/nowplaying/:shortcode — metadata en vivo para el widget. */
router.get('/nowplaying/:shortcode', wrap(async (req, res) => {
  try {
    const cliente = await clienteModel.findByShortName(req.params.shortcode);
    const az = await azuracast.paraServidorId(cliente?.servidor_id);
    const np = await az.getNowPlaying(req.params.shortcode);
    const n = nowplaying.normalizar(np);
    res.json({
      is_online: n.is_online,
      is_live: n.is_live,
      streamer: n.streamer,
      title: n.titulo,
      artist: n.artista,
      art: n.art,
      fuente: n.fuente,
      listeners: n.listeners,
    });
  } catch {
    res.json({ is_online: false, is_live: false, title: '', artist: '', art: '' });
  }
}));

module.exports = router;
