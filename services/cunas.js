/**
 * services/cunas.js — cuñas / anuncios programados
 * ------------------------------------------------------------------
 * El cliente crea "cuñas": mensajes propios que suenan a horas fijas.
 *   - tipo 'texto' → se genera con voz (TTS) UNA vez y se guarda en AzuraCast.
 *   - tipo 'audio' → el cliente sube su MP3 (su locutor) y se guarda en AzuraCast.
 *
 * CÓMO FUNCIONA (reescrito 2026-08-12 — ver services/programacion.js):
 *
 * Cada cuña tiene SU PROPIA playlist permanente en AzuraCast, con un
 * `schedule_item` por cada hora programada. Poniendo `start_time == end_time`
 * AzuraCast abre una ventana de 15 minutos, y con `loop_once: true` la cuña
 * suena UNA sola vez dentro de esa ventana. Programa AzuraCast; el panel solo
 * mantiene la playlist sincronizada cuando el cliente guarda la cuña.
 *
 * Aquí ya NO hay planificador de Node. El anterior fallaba por tres motivos:
 *   • metía el archivo a la playlist en el minuto exacto, cuando la cola ya
 *     estaba armada 10-20 min por delante (y lo retiraba antes de que sonara);
 *   • si el minuto se perdía (deploy, pico de BD), la cuña no sonaba ese día;
 *   • `setFilePlaylists(f.id, [plId])` REEMPLAZABA las playlists del archivo,
 *     así que sacaba las cuñas de las playlists de música del cliente.
 *
 * Horas: lista de "HH:MM" (ej. ["08:00","12:00","20:00"]), en la zona horaria
 * del cliente — que se refleja en la zona de la estación en AzuraCast, porque
 * es la que AzuraCast usa para evaluar los `schedule_items`.
 * ------------------------------------------------------------------
 */
const { query } = require('../config/database');
const clienteModel = require('../models/clienteModel');
const azuracast = require('./azuracast');
const prog = require('./programacion');
const { generarVoz, verConfig } = require('./anuncioHora');
const { DEFAULT_TZ } = require('./zonaHoraria');

/**
 * Nombre estable de la playlist de una cuña, POR MINUTO. Lleva el id para que
 * renombrar la cuña no cree una playlist nueva y deje huérfana la anterior.
 *
 * ¿Por qué una por minuto? Ver `sincronizar`: cada playlist es `once_per_hour`,
 * y ese tipo admite UN solo `play_per_hour_minute`. Así, una cuña programada a
 * las 08:00 y 12:30 necesita dos playlists (minuto 0 y minuto 30).
 */
const nombrePlaylist = (cuna, minuto) =>
  `📣 ${cuna.nombre || 'Cuña'} #${cuna.id} :${String(minuto).padStart(2, '0')}`;

/** Playlists de cuñas de una estación (para limpiar huérfanas). Acepta también
 *  el formato antiguo sin minuto, para poder barrer las de la versión previa. */
const RX_PLAYLIST_CUNA = /^📣 .* #(\d+)(?: :\d{2})?$/;

// ---- Sincronización con AzuraCast --------------------------------
/**
 * Deja la playlist de la cuña reflejando exactamente lo que hay en BD:
 * horas programadas, activo/inactivo y el archivo de audio.
 * Idempotente — se llama en cada guardado.
 */
