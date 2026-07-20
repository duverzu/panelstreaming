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

  // --- Servidor AzuraCast principal (del .env) si no hay ninguno ---
  const { rows: srv } = await query('SELECT id FROM servidores LIMIT 1');
  if (srv.length === 0 && process.env.AZURACAST_BASE_URL) {
    await query(
      `INSERT INTO servidores (nombre, url, api_key, capacidad_radios) VALUES ('Principal', $1, $2, 100)`,
      [process.env.AZURACAST_BASE_URL, process.env.AZURACAST_API_KEY || '']
    );
  }

  // --- Planes por defecto (idempotente por nombre) ---
  const planes = [
    { nombre: 'Básico',       precio: 9.99,  bitrate: 128, oyentes: 100,  mb: 1024,  mounts: 1, dj: false },
    { nombre: 'Profesional',  precio: 19.99, bitrate: 192, oyentes: 500,  mb: 5120,  mounts: 2, dj: true },
    { nombre: 'Premium',      precio: 39.99, bitrate: 320, oyentes: 2000, mb: 20480, mounts: 3, dj: true },
  ];
  for (const p of planes) {
    const { rows } = await query('SELECT id FROM planes WHERE nombre = $1', [p.nombre]);
    if (rows.length === 0) {
      await query(
        `INSERT INTO planes (nombre, precio_mensual, max_bitrate, max_oyentes, espacio_mb, max_mounts, permite_dj)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [p.nombre, p.precio, p.bitrate, p.oyentes, p.mb, p.mounts, p.dj]
      );
    }
  }

  // Admin (el login es por USUARIO; se deja "admin@panel.com" como usuario
  // para no romper el acceso de las instalaciones que ya existían)
  await query(
    `INSERT INTO users (username, email, password_hash, role)
     VALUES ($1, $1, $2, 'admin')
     ON CONFLICT (username) DO NOTHING`,
    ['admin@panel.com', hash]
  );

  // Usuario del cliente demo
  await query(
    `INSERT INTO users (username, email, password_hash, role)
     VALUES ($1, $1, $2, 'cliente')
     ON CONFLICT (username) DO NOTHING`,
    ['cliente@radio.com', hash]
  );

  // Fila de cliente ligada a ese usuario (solo si aún no existe)
  const { rows: uRows } = await query('SELECT id FROM users WHERE username = $1', ['cliente@radio.com']);
  const userId = uRows[0].id;

  const { rows: cRows } = await query('SELECT id FROM clientes WHERE user_id = $1', [userId]);
  if (cRows.length === 0) {
    // Cliente demo SIN estación real (para probar login del panel cliente sin tocar AzuraCast)
    await query(
      `INSERT INTO clientes (user_id, nombre_empresa, plan, azuracast_station_id, url_streaming, activo)
       VALUES ($1, 'Radio Demo FM', 'basico', NULL, NULL, true)`,
      [userId]
    );
  }

  // Corrección: el demo NO debe apuntar a una estación real (evita borrarla al eliminar el cliente)
  await query(
    `UPDATE clientes SET azuracast_station_id = NULL, url_streaming = NULL
     WHERE user_id = $1 AND azuracast_station_id = 1`,
    [userId]
  );

  // --- Documentación por defecto (si no hay artículos) ---
  const { rows: dcount } = await query('SELECT COUNT(*)::int AS n FROM documentacion');
  if (dcount[0].n === 0) {
    const docs = [
      { titulo: 'Bienvenido a tu panel de radio', categoria: 'Primeros pasos', orden: 1, contenido:
`# 👋 Bienvenido

Este panel controla **tu radio online**. Desde aquí puedes subir música, armar tu programación, transmitir en vivo y ver tus oyentes.

## Menú de tu panel
- **Dashboard**: resumen de oyentes y lo que suena.
- **AutoDJ**: cómo se mezcla la música automáticamente.
- **Música**: sube tus canciones (MP3).
- **Playlists**: agrupa música, jingles y programas por horario.
- **Reproductor**: código para poner tu radio en tu web.
- **Redes Sociales**: publica automáticamente lo que suena.
- **Estadísticas**: oyentes en vivo, audiencia y mapa.
- **Conectar**: los datos para transmitir en vivo desde tu PC.
- **Configuración**: nombre, descripción, zona horaria y tu contraseña.

> Consejo: primero **sube música** y **crea una playlist**, así tu radio suena sola 24/7 aunque no estés en vivo.` },

      { titulo: 'Cómo conectar tu radio en vivo (DJ)', categoria: 'Transmitir', orden: 1, contenido:
`# 🎤 Transmitir en vivo desde tu PC

Cuando conectas en vivo, tu voz/música **reemplaza al AutoDJ**; al desconectarte, el AutoDJ vuelve solo.

## 1) Consigue tus datos
Ve a **Conectar** en el menú. Ahí verás: **Servidor, Puerto, Punto de montaje, Usuario y Contraseña**.

## 2) Descarga un programa de transmisión
- **BUTT** (gratis, fácil): https://danielnoethen.de/butt/
- O **Mixxx**, **RadioDJ**, **OBS**.

## 3) Configura BUTT
1. Abre BUTT → **Settings → Main → Add server**.
2. Tipo: **Icecast**.
3. Pega **Servidor**, **Puerto**, **Usuario** y **Contraseña** de la página Conectar.
4. **Mountpoint**: escribe \`/\` (una barra).
5. Guarda y pulsa **Play** ▶️.

¡Ya estás al aire! Compruébalo en tu **Dashboard**.

> Si no ves los datos de conexión, tu plan quizás no incluye DJ en vivo — usa el AutoDJ subiendo música.` },

      { titulo: 'Configurar el AutoDJ', categoria: 'AutoDJ', orden: 1, contenido:
`# 🎛️ AutoDJ

El AutoDJ reproduce tu música **automáticamente 24/7** cuando no hay nadie en vivo.

## Opciones (menú AutoDJ)
- **Tipo de mezcla (crossfade)**: cómo se unen las canciones.
  - *Normal*: mezcla suave.
  - *Inteligente*: ajusta según el volumen.
  - *Sin mezcla*: corte seco.
- **Duración de la mezcla**: segundos que dura el cruce entre canciones.
- **Evitar repetir**: minutos antes de que una canción pueda volver a sonar.
- **Cola**: cuántas canciones prepara por adelantado.

> Para que el AutoDJ tenga qué reproducir necesitas **música en una playlist activa**.` },

      { titulo: 'Subir música y crear playlists', categoria: 'Contenido', orden: 1, contenido:
`# 🎵 Música y playlists

## Subir música
1. Ve a **Música**.
2. (Opcional) elige la playlist destino en **"Subir a"**.
3. Haz clic y selecciona tus **MP3** (puedes varios a la vez).

## Tipos de playlist (menú Playlists)
- **Música general**: rotación normal.
- **Jingle / Spot**: suena **cada X canciones** (ideal para cuñas y anuncios).
- **Programa**: suena en **días y horas** específicas (ej. "Mañanas 6–10am").

## Orden
- **Aleatorio**: mezcla las canciones.
- **En orden**: las reproduce en secuencia.

> En **Música**, cada canción tiene chips para agregarla o quitarla de playlists.` },

      { titulo: 'Pon tu radio en tu sitio web', categoria: 'Difusión', orden: 1, contenido:
`# 🌐 Reproductor para tu web

Ve a **Reproductor** en el menú. Ahí tienes:
- Un **reproductor con carátula** listo para incrustar (copia el código \`iframe\`).
- **Stream directo**, enlaces **.pls** y **.m3u** para Winamp/VLC/iTunes.
- Un **reproductor HTML5** simple.

Copia el que prefieras y pégalo en tu página. El reproductor con carátula muestra
**lo que suena en vivo** y se actualiza solo.` },
    ];
    for (const d of docs) {
      await query('INSERT INTO documentacion (titulo, categoria, contenido, orden) VALUES ($1,$2,$3,$4)', [d.titulo, d.categoria, d.contenido, d.orden]);
    }
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
