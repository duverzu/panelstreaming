/**
 * services/programacion.js — programación NATIVA de AzuraCast
 * ------------------------------------------------------------------
 * POR QUÉ EXISTE ESTE MÓDULO (leer antes de tocar nada):
 *
 * Durante meses el panel intentó que el "da la hora" y las cuñas sonaran
 * metiendo el archivo a una playlist JUSTO en el minuto programado. Eso no
 * puede funcionar, por dos razones que se verificaron contra el código de
 * AzuraCast:
 *
 *   1) `is_jingle` NO programa nada. El OpenAPI lo dice: "do not send jingle
 *      metadata to AutoDJ or trigger web hooks" — solo oculta la metadata.
 *      Lo que programa es `type` (Radio/AutoDJ/Scheduler.php). Con
 *      `type: 'default'` la playlist entra a la rotación normal por `weight`
 *      y `play_per_songs` se IGNORA (solo se lee bajo `once_per_x_songs`).
 *
 *   2) La cola va pre-armada. `autodj_queue_length` (3 por defecto) son
 *      10-20 minutos de anticipación. AzuraCast evalúa cada playlist contra
 *      el `expectedPlayTime` del slot que está construyendo, así que la
 *      programación NATIVA sí es puntual — pero meter un archivo "ahora" no
 *      toca la cola ya construida, y sacarlo 2 minutos después (el viejo
 *      `programarRetiro`) lo retiraba antes de que AzuraCast lo mirara.
 *
 * La solución es dejar que AzuraCast programe:
 *   • Da la hora → `type: 'once_per_hour'` + `play_per_hour_minute`.
 *   • Cuñas      → `schedule_items` con `start_time == end_time` (AzuraCast
 *                  abre una ventana de 15 min) y `loop_once: true`.
 *
 * Dos detalles que cuestan caro si se olvidan:
 *   • Los `schedule_items` se evalúan en la zona horaria de la ESTACIÓN en
 *     AzuraCast, no en la del panel. Por eso `sincronizarZona()`.
 *   • Nada de esto necesita reiniciar la estación: con
 *     `write_playlists_to_liquidsoap: false` (el default) las playlists de
 *     tipo `songs` las sirve el AutoDJ de PHP, no Liquidsoap.
 * ------------------------------------------------------------------
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** "08:30" → 830 (el formato entero que usa `start_time`/`end_time`). */
function aHHMM(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 100 + m;
}

/**
 * Crea la playlist si no existe, y si existe la corrige.
 *
 * OJO: la corrección incluye SIEMPRE `type`. El bug histórico fue que la rama
 * "ya existe" solo parcheaba is_jingle/is_enabled/play_per_songs, así que una
 * playlist nacida con `type: 'default'` se quedaba así para siempre.
 */
async function playlistSincronizada(az, stationId, nombre, campos) {
  const deseado = {
    name: nombre,
    source: 'songs',
    order: 'sequential',
    is_jingle: true,             // no ensucia el "ahora suena" ni dispara webhooks
    is_enabled: true,
    include_in_requests: false,
    include_in_on_demand: false,
    weight: 1,
    // Explícito, no por omisión: si una playlist arrastra horarios de una
    // configuración anterior, seguirían restringiendo cuándo puede sonar.
    schedule_items: [],
    ...campos,
  };

  const pls = (await az.getPlaylists(stationId)) || [];
  const existe = pls.find((p) => p.name === nombre);
  if (!existe) return (await az.createPlaylist(stationId, deseado)).id;

  await az.updatePlaylist(stationId, existe.id, deseado);
  return existe.id;
}

/** Borra una playlist por nombre (si existe). Devuelve true si borró algo. */
async function borrarPlaylistPorNombre(az, stationId, nombre) {
  const pls = (await az.getPlaylists(stationId)) || [];
  const p = pls.find((x) => x.name === nombre);
  if (!p) return false;
  await az.deletePlaylist(stationId, p.id);
  return true;
}

/**
 * Deja `mediaId` como ÚNICO archivo de `plId`, sin tocar las demás playlists
 * del archivo ni las de los otros archivos.
 *
 * El `setFilePlaylists` a secas REEMPLAZA la lista de playlists del archivo:
 * así fue como cuñas del cliente terminaron sacadas de "CAMPESINA" y otras
 * playlists suyas. Aquí la asignación es ADITIVA para el archivo que entra
 * (conserva sus otras playlists) y solo saca de `plId` a los que sobran.
 */
async function ponerUnicoArchivo(az, stationId, plId, mediaId, listaPrecargada = null) {
  const files = listaPrecargada || (await az.listMedia(stationId)) || [];

  for (const f of files) {
    const actuales = (f.playlists || []).map((p) => p.id);
    const estaDentro = actuales.includes(plId);
    const debeEstar = String(f.id) === String(mediaId);

    if (debeEstar && !estaDentro) {
      await az.setFilePlaylists(stationId, f.id, [...actuales, plId]);
    } else if (!debeEstar && estaDentro) {
      await az.setFilePlaylists(stationId, f.id, actuales.filter((id) => id !== plId));
    }
  }
}

/**
 * Sincroniza la zona horaria de la estación en AzuraCast con la del cliente.
 * Sin esto, un `schedule_item` de las 08:00 suena a las 08:00 de la zona que
 * tenga puesta la estación, que no tiene por qué ser la del cliente.
 */