async function sincronizar(cliente, cuna) {
  const stationId = cliente.azuracast_station_id;
  if (!stationId || !cuna.media_id) return null;

  const az = await azuracast.paraServidorId(cliente.servidor_id);
  const horas = Array.isArray(cuna.horas) ? cuna.horas : [];

  // Las horas viven en la zona del cliente; AzuraCast evalúa los schedule_items
  // en la zona de la ESTACIÓN, así que tienen que coincidir.
  const cfg = await verConfig(cliente.id).catch(() => ({}));
  await prog.sincronizarZona(az, stationId, cfg.zona_horaria || DEFAULT_TZ);

  // Agrupa las horas por MINUTO: "08:00","12:00","12:30" → {0:[8,12], 30:[12]}
  const porMinuto = new Map();
  for (const h of horas) {
    const [hh, mm] = String(h).split(':').map(Number);
    if (!porMinuto.has(mm)) porMinuto.set(mm, []);
    porMinuto.get(mm).push(hh);
  }

  const files = (await az.listMedia(stationId)) || [];
  // El archivo se busca por unique_id o id (media_id guarda el que devolvió la
  // subida, que según la versión de AzuraCast es uno u otro).
  const f = files.find((x) => x.unique_id === cuna.media_id || String(x.id) === String(cuna.media_id));
  if (!f) { console.error('[cuna] no encontré el media', cuna.media_id); return null; }

  const activa = Boolean(cuna.activo) && horas.length > 0;
  const creadas = [];

  for (const [minuto, horasDelMinuto] of porMinuto) {
    // `once_per_hour` y NO `default`+horario. Verificado en producción: cuando
    // el cliente tiene un bloque programado (p.ej. una playlist "PROGRAMA" de
    // 08:00 a 09:00), ese bloque se queda con TODOS los turnos del AutoDJ y una
    // playlist `default` con horario nunca gana un hueco — la cuña no sonaba.
    // Las `once_per_hour` sí se cuelan (es lo que hace el "da la hora").
    // Como este tipo solo admite un minuto, va una playlist por minuto, y los
    // `schedule_items` limitan en qué HORAS aplica.
    const plId = await prog.playlistSincronizada(az, stationId, nombrePlaylist(cuna, minuto), {
      type: 'once_per_hour',
      play_per_hour_minute: minuto,
      is_enabled: activa,
      schedule_items: horasDelMinuto.map((hh) => ({
        start_time: hh * 100,
        end_time: hh * 100 + 59,   // toda esa hora; el minuto lo pone once_per_hour
        days: [1, 2, 3, 4, 5, 6, 7],
        loop_once: false,          // innecesario: once_per_hour ya limita a uno por hora
      })),
    });
    creadas.push(plId);
  }

  await limpiarPlaylistsSobrantes(az, stationId, cuna, porMinuto);

  // El archivo entra en TODAS sus playlists de una sola vez.
  //
  // Antes esto se hacía con un `ponerUnicoArchivo` por playlist dentro del
  // bucle, pero todas leían la MISMA foto de `files`: cada iteración recalculaba
  // las playlists del archivo desde ese estado viejo y pisaba a la anterior, así
  // que solo sobrevivía la última y las demás quedaban vacías (arch=0).
  const idsDeEstaCuna = new Set(
    ((await az.getPlaylists(stationId)) || [])
      .filter((p) => RX_PLAYLIST_CUNA.exec(p.name || '')?.[1] === String(cuna.id))
      .map((p) => p.id)
  );
  const otras = (f.playlists || []).map((p) => p.id).filter((id) => !idsDeEstaCuna.has(id));
  await az.setFilePlaylists(stationId, f.id, [...new Set([...otras, ...creadas])]);
  await query('UPDATE cunas SET playlist_id = $1 WHERE id = $2', [creadas[0] ?? null, cuna.id]);
  return creadas[0] ?? null;
}

/**
 * Borra las playlists de ESTA cuña que ya no correspondan: las de minutos que
 * el cliente quitó, y las del formato antiguo (sin `:MM` en el nombre).
 */
async function limpiarPlaylistsSobrantes(az, stationId, cuna, porMinuto) {
  const validas = new Set([...porMinuto.keys()].map((m) => nombrePlaylist(cuna, m)));
  const pls = (await az.getPlaylists(stationId)) || [];
  for (const p of pls) {
    const m = RX_PLAYLIST_CUNA.exec(p.name || '');
    if (!m || m[1] !== String(cuna.id) || validas.has(p.name)) continue;
    await az.deletePlaylist(stationId, p.id).catch(() => {});
  }
}

/** Sube un MP3 (Buffer) y devuelve su media id. */
async function subirMedia(az, stationId, buffer, nombre) {
  const media = await az.uploadMedia(stationId, nombre, buffer.toString('base64'));
  return media.unique_id || media.id;
}

// ---- CRUD ---------------------------------------------------------
function normHoras(horas) {
  return (Array.isArray(horas) ? horas : [])
    .map((h) => String(h).trim())
    .filter((h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h));
}

async function listar(clienteId) {
  const { rows } = await query(
    'SELECT id, nombre, tipo, texto, horas, activo, (media_id IS NOT NULL) AS lista FROM cunas WHERE cliente_id = $1 ORDER BY id',
    [clienteId]
  );
  return rows;
}

/** Crea o actualiza una cuña. Para tipo 'texto' regenera la voz si cambió. */
async function guardar(cliente, { id, nombre, tipo, texto, horas, activo }) {
  const t = tipo === 'audio' ? 'audio' : 'texto';
  const hrs = normHoras(horas);
  const stationId = cliente.azuracast_station_id;
  const voz = (await verConfig(cliente.id).catch(() => ({}))).voz;   // misma voz que el anuncio de hora

  if (id) {
    const { rows } = await query('SELECT * FROM cunas WHERE id = $1 AND cliente_id = $2', [id, cliente.id]);
    const prev = rows[0];
    if (!prev) throw new Error('Cuña no encontrada');

    let media_id = prev.media_id;
    if (t === 'texto' && texto && texto !== prev.texto) {
      const az = await azuracast.paraServidorId(cliente.servidor_id);
      media_id = await subirMedia(az, stationId, await generarVoz(texto, { voz }), `cuna-${cliente.id}-${id}.mp3`);
    }

    const { rows: act } = await query(
      `UPDATE cunas SET nombre=$1, tipo=$2, texto=$3, horas=$4, activo=$5, media_id=$6, updated_at=now()
        WHERE id=$7 RETURNING *`,
      [nombre || prev.nombre, t, t === 'texto' ? (texto ?? prev.texto) : prev.texto, JSON.stringify(hrs), activo !== false, media_id, id]
    );
    await sincronizar(cliente, act[0]);
    return id;
  }

  // Nueva. El archivo se sube DESPUÉS del INSERT, ya con el id real: antes se
  // subía como `cuna-<cliente>-nueva.mp3`, así que dos cuñas de texto creadas
  // seguidas se pisaban el archivo la una a la otra.
  const { rows } = await query(
    'INSERT INTO cunas (cliente_id, nombre, tipo, texto, horas, activo) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [cliente.id, nombre || 'Cuña', t, t === 'texto' ? texto : null, JSON.stringify(hrs), activo !== false]
  );
  const cuna = rows[0];

  if (t === 'texto' && texto) {
    const az = await azuracast.paraServidorId(cliente.servidor_id);
    cuna.media_id = await subirMedia(az, stationId, await generarVoz(texto, { voz }), `cuna-${cliente.id}-${cuna.id}.mp3`);
    await query('UPDATE cunas SET media_id=$1 WHERE id=$2', [cuna.media_id, cuna.id]);
    await sincronizar(cliente, cuna);
  }
  return cuna.id;
}

