/**
 * scripts/seed.js — inserta datos demo (idempotente).
 * Uso:  npm run seed
 *
 * Usuarios demo (password: 123456):
 *   admin@panel.com    (admin)
 *   cliente@radio.com  (cliente, con estación de ejemplo)
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, query } = require('../config/database');

async function seed() {
  const hash = bcrypt.hashSync('123456', 10);

  // Admin
  await query(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, 'admin')
     ON CONFLICT (email) DO NOTHING`,
    ['admin@panel.com', hash]
  );

  // Usuario del cliente demo
  await query(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, 'cliente')
     ON CONFLICT (email) DO NOTHING`,
    ['cliente@radio.com', hash]
  );

  // Fila de cliente ligada a ese usuario (solo si aún no existe)
  const { rows: uRows } = await query('SELECT id FROM users WHERE email = $1', ['cliente@radio.com']);
  const userId = uRows[0].id;

  const { rows: cRows } = await query('SELECT id FROM clientes WHERE user_id = $1', [userId]);
  if (cRows.length === 0) {
    const { rows: nuevo } = await query(
      `INSERT INTO clientes (user_id, nombre_empresa, plan, azuracast_station_id, url_streaming, activo)
       VALUES ($1, 'Radio Demo FM', 'basico', 1,
               'https://server1.streaminghd.co/listen/asiserverradio/radio.mp3', true)
       RETURNING id`,
      [userId]
    );
    await query(
      `INSERT INTO suscripciones (cliente_id, plan_tipo, precio_mensual, estado)
       VALUES ($1, 'basico', 9.99, 'activa')`,
      [nuevo[0].id]
    );
  }

  console.log('✅ Seed completado.');
  console.log('   admin@panel.com   / 123456  (admin)');
  console.log('   cliente@radio.com / 123456  (cliente)');
  await pool.end();
}

seed().catch((err) => {
  console.error('❌ Seed falló:', err.message);
  process.exit(1);
});