async function sincronizarZona(az, stationId, zona) {
  if (!zona) return;
  try {
    const st = await az.getStationAdmin(stationId);
    if (st?.timezone === zona) return;
    await az.updateStation(stationId, { timezone: zona });
  } catch (e) {
    console.error(`[programacion] zona station ${stationId}:`, e.message);
  }
}

/**
 * Fuerza a AzuraCast a tirar la cola pre-armada y construir una nueva.
 * Es la única forma de que un cambio se refleje YA en vez de en 10-20 minutos.
 * Se usa SOLO en las pruebas manuales del panel: en la programación normal la
 * cola se reconstruye sola y a tiempo.
 */
async function rebuildCola(az, stationId) {
  // PUT, no POST — el endpoint responde 405 a POST.
  await az.api.put(`/admin/debug/station/${stationId}/clearqueue`);
}

/**
 * Reproduce un archivo cuanto antes (botón "Probar" del panel).
 *
 * Lo mete en una playlist desechable `once_per_x_songs` (que sí dispara tras
 * la canción actual), tira la cola para que AzuraCast la reconstruya con el
 * archivo dentro, y lo saca cuando de verdad terminó de sonar — leyendo el
 * `played_at` REAL que la propia cola devuelve, no adivinando por la duración
 * de la canción que sonaba al empezar (ese era el error del viejo retiro).
 *
 * Devuelve { ok, segundos } con la espera estimada hasta que suene.
 */
const PL_PRUEBA = '🔧 Prueba (panel)';

async function reproducirAhora(az, stationId, mediaId) {
  const plId = await playlistSincronizada(az, stationId, PL_PRUEBA, {
    type: 'once_per_x_songs',
    play_per_songs: 1,
  });

  await ponerUnicoArchivo(az, stationId, plId, mediaId);
  await rebuildCola(az, stationId);
  await sleep(2000);                       // deja que el rebuild termine

  // Busca nuestro archivo en la cola nueva para saber cuándo sonará de verdad.
  let suenaEn = null;
  try {
    const cola = (await az.getQueue(stationId)) || [];
    const mio = cola.find((i) => String(i.media_id ?? i.song_id) === String(mediaId)
      || (i.playlist || '') === PL_PRUEBA);
    if (mio?.played_at) suenaEn = mio.played_at * 1000;
  } catch (_) {}

  // Lo saca una vez sonado. Sin esto, `once_per_x_songs: 1` lo repetiría entre
  // cada canción. Si el proceso muere antes, la limpieza de arranque lo barre.
  const limpiar = async () => {
    const espera = suenaEn ? Math.max(0, suenaEn - Date.now()) + 60000 : 300000;
    await sleep(espera);
    await ponerUnicoArchivo(az, stationId, plId, null).catch(() => {});
  };
  limpiar().catch((e) => console.error('[programacion] limpieza prueba:', e.message));

  const segundos = suenaEn ? Math.max(0, Math.round((suenaEn - Date.now()) / 1000)) : null;
  return { ok: true, segundos };
}

/**
 * Vacía la playlist de pruebas de una estación. Se llama al arrancar el
 * proceso: si un `pm2 restart` mató el temporizador de `reproducirAhora`, el
 * archivo se habría quedado sonando entre cada canción indefinidamente.
 */
async function limpiarPruebas(az, stationId) {
  const pls = (await az.getPlaylists(stationId)) || [];
  const p = pls.find((x) => x.name === PL_PRUEBA);
  if (p) await ponerUnicoArchivo(az, stationId, p.id, null);
}

// ---- Identificación de las playlists que gestiona el panel --------
// El cliente ve sus playlists y las nuestras en la misma lista de AzuraCast.
// Necesita distinguirlas: son de solo lectura (las reescribe el panel cada vez
// que se guarda la config) y borrar una rompe su "da la hora" o sus cuñas.
const PATRONES = [
  { rx: /^⏰ Hora :(\d{2})$/, clase: 'hora', donde: 'Da la hora' },
  { rx: /^📣 .+ #\d+(?: :\d{2})?$/, clase: 'cuna', donde: 'Cuñas' },
  { rx: /^🔧 Prueba \(panel\)$/, clase: 'interna', donde: null },
];

/** Devuelve {clase, donde} si la playlist la gestiona el panel, o null. */
function clasificar(nombre) {
  for (const p of PATRONES) if (p.rx.test(String(nombre || ''))) return { clase: p.clase, donde: p.donde };
  return null;
}

const esDelSistema = (nombre) => clasificar(nombre) !== null;

/** Texto legible de CUÁNDO suena, para pintarlo en el panel del cliente. */
function cuandoSuena(p) {
  const horas = (p.schedule_items || [])
    .map((s) => Math.floor(s.start_time / 100))
    .sort((a, b) => a - b);
  const mm = String(p.play_per_hour_minute ?? 0).padStart(2, '0');

  if (p.type !== 'once_per_hour') return null;
  if (!horas.length) return `Cada hora, en el minuto :${mm}`;
  return 'Suena a las ' + horas.map((h) => `${String(h).padStart(2, '0')}:${mm}`).join(', ');
}

module.exports = {
  aHHMM,
  clasificar,
  esDelSistema,
  cuandoSuena,
  playlistSincronizada,
  borrarPlaylistPorNombre,
  ponerUnicoArchivo,
  sincronizarZona,
  rebuildCola,
  reproducirAhora,
  limpiarPruebas,
  PL_PRUEBA,
};
