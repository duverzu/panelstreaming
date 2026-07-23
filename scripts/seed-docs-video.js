/**
 * scripts/seed-docs-video.js — documentación para clientes de VIDEO.
 *
 * Inserta los artículos con audiencia='video', así solo los ven los clientes
 * de streaming de video en su sección "Aprende" (los de radio no los ven).
 *
 * Es idempotente: si un artículo ya existe (mismo título) no lo duplica.
 * Uso:  npm run seed:video
 */
require('dotenv').config();
const { pool, query } = require('../config/database');

const DOCS = [
  // ── Primeros pasos ────────────────────────────────────────────────
  {
    titulo: 'Bienvenido a tu panel de video',
    categoria: 'Primeros pasos',
    orden: 1,
    contenido: `# Bienvenido a tu canal de video 🎬

Desde este panel controlas todo tu canal de streaming: subes tus videos, armas
tus listas, programas qué se ve a cada hora y transmites en vivo.

## Tu canal emite 24/7
Tu canal **no se apaga**: reproduce tus videos en bucle las 24 horas. Cuando el
último termina, vuelve a empezar el primero. Así tus espectadores siempre
encuentran algo al entrar.

## El menú, de un vistazo

| Sección | Para qué sirve |
|---|---|
| **Inicio** | Ves tu canal en vivo, cuánto espacio usas y tu transferencia |
| **Gestionar videos** | Subes y borras tus videos |
| **Playlist** | Creas listas y programas qué lista se ve a cada hora |
| **Reproductor** | El reproductor para compartir o incrustar |
| **Enlaces** | Los enlaces de tu canal (para tu web o app) |
| **Conectar** | Los datos para transmitir **en vivo** con OBS |

## Lo primero que deberías hacer
1. Entra a **Gestionar videos** y sube tus primeros archivos.
2. Ve a **Playlist** y arma el orden en que quieres que se vean.
3. Vuelve a **Inicio** y comprueba que tu canal ya está al aire.

> ¿Necesitas ayuda? Escríbenos y con gusto te acompañamos.`,
  },

  // ── Contenido ─────────────────────────────────────────────────────
  {
    titulo: 'Cómo subir tus videos',
    categoria: 'Contenido',
    orden: 1,
    contenido: `# Subir tus videos

Entra a **Gestionar videos**. Tienes dos formas de subir:

- **Arrastrar y soltar**: toma los archivos desde tu computador y suéltalos en
  el recuadro punteado.
- **Hacer clic** en el recuadro y elegirlos desde tu carpeta.

Puedes seleccionar **varios videos a la vez**. Se suben de uno en uno y verás
una **barra de progreso por cada archivo**, con su estado: *en cola*,
*subiendo %*, *listo* o *error*.

> ⚠️ **No cierres la página** mientras esté subiendo. Cada video aparece en
> "Mis videos" apenas termina el suyo.

## Formatos que aceptamos
**MP4, MKV, MOV, WEBM y FLV.** Cualquier otro archivo se ignora al soltarlo.

## El formato recomendado (importante) ⭐
Para que tu canal se vea **con la mejor calidad** y sin consumir recursos de
más, lo ideal es que **todos tus videos compartan el mismo formato**:

- **Video:** H.264 (AVC)
- **Audio:** AAC
- **Resolución:** 1280x720 (720p)
- **Cuadros por segundo:** 30

Cuando todos tus videos son iguales, el canal los emite **copiándolos tal cual**:
la calidad es idéntica a la original. Si están mezclados (distintas
resoluciones, códecs o audios), el sistema los convierte al vuelo, lo que
funciona igual pero consume más y puede bajar un poco la calidad.

## Límites
- Tamaño máximo por archivo: **5 GB**.
- El espacio total depende de tu plan. Lo ves en **Inicio**, en la gráfica de
  "Almacenamiento".

## Borrar un video
En la lista "Mis videos", el botón de la papelera. Ten en cuenta que **se borra
definitivamente** y el canal se reorganiza sin él.`,
  },
  {
    titulo: 'Listas de reproducción y programación por horario',
    categoria: 'Contenido',
    orden: 2,
    contenido: `# Listas y programación por horario

En **Playlist** decides **qué se ve y en qué orden**. Puedes tener varias listas
y hacer que cada una salga al aire a una hora distinta.

## 1. Crear una lista
1. Escribe un nombre (ej: *Mañana*, *Películas*, *Musicales*) y crea la lista.
2. Selecciona la lista y **agrégale los videos** que quieras.
3. El orden de la lista es el orden en que se emiten.

Puedes tener las listas que necesites: una para cada momento del día, para cada
tipo de contenido, etc.

## 2. La lista activa
La **lista activa** es la que se emite cuando **no hay ninguna franja horaria**
que aplique en ese momento. Piénsala como tu programación "por defecto".

## 3. Programar por horario
Agrega franjas indicando **desde** y **hasta**, y qué lista se emite:

| Desde | Hasta | Lista |
|---|---|---|
| 06:00 | 12:00 | Mañana |
| 12:00 | 18:00 | Tarde |
| 18:00 | 23:00 | Películas |

- Las franjas **pueden cruzar la medianoche** (ej: 22:00 → 06:00).
- Fuera de cualquier franja, se emite la **lista activa**.
- El sistema revisa la programación **cada minuto**: al entrar una nueva franja,
  el canal cambia solo de lista.

## Cosas que conviene saber
- Si un video de la lista lo borraste, simplemente se salta.
- Los videos nuevos que subas y no estén en la lista se agregan **al final**.
- Al cambiar de lista el canal se reinicia unos segundos: es normal.`,
  },

  // ── Emisión ───────────────────────────────────────────────────────
  {
    titulo: 'Cómo funciona tu canal 24/7',
    categoria: 'Tu canal',
    orden: 1,
    contenido: `# Tu canal 24/7

Tu canal reproduce tus videos **en bucle, sin parar**. No tienes que encender
nada cada día: mientras tengas videos, hay emisión.

## Qué pasa cuando…

- **Subes un video** → el canal se reorganiza para incluirlo.
- **Borras un video** → se saca de la emisión.
- **Cambias la lista o entra una franja horaria** → el canal se reinicia unos
  segundos y arranca con la nueva lista.
- **Transmites en vivo** → el vivo **toma el control** del canal. Al terminar,
  vuelve solo a la emisión 24/7.

> Durante un reinicio el reproductor puede quedarse un momento en negro y luego
> vuelve solo. Es normal y dura pocos segundos.

## Dos modos de emisión
El sistema elige el modo automáticamente:

- **Copia directa** — si todos tus videos comparten formato. Es el mejor: la
  calidad es idéntica a la original.
- **Conversión al vuelo** — si tus videos están mezclados. Funciona igual, pero
  consume más recursos y puede bajar un poco la calidad.

👉 Por eso recomendamos subir todo en **H.264 + AAC, 720p, 30fps**
(ver el artículo *Cómo subir tus videos*).

## Ver tu canal
En **Inicio** tienes el reproductor en vivo. Si algo no se ve, dale **F5** a la
página: el reproductor se reconecta solo cuando el canal se reinicia.`,
  },

  // ── Transmitir en vivo ────────────────────────────────────────────
  {
    titulo: 'Transmitir en vivo con OBS',
    categoria: 'Transmitir en vivo',
    orden: 1,
    contenido: `# Transmitir en vivo (OBS, vMix, Streamlabs)

Puedes interrumpir tu emisión 24/7 para salir **en directo**. Al terminar, tu
canal vuelve solo a los videos.

## 1. Consigue tus datos
Entra a **Conectar**. Ahí tienes dos datos:

- **Servidor** (empieza por \`rtmp://…\`)
- **Clave de transmisión** (tu *stream key*)

> 🔒 La clave es **personal y secreta**. Con ella cualquiera podría transmitir
> en tu canal: no la compartas ni la muestres en pantalla.

## 2. Configurar OBS Studio
1. Abre **Ajustes → Emisión**.
2. En *Servicio* elige **Personalizado…**
3. Pega el **Servidor** y la **Clave de transmisión**.
4. Acepta.

## 3. Ajustes recomendados (Ajustes → Salida)
Pon *Modo de salida* en **Avanzado**:

- **Codificador:** x264 (o el de tu tarjeta si tienes)
- **Control de tasa:** CBR
- **Tasa de bits:** 2500 kbps (para 720p)
- **Intervalo de fotogramas clave:** **2 segundos** ← importante
- **Preajuste de uso de CPU:** veryfast

En *Ajustes → Video*:
- **Resolución de salida:** 1280x720
- **FPS:** 30

## 4. Salir al aire
Dale a **Iniciar transmisión**. En unos segundos tu canal mostrará tu directo.
Cuando pares, vuelve la emisión 24/7 automáticamente.

## Si no conecta
- Revisa que copiaste el **servidor** y la **clave** completos, sin espacios.
- El *intervalo de fotogramas clave* debe ser **2 segundos**.
- Si tu internet de subida es lento, baja la tasa de bits (ej: 1500 kbps).`,
  },

  // ── Difusión ──────────────────────────────────────────────────────
  {
    titulo: 'Pon tu canal en tu web o app',
    categoria: 'Difusión',
    orden: 1,
    contenido: `# Comparte tu canal

En **Enlaces** encuentras las direcciones de tu canal, listas para copiar.

## El enlace principal (.m3u8)
Es el enlace técnico de tu canal, en formato **HLS**. Sirve para:

- Reproductores de sitios web
- **Aplicaciones móviles** (Android / iOS)
- Smart TV y reproductores como VLC

Es el que le tienes que dar a quien desarrolle tu web o tu app.

## Probarlo rápido
Ábrelo con **VLC** → *Medio → Abrir ubicación de red* → pega el enlace. Si se ve
ahí, tu canal está funcionando bien.

## En tu página web
La forma más sencilla es usar un reproductor compatible con HLS. Tu
desarrollador solo necesita el enlace \`.m3u8\`; la mayoría de reproductores
modernos (Video.js, JW Player, Plyr, hls.js) lo soportan directamente.

## Enlaces amigables
En la sección **Enlaces** también tienes versiones más cortas y fáciles de
compartir. Úsalas para redes sociales o para pasarlas por WhatsApp.

> 💡 Tu enlace **no cambia** aunque reinicies el canal, cambies de lista o
> transmitas en vivo. Puedes publicarlo tranquilo.`,
  },

  // ── Ayuda ─────────────────────────────────────────────────────────
  {
    titulo: 'Problemas comunes y cómo resolverlos',
    categoria: 'Ayuda',
    orden: 1,
    contenido: `# Problemas comunes

## El reproductor se ve en negro
- Dale **F5** a la página. El canal pudo haberse reiniciado (por un cambio de
  lista) y el reproductor se reconecta solo en unos segundos.
- Revisa en **Gestionar videos** que tengas **al menos un video** subido: sin
  videos no hay emisión.

## El video se corta o se ve entrecortado
Casi siempre es la conexión de quien lo ve. Si les pasa a todos:
- Revisa que tus videos estén en **720p** y no en 4K (un archivo enorme obliga a
  enviar mucha más información).
- Si transmites en vivo, baja la **tasa de bits** en OBS.

## Subí un video y no aparece
- Comprueba que el formato sea **MP4, MKV, MOV, WEBM o FLV**.
- Si pesa más de **5 GB**, no se sube: divídelo o compártelo en menor calidad.
- Refresca la lista con el botón de recargar.

## Se me llenó el espacio
Lo ves en **Inicio**, en la gráfica de "Almacenamiento". Borra videos que ya no
uses o pídenos ampliar tu plan.

## No puedo transmitir en vivo
- Verifica **servidor** y **clave** en la sección **Conectar** (cópialos de
  nuevo, completos).
- En OBS, el *intervalo de fotogramas clave* debe ser **2 segundos**.

## Mi canal se ve con menos calidad de la que subí
Suele pasar cuando tus videos tienen **formatos mezclados** y el sistema debe
convertirlos al vuelo. Súbelos todos en **H.264 + AAC, 720p, 30fps** y el canal
los emitirá **copiando el original**, sin pérdida.

---

¿No resolviste? Escríbenos con el nombre de tu canal y qué te aparece, y lo
revisamos contigo.`,
  },
];

async function seed() {
  let creados = 0;
  let existentes = 0;

  for (const d of DOCS) {
    const { rows } = await query('SELECT id FROM documentacion WHERE titulo = $1', [d.titulo]);
    if (rows.length) { existentes++; continue; }
    await query(
      `INSERT INTO documentacion (titulo, categoria, contenido, orden, publicado, audiencia)
       VALUES ($1,$2,$3,$4,true,'video')`,
      [d.titulo, d.categoria, d.contenido, d.orden]
    );
    creados++;
  }

  console.log(`✅ Documentación de VIDEO: ${creados} creados, ${existentes} ya existían.`);
  await pool.end();
}

seed().catch((err) => {
  console.error('❌ Seed de documentación de video falló:', err.message);
  process.exit(1);
});
