/**
 * scripts/seed-docs-nuevas.js — documentación de las funciones nuevas.
 * Siembra artículos para clientes de AUDIO y de VIDEO (según audiencia).
 * Idempotente: no duplica si el título ya existe.
 * Uso:  npm run seed:nuevas
 */
require('dotenv').config();
const { pool, query } = require('../config/database');

const DOCS = [
  // ── AUDIO ─────────────────────────────────────────────────────────
  {
    audiencia: 'audio', categoria: 'AutoDJ', orden: 5,
    titulo: 'Que tu radio dé la hora (y el clima)',
    contenido: `# Que tu radio dé la hora automáticamente 🕒

Tu radio puede **anunciar la hora sola**, con voz, como en Zara Radio o RadioBOSS.

## Cómo activarlo
1. Entra a **AutoDJ → Ajustes y hora**.
2. En la tarjeta **«🕒 Da la hora»**, activa el interruptor.
3. Elige **cada cuánto**: cada hora en punto, cada media hora o cada 15 minutos.
4. (Opcional) Activa **«Anteponer un saludo»** para que diga «Atención…» antes.

Suena algo como: *«Son las tres y media de la tarde»*.

## Decir también el clima 🌤️
1. Marca **«Decir también el clima»**.
2. Escribe tu **ciudad** (ej: *Cali*) y sal del campo para guardar.

Ahora dirá: *«Son las tres de la tarde. Ahora mismo 26 grados en Cali, despejado»*.

## Probar sin esperar
El botón **«🔊 Probar ahora»** lo hace sonar de una (salta la canción actual).
Programado, respeta la canción y suena al llegar la franja.

> Consejo: cada media hora es lo más común. Si te parece mucho, déjalo cada hora.`,
  },
  {
    audiencia: 'audio', categoria: 'Contenido', orden: 2,
    titulo: 'Organiza tu música en playlists (en lote)',
    contenido: `# Organiza tu música rápido

Ya no tienes que agregar canción por canción a una playlist.

## Al subir
En **Música**, arriba, elige **«Subir a:»** la playlist que quieras — todo lo que
subas cae directo ahí.

## Para la música ya subida
En la lista de **Mi música**:
- **Marca varias** con las casillas (o **«Seleccionar todo»**).
- Usa **«＋ Agregar a playlist…»** o **«− Quitar de playlist…»** → se aplica a todas
  las marcadas de un golpe.

## El atajo más rápido
El botón **«⚡ Agregar TODA mi música a…»** mete **todas** tus canciones a una
playlist con un solo clic. Ideal para «todo a la rotación principal».`,
  },

  // ── VIDEO ─────────────────────────────────────────────────────────
  {
    audiencia: 'video', categoria: 'Transmitir en vivo', orden: 2,
    titulo: 'Retransmite tu canal a Facebook Live',
    contenido: `# Retransmitir a Facebook 📘

Puedes enviar tu canal a tu página de **Facebook Live** — se retransmite lo que
esté al aire (tus videos 24/7 o tu transmisión en vivo).

> Esta opción aparece solo si tu plan la incluye. Si no la ves, escríbenos.

## Cómo activarlo
1. Entra a **Conectar** → tarjeta **«📘 Retransmitir a Facebook»**.
2. Consigue tu **clave de transmisión** en Facebook:
   - Facebook → **Herramienta de transmisión en vivo** → «Usar clave de transmisión».
   - Activa una **clave persistente** (para no cambiarla cada vez).
3. Pega la clave en la tarjeta y pulsa **«Guardar y activar»**.

En segundos tu canal aparece en tu Facebook Live. Para detenerlo, **«Apagar»**.

## Si Facebook no conecta
- Asegúrate de usar una **clave persistente**, no la de un evento puntual.
- Verifica que copiaste la clave completa, sin espacios.`,
  },
];

async function seed() {
  let creados = 0, existentes = 0;
  for (const d of DOCS) {
    const { rows } = await query('SELECT id FROM documentacion WHERE titulo = $1', [d.titulo]);
    if (rows.length) { existentes++; continue; }
    await query(
      `INSERT INTO documentacion (titulo, categoria, contenido, orden, publicado, audiencia)
       VALUES ($1,$2,$3,$4,true,$5)`,
      [d.titulo, d.categoria, d.contenido, d.orden, d.audiencia]
    );
    creados++;
  }
  console.log(`✅ Docs de funciones nuevas: ${creados} creados, ${existentes} ya existían.`);
  await pool.end();
}

seed().catch((err) => { console.error('❌ Seed falló:', err.message); process.exit(1); });
