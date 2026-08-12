/**
 * services/cunas.js — cuñas / anuncios programados
 * ------------------------------------------------------------------
 * El cliente crea "cuñas": mensajes propios que suenan a horas fijas.
 *   - tipo 'texto' → se genera con voz (TTS) UNA vez y se guarda en AzuraCast.
 *   - tipo 'audio' → el cliente sube su MP3 (su locutor) y se guarda en AzuraCast.
 * En ambos casos la cuña queda como un `media_id` (archivo en AzuraCast); el
 * planificador solo lo pide (request) a las horas configuradas. Suena en la
 * emisión respetando la canción (salta para que sea puntual).
 *
 * Horas: lista de "HH:MM" (ej. ["08:00","12:00","20:00"]).
 * ------------------------------------------------------------------
 */
const { query } = require('../config/database');
const clienteModel = require('../models/clienteModel');
const azuracast = require('./azuracast');
const { generarVoz, verConfig, programarRetiro } = require('./anuncioHora');

const PLAYLIST = '📣 Cuñas';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Inyección en AzuraCast --------------------------------------
async function playlistCunas(az, stationId) {
  const pls = (await az.getPlaylists(stationId)) || [];
  const existe = pls.find((p) => p.name === PLAYLIST);
  // JINGLE (suena puntual entre canciones). Se activa con un reinicio único de
  // la estación (scripts/activar-jingles.js). La cuña se mete a la playlist solo
  // al sonar y se saca tras sonar una vez (ver reproducir).
  if (existe) {
    if (!existe.is_jingle || !existe.is_enabled || existe.play_per_songs !== 1) {
      await az.updatePlaylist(stationId, existe.id, { is_jingle: true, is_enabled: true, play_per_songs: 1, include_in_requests: false }).catch(() => {});
    }
    return existe.id;
  }
  const pl = await az.createPlaylist(stationId, {
    name: PLAYLIST, type: 'default', source: 'songs',
    is_jingle: true, is_enabled: true, play_per_songs: 1, include_in_requests: false, include_in_on_demand: false, weight: 1,
  });
  return pl.id;
}

/** Sube un MP3 (Buffer) y devuelve su media id. NO lo deja en la playlist: la
 *  cuña se mete a la playlist solo cuando toca sonar (reproducir). */
async function subirMedia(az, stationId, buffer, nombre) {
  const media = await az.uploadMedia(stationId, nombre, buffer.toString('base64'));
  return media.unique_id || media.id;
}

/** Pone a sonar una cuña: la mete a la jingle y en segundo plano la saca tras
 *  sonar una vez (así suena a su hora y no se repite). No borra el media (se reusa). */
async function reproducir(az, stationId, mediaId, { skip = true } = {}) {
  const plId = await playlistCunas(az, stationId);
  const files = (await az.listMedia(stationId)) || [];
  const f = files.find((x) => x.unique_id === mediaId || String(x.id) === String(mediaId));
  if (!f) { console.error('[cuna] no encontré el media', mediaId); return; }
  await az.setFilePlaylists(stationId, f.id, [plId]);            // queda como jingle
  programarRetiro(az, stationId, f.id, {})                       // sin borrar (se reutiliza)
    .catch((e) => console.error('[cuna] retiro:', e.message));
}

// ---- CRUD ---------------------------------------------------------
function normHoras(horas) {
  return (Array.isArray(horas) ? horas : [])
    .map((h) => String(h).trim())
    .filter((h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h));
}

async function listar(clienteId) {
  const { rows } = await query('SELECT id, nombre, tipo, texto, horas, activo, (media_id IS NOT NULL) AS lista FROM cunas WHERE cliente_id = $1 ORDER BY id', [clienteId]);
  return rows;
}

