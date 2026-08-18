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

// El panel vive detrás de un proxy (Caddy). Sin esto, TODAS las peticiones se
// ven como 127.0.0.1 y cualquier límite por IP castigaría a todo el mundo a la
// vez por culpa de uno solo.
app.set('trust proxy', 1);

// Los endpoints públicos los llama la WEB DE CADA CLIENTE, desde su propio
// dominio: la lista de orígenes permitidos los bloqueaba con un error. Se
// abren solo ellos, y sin credenciales — son de lectura y no llevan sesión.
// El resto de la API sigue con la lista cerrada, que es donde importa.
app.use('/api/public', cors({ origin: '*', credentials: false }));

const corsEstricto = cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error(`Origen no permitido por CORS: ${origin}`));
  },
  credentials: true,
});

// Montar el permisivo antes NO basta: este seguiría ejecutándose después sobre
// la misma petición y la rechazaría igual. Hay que saltárselo a mano.
app.use((req, res, next) => {
  if (req.path.startsWith('/api/public')) return next();
  return corsEstricto(req, res, next);
});

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
  console.error('[ERROR]', err.message);           // completo en el log del servidor
  const status = err.status || 500;

  // Marca blanca: al cliente y al revendedor nunca les llega el detalle
  // tecnico ni el nombre del motor de streaming. El admin sí lo ve, porque
  // lo necesita para diagnosticar.
  const interno = /^\/api\/(cliente|reseller|public)/.test(req.path);
  const tecnico = /\[AzuraCast\]|azuracast/i.test(err.message || '');
  const mensaje = interno && tecnico
    ? 'No se pudo completar la operación en tu radio. Intenta de nuevo en unos minutos.'
    : (err.message || 'Error interno del servidor');

  res.status(status).json({ error: mensaje });
});

// ---- Guardián de banda (muestreo periódico) ----------------------
try {
  require('./services/guardian').iniciar();
} catch (e) {
  console.error('[guardian] no se pudo iniciar:', e.message);
}

// ---- "Da la hora" (anuncio de hora programado) -------------------
// Solo deja el audio de cada franja listo con antelación; quien lo pone al
// aire, puntual, es la programación nativa de AzuraCast (once_per_hour).
try {
  require('./services/anuncioHora').iniciar();
} catch (e) {
  console.error('[anuncio-hora] no se pudo iniciar:', e.message);
}

// Las cuñas NO tienen planificador: cada una es una playlist de AzuraCast con
// sus schedule_items, que se sincroniza al guardarla. Ver services/cunas.js.

// ---- Monitor de alertas (Telegram) -------------------------------
try {
  require('./services/monitor').iniciar();
} catch (e) {
  console.error('[monitor] no se pudo iniciar:', e.message);
}

// ---- Arranque -----------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n🎙️  Panel Radio Backend en http://localhost:${PORT}`);
  console.log(`   • Frontend      -> /`);
  console.log(`   • API Admin     -> /api/admin`);
  console.log(`   • API Cliente   -> /api/cliente\n`);
});

module.exports = app;
