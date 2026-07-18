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
const clienteRoutes = require('./routes/cliente');

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

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/cliente', clienteRoutes);

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

// ---- Arranque -----------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n🎙️  Panel Radio Backend en http://localhost:${PORT}`);
  console.log(`   • Frontend      -> /`);
  console.log(`   • API Admin     -> /api/admin`);
  console.log(`   • API Cliente   -> /api/cliente\n`);
});

module.exports = app;