/** Crea o actualiza una cuña. Para tipo 'texto' regenera la voz si cambió. */
async function guardar(cliente, { id, nombre, tipo, texto, horas, activo }) {
  const t = tipo === 'audio' ? 'audio' : 'texto';
  const hrs = JSON.stringify(normHoras(horas));
  const stationId = cliente.azuracast_station_id;
  const voz = (await verConfig(cliente.id).catch(() => ({}))).voz;   // misma voz que el anuncio de hora

  if (id) {
    const { rows } = await query('SELECT * FROM cunas WHERE id = $1 AND cliente_id = $2', [id, cliente.id]);
    const prev = rows[0];
    if (!prev) throw new Error('Cuña no encontrada');
    let media_id = prev.media_id;
    // Si es texto y cambió el texto, regenera la voz
    if (t === 'texto' && texto && texto !== prev.texto) {
      const az = await azuracast.paraServidorId(cliente.servidor_id);
      media_id = await subirMedia(az, stationId, await generarVoz(texto, { voz }), `cuna-${cliente.id}-${id}.mp3`);
    }
    await query(
      'UPDATE cunas SET nombre=$1, tipo=$2, texto=$3, horas=$4, activo=$5, media_id=$6, updated_at=now() WHERE id=$7',
      [nombre || prev.nombre, t, t === 'texto' ? (texto ?? prev.texto) : prev.texto, hrs, activo !== false, media_id, id]
    );
    return id;
  }

  // Nueva
  let media_id = null;
  if (t === 'texto' && texto) {
    const az = await azuracast.paraServidorId(cliente.servidor_id);
    // se sube tras crear la fila para nombrar el archivo con el id; aquí subimos genérico
    media_id = await subirMedia(az, stationId, await generarVoz(texto, { voz }), `cuna-${cliente.id}-nueva.mp3`);
  }
  const { rows } = await query(
    'INSERT INTO cunas (cliente_id, nombre, tipo, texto, horas, activo, media_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [cliente.id, nombre || 'Cuña', t, t === 'texto' ? texto : null, hrs, activo !== false, media_id]
  );
  return rows[0].id;
}

/** Sube el audio (Buffer) de una cuña 'audio' y guarda su media_id. */
async function subirAudio(cliente, cunaId, buffer, nombreArchivo) {
  const { rows } = await query('SELECT * FROM cunas WHERE id=$1 AND cliente_id=$2', [cunaId, cliente.id]);
  if (!rows[0]) throw new Error('Cuña no encontrada');
  const az = await azuracast.paraServidorId(cliente.servidor_id);
  const media_id = await subirMedia(az, cliente.azuracast_station_id, buffer, `cuna-${cliente.id}-${cunaId}.mp3`);
  await query('UPDATE cunas SET tipo=$1, media_id=$2, updated_at=now() WHERE id=$3', ['audio', media_id, cunaId]);
  return media_id;
}

async function borrar(clienteId, id) {
  await query('DELETE FROM cunas WHERE id=$1 AND cliente_id=$2', [id, clienteId]);
}

/** Reproduce una cuña ahora (prueba). */
async function probar(cliente, id) {
  const { rows } = await query('SELECT media_id FROM cunas WHERE id=$1 AND cliente_id=$2', [id, cliente.id]);
  if (!rows[0]?.media_id) return { ok: false, error: 'La cuña no tiene audio todavía (guarda texto o sube un MP3).' };
  const az = await azuracast.paraServidorId(cliente.servidor_id);
  await reproducir(az, cliente.azuracast_station_id, rows[0].media_id, { skip: true });
  return { ok: true };
}

// ---- Planificador -------------------------------------------------
const { partesEnZona } = require('./zonaHoraria');
let timer = null;
const ultimoPorCuna = new Map();   // cuña id -> "HH:MM" ya evaluado este minuto

async function tick() {
  if (new Date().getSeconds() > 20) return;
  try {
    // La hora se compara en la ZONA del cliente (no la del servidor). El
    // LEFT JOIN trae su zona de anuncio_hora (por defecto America/Bogota).
    const { rows } = await query(
      `SELECT c.*, cl.servidor_id, cl.azuracast_station_id,
              COALESCE(ah.zona_horaria, 'America/Bogota') AS zona
         FROM cunas c
         JOIN clientes cl ON cl.id = c.cliente_id
         LEFT JOIN anuncio_hora ah ON ah.cliente_id = cl.id
        WHERE c.activo = true AND cl.activo = true AND cl.azuracast_station_id IS NOT NULL`);
    for (const c of rows) {
      const { hora, minuto } = partesEnZona(c.zona);
      const hhmm = `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
      if (ultimoPorCuna.get(c.id) === hhmm) continue;   // ya evaluada este minuto
      ultimoPorCuna.set(c.id, hhmm);
      const horas = Array.isArray(c.horas) ? c.horas : [];
      if (!horas.includes(hhmm) || !c.media_id) continue;
      const az = await azuracast.paraServidorId(c.servidor_id);
      // skip:false → no corta la canción actual; la cuña suena al terminar.
      reproducir(az, c.azuracast_station_id, c.media_id, { skip: false })
        .then(() => console.log(`[cuna] ${c.nombre} sonó (${hhmm})`))
        .catch((e) => console.error('[cuna]', c.nombre, e.message));
    }
  } catch (e) { console.error('[cuna] tick:', e.message); }
}

function iniciar() {
  if (timer) return;
  timer = setInterval(() => tick().catch((e) => console.error('[cuna]', e.message)), 15000);
  console.log('📣 Cuñas programadas activas (revisa cada 15s las horas configuradas)');
}

module.exports = { iniciar, listar, guardar, subirAudio, borrar, probar };
