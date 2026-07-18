/**
 * server.js
 * ------------------------------------------------------------------
 * Punto de entrada del backend Express.
 * Monta los dos paneles:  /admin  y  /cliente
 * ------------------------------------------------------------------
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');

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
      // Permite herramientas sin origin (curl, Postman) y los orígenes de la lista.
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

// ---- Healthcheck --------------------------------------------------
app.get('/', (req, res) => {
  res.json({
    name: 'Panel Radio Backend',
    status: 'ok',
    paneles: { admin: '/admin', cliente: '/cliente' },
  });
});

// ---- Rutas --------------------------------------------------------
app.use('/admin', adminRoutes);
app.use('/cliente', clienteRoutes);

// ---- 404 ----------------------------------------------------------
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
  console.log(`\n🎙️  Panel Radio Backend corriendo en http://localhost:${PORT}`);
  console.log(`   • Panel Admin   -> http://localhost:${PORT}/admin`);
  console.log(`   • Panel Cliente -> http://localhost:${PORT}/cliente\n`);
  console.log('   Usuarios demo (password: 123456):');
  console.log('   • admin@panel.com   (admin)');
  console.log('   • cliente@radio.com (cliente)\n');
});

module.exports = app;
