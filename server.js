/**
 * server.js
 * ------------------------------------------------------------------
 * Punto de entrada del backend Express.
 *   • API:      /api/admin/*   y   /api/cliente/*
 *   • Frontend: archivos estáticos en /public (panel visual)
 * ------------------------------------------------------------------
 */

require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const resellerRoutes = require('./routes/reseller');
const clienteRoutes = require('./routes/cliente');
const provisionRoutes = require('./routes/provision');
const publicRoutes = require('./routes/public');
const embedPage = require('./services/embedPage');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Middlewares globales ----------------------------------------
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      return cb(new Error(`Origen no permitido por CORS: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- API ----------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ name: 'Panel Radio Backend', status: 'ok' });
});

app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reseller', resellerRoutes);
app.use('/api/cliente', clienteRoutes);
app.use('/api/provision', provisionRoutes);

// ---- Reproductor embebible (iframe) — antes del fallback SPA ------
const clienteModel = require('./models/clienteModel');
const publico = require('./services/publico');
app.get('/embed/:shortcode', async (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('X-Frame-Options', 'ALLOWALL'); // permite embeber en cualquier sitio
  // El reproductor embebido va en sitios de terceros: siempre la URL pública
  let baseURL = process.env.AZURACAST_PUBLIC_URL || process.env.AZURACAST_BASE_URL;
  try {
    const cliente = await clienteModel.findByShortName(req.params.shortcode);
    baseURL = await publico.deCliente(cliente);
  } catch (_) {}
  res.send(embedPage(req.params.shortcode, baseURL));
});

// ---- Frontend React compilado (frontend/dist) ---------------------
const FRONTEND_DIR = path.join(__dirname, 'frontend', 'dist');
app.use(express.static(FRONTEND_DIR));

// SPA fallback: cualquier GET que NO sea /api devuelve index.html
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  }
  next();
});

// ---- 404 (solo llega aquí lo que empieza por /api y no existe) ----
app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
});

// ---- Manejador de errores global ---------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Error interno del servidor' });
});

// ---- Guardián de banda (muestreo periódico) ----------------------
try {
  require('./services/guardian').iniciar();
} catch (e) {
  console.error('[guardian] no se pudo iniciar:', e.message);
}

// ---- Arranque -----------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n🎙️  Panel Radio Backend en http://localhost:${PORT}`);
  console.log(`   • Frontend      -> /`);
  console.log(`   • API Admin     -> /api/admin`);
  console.log(`   • API Cliente   -> /api/cliente\n`);
});

module.exports = app;
