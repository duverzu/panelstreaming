/**
 * config/database.js
 * ------------------------------------------------------------------
 * Por ahora la "base de datos" es un mock en memoria (arrays).
 * Cuando conectemos PostgreSQL real, solo hay que reemplazar la
 * implementación de estas funciones sin tocar las rutas/servicios.
 *
 * Estructura de tablas (según diseño):
 *   users        -> { id, email, password_hash, role, created_at }
 *   clientes     -> { id, user_id, nombre_empresa, plan,
 *                     azuracast_station_id, url_streaming, created_at, activo }
 *   suscripciones-> { id, cliente_id, plan_tipo, precio_mensual, ... }
 *   media        -> { id, cliente_id, azuracast_media_id, titulo, ... }
 * ------------------------------------------------------------------
 */

const bcrypt = require('bcryptjs');

// ---- Datos "semilla" para poder probar de inmediato --------------
// Password de ambos usuarios de prueba: "123456"
const passwordDemo = bcrypt.hashSync('123456', 10);

const db = {
  users: [
    {
      id: 1,
      email: 'admin@panel.com',
      password_hash: passwordDemo,
      role: 'admin',
      created_at: new Date().toISOString(),
    },
    {
      id: 2,
      email: 'cliente@radio.com',
      password_hash: passwordDemo,
      role: 'cliente',
      created_at: new Date().toISOString(),
    },
  ],

  clientes: [
    {
      id: 1,
      user_id: 2,
      nombre_empresa: 'Radio Demo FM',
      plan: 'basico',
      azuracast_station_id: 1,
      url_streaming: 'https://server1.streaminghd.co/radio/8000/radio.mp3',
      created_at: new Date().toISOString(),
      activo: true,
    },
  ],

  suscripciones: [
    {
      id: 1,
      cliente_id: 1,
      plan_tipo: 'basico',
      precio_mensual: 9.99,
      fecha_inicio: new Date().toISOString(),
      fecha_proxima_renovacion: null,
      estado: 'activa',
    },
  ],

  media: [],
};

// ---- Contadores de IDs auto-incrementales ------------------------
const counters = {
  users: db.users.length,
  clientes: db.clientes.length,
  suscripciones: db.suscripciones.length,
  media: db.media.length,
};

/** Devuelve el próximo ID para una tabla y lo incrementa. */
function nextId(tabla) {
  counters[tabla] = (counters[tabla] || 0) + 1;
  return counters[tabla];
}

module.exports = { db, nextId, bcrypt };