/** Sube el audio (Buffer) de una cuña 'audio' y guarda su media_id. */
async function subirAudio(cliente, cunaId, buffer, nombreArchivo) {
  const { rows } = await query('SELECT * FROM cunas WHERE id=$1 AND cliente_id=$2', [cunaId, cliente.id]);
  if (!rows[0]) throw new Error('Cuña no encontrada');
  const az = await azuracast.paraServidorId(cliente.servidor_id);
  const media_id = await subirMedia(az, cliente.azuracast_station_id, buffer, `cuna-${cliente.id}-${cunaId}.mp3`);
  const { rows: act } = await query(
    'UPDATE cunas SET tipo=$1, media_id=$2, updated_at=now() WHERE id=$3 RETURNING *',
    ['audio', media_id, cunaId]
  );
  await sincronizar(cliente, act[0]);
  return media_id;
}

async function borrar(clienteId, id) {
  const { rows } = await query('SELECT * FROM cunas WHERE id=$1 AND cliente_id=$2', [id, clienteId]);
  const cuna = rows[0];
  await query('DELETE FROM cunas WHERE id=$1 AND cliente_id=$2', [id, clienteId]);

  // Se lleva también su playlist en AzuraCast: si no, queda programada y la
  // cuña seguiría sonando aunque el cliente la haya borrado del panel.
  if (cuna) {
    try {
      const cliente = await clienteModel.findById(clienteId);
      if (cliente?.azuracast_station_id) {
        const az = await azuracast.paraServidorId(cliente.servidor_id);
        // Una cuña puede tener varias playlists (una por minuto): se van todas.
        await limpiarPlaylistsSobrantes(az, cliente.azuracast_station_id, cuna, new Map());
      }
    } catch (e) { console.error('[cuna] borrar playlist:', e.message); }
  }
}

/** Reproduce una cuña ahora (botón "Probar" del panel). */
async function probar(cliente, id) {
  const { rows } = await query('SELECT media_id FROM cunas WHERE id=$1 AND cliente_id=$2', [id, cliente.id]);
  if (!rows[0]?.media_id) return { ok: false, error: 'La cuña no tiene audio todavía (guarda texto o sube un MP3).' };

  const az = await azuracast.paraServidorId(cliente.servidor_id);
  const stationId = cliente.azuracast_station_id;
  const files = (await az.listMedia(stationId)) || [];
  const f = files.find((x) => x.unique_id === rows[0].media_id || String(x.id) === String(rows[0].media_id));
  if (!f) return { ok: false, error: 'No encontré el audio de la cuña en la radio.' };

  const r = await prog.reproducirAhora(az, stationId, f.id);
  return { ok: true, segundos: r.segundos };
}

/**
 * Reconstruye en AzuraCast la programación de TODAS las cuñas de un cliente.
 * La usa el script de migración y sirve para reparar una estación a mano.
 */
async function resincronizarCliente(cliente) {
  const { rows } = await query('SELECT * FROM cunas WHERE cliente_id = $1 ORDER BY id', [cliente.id]);
  const vivas = new Set(rows.map((c) => String(c.id)));

  for (const cuna of rows) await sincronizar(cliente, cuna);

  // Borra playlists `📣 … #<id>` de cuñas que ya no existen en la BD.
  const az = await azuracast.paraServidorId(cliente.servidor_id);
  const pls = (await az.getPlaylists(cliente.azuracast_station_id)) || [];
  for (const p of pls) {
    const m = RX_PLAYLIST_CUNA.exec(p.name || '');
    if (m && !vivas.has(m[1])) {
      await az.deletePlaylist(cliente.azuracast_station_id, p.id).catch(() => {});
    }
  }
  return rows.length;
}

module.exports = { listar, guardar, subirAudio, borrar, probar, sincronizar, resincronizarCliente, nombrePlaylist, RX_PLAYLIST_CUNA };
