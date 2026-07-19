/**
 * routes/public.js
 * ------------------------------------------------------------------
 * Endpoints PÚBLICOS (sin autenticación) para el reproductor embebible.
 * Montado en /api/public.
 * ------------------------------------------------------------------
 */
const express = require('express');
const azuracast = require('../services/azuracast');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** GET /api/public/nowplaying/:shortcode — metadata en vivo para el widget. */
router.get('/nowplaying/:shortcode', wrap(async (req, res) => {
  try {
    const np = await azuracast.getNowPlaying(req.params.shortcode);
    const song = np?.now_playing?.song || {};
    res.json({
      is_online: !!np?.is_online,
      is_live: !!np?.live?.is_live,
      streamer: np?.live?.streamer_name || '',
      title: song.title || '',
      artist: song.artist || '',
      art: song.art || '',
      listeners: np?.listeners?.current ?? 0,
    });
  } catch {
    res.json({ is_online: false, is_live: false, title: '', artist: '', art: '' });
  }
}));

module.exports = router;
