/**
 * routes/cliente.js
 * ------------------------------------------------------------------
 * Panel Cliente — rutas montadas bajo /cliente
 * Cada cliente solo accede a SU estación. El cliente_id viaja dentro
 * del token (nunca se confía en un id enviado por el frontend).
 * Ahora con PostgreSQL real vía la capa de modelos.
 * ------------------------------------------------------------------
 */

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const userModel = require('../models/userModel');
const clienteModel = require('../models/clienteModel');
const mediaModel = require('../models/mediaModel');
const { generateToken } = require('../services/auth');
const azuracast = require('../services/azuracast');
const authFactory = require('../middleware/auth');
const isCliente = require('../middleware/isCliente');

const router = express.Router();

const requireCliente = [authFactory('cliente'), isCliente];

// Subida de archivos en memoria (máx 60 MB, solo audio)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/audio\/(mpeg|mp3)|\.mp3$/i.test(file.mimetype + file.originalname)) cb(null, true);
    else cb(new Error('Solo se permiten archivos MP3'));
  },
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Obtiene el cliente asociado al token actual (cliente_id va en el JWT). */
function getCliente(req) {
  return clienteModel.findById(req.user.cliente_id);
}

// ==================================================================
//  AUTENTICACIÓN
// ==================================================================

router.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email y password son requeridos' });
  }

  const user = await userModel.findByEmailAndRole(email, 'cliente');
  if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

  const cliente = await clienteModel.findByUserId(user.id);
  if (!cliente) return res.status(403).json({ error: 'El usuario no tiene un cliente asociado' });
  if (!cliente.activo) return res.status(403).json({ error: 'Cuenta desactivada. Contacta al administrador.' });

  const token = generateToken(user.id, 'cliente', { cliente_id: cliente.id });
  res.json({
    token,
    user: { id: user.id, email: user.email, role: user.role, cliente_id: cliente.id },
  });
}));

router.post('/logout', requireCliente, (req, res) => {
  res.json({ message: 'Sesión cerrada. Elimina el token en el cliente.' });
});

router.get('/perfil', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  const user = await userModel.findById(cliente.user_id);

  res.json({
    perfil: {
      email: user?.email,
      nombre_empresa: cliente.nombre_empresa,
      plan: cliente.plan,
      created_at: cliente.created_at,
      activo: cliente.activo,
    },
  });
}));

// ==================================================================
//  MI ESTACIÓN
// ==================================================================

router.get('/mi-estacion', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const base = {
    nombre: cliente.nombre_empresa,
    plan: cliente.plan,
    url_streaming: cliente.url_streaming,
    azuracast_station_id: cliente.azuracast_station_id,
  };

  if (!cliente.azuracast_station_id) {
    return res.json({ estacion: { ...base, aviso: 'Estación aún no aprovisionada en AzuraCast.' } });
  }

  try {
    const station = await azuracast.getStation(cliente.azuracast_station_id);
    res.json({ estacion: { ...base, azuracast: station } });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
}));

router.get('/nowplaying', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const stationId = cliente.azuracast_station_id || 1;
  try {
    const data = await azuracast.getNowPlaying(stationId);
    res.json({ nowplaying: data });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
}));

router.put('/mi-estacion', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const { nombre } = req.body || {};
  const actualizado = await clienteModel.update(cliente.id, { nombre_empresa: nombre });
  res.json({ message: 'Estación actualizada ✅', estacion: { nombre: actualizado.nombre_empresa } });
}));

// ==================================================================
//  CONECTAR DJ EN VIVO
// ==================================================================

/**
 * GET /cliente/configurar-dj
 * Datos para conectar software de transmisión (BUTT, Mixxx, OBS…) desde el PC.
 */
router.get('/configurar-dj', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  if (!cliente.dj_usuario) {
    return res.json({
      disponible: false,
      mensaje: 'Tu plan no incluye DJ en vivo. Usa el AutoDJ subiendo tu música.',
    });
  }

  // host = dominio de AzuraCast sin el protocolo
  const host = (process.env.AZURACAST_BASE_URL || '').replace(/^https?:\/\//, '');

  res.json({
    disponible: true,
    servidor: host,
    puerto: cliente.dj_puerto,
    punto_montaje: '/', // mount de FUENTE para transmitir (AzuraCast dj_mount_point)
    usuario: cliente.dj_usuario,
    password: cliente.dj_password,
    formato: 'MP3',
    protocolo: 'Icecast 2',
    url_escucha: cliente.url_streaming, // donde los oyentes sintonizan
  });
}));

// ==================================================================
//  MEDIA (listado; el upload con multer llega en el siguiente paso)
// ==================================================================

/** GET /cliente/media — lista las canciones de su estación (en vivo desde AzuraCast) */
router.get('/media', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (!cliente.azuracast_station_id) return res.json({ media: [] });

  const archivos = await azuracast.listMedia(cliente.azuracast_station_id);
  const media = (archivos || []).map((f) => ({
    id: f.id,
    titulo: f.title || f.path,
    artista: f.artist || '',
    duracion: f.length_text || '',
    playlists: (f.playlists || []).map((p) => ({ id: p.id, nombre: p.name })),
  }));
  res.json({ media });
}));

/**
 * POST /cliente/media/subir — sube un MP3 y lo asigna a la playlist del AutoDJ.
 * form-data: campo "archivo"
 */
router.post('/media/subir', requireCliente, upload.single('archivo'), wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (!cliente.azuracast_station_id) return res.status(400).json({ error: 'Tu estación aún no está lista' });
  if (!req.file) return res.status(400).json({ error: 'No se envió ningún archivo' });

  const stationId = cliente.azuracast_station_id;
  const base64 = req.file.buffer.toString('base64');
  const media = await azuracast.uploadMedia(stationId, req.file.originalname, base64);

  // Asignar a la playlist elegida (o a la default) para que el AutoDJ la reproduzca (no fatal)
  try {
    const destinoId = req.body?.playlist_id ? Number(req.body.playlist_id) : null;
    const playlists = await azuracast.getPlaylists(stationId);
    const destino = (destinoId && playlists.find((p) => p.id === destinoId))
      || playlists.find((p) => p.is_enabled && p.type === 'default')
      || playlists.find((p) => p.is_enabled) || playlists[0];
    if (destino) await azuracast.setFilePlaylists(stationId, media.id, [destino.id]);
  } catch (err) {
    console.error('[media] no se pudo asignar a playlist:', err.message);
  }

  res.status(201).json({
    message: 'Canción subida ✅',
    media: { id: media.id, titulo: media.title || media.path, duracion: media.length_text },
  });
}));

/** DELETE /cliente/media/:id — elimina una canción */
router.delete('/media/:id', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (!cliente.azuracast_station_id) return res.status(400).json({ error: 'Sin estación' });
  await azuracast.deleteMedia(cliente.azuracast_station_id, req.params.id);
  res.json({ message: 'Canción eliminada ✅' });
}));

/** PUT /cliente/media/:id/playlists — asigna la canción a playlists (body: { playlist_ids: [] }) */
router.put('/media/:id/playlists', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.status(400).json({ error: 'Sin estación' });
  const ids = (req.body?.playlist_ids || []).map(Number);
  await azuracast.setFilePlaylists(cliente.azuracast_station_id, req.params.id, ids);
  res.json({ message: 'Playlists actualizadas ✅' });
}));

// ==================================================================
//  PLAYLISTS (música general, jingles/spots, programas por horario)
// ==================================================================

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']; // 1..7

/** "HH:MM" -> entero HHMM (ej. "09:30" -> 930). */
function horaAInt(str) {
  const [h, m] = String(str).split(':').map(Number);
  return (h || 0) * 100 + (m || 0);
}

/** Traduce una playlist de AzuraCast a una forma amigable para el frontend. */
function mapPlaylist(p) {
  let tipo = 'general';
  if (p.is_jingle || p.type === 'once_per_x_songs' || p.type === 'once_per_x_minutes') tipo = 'jingle';
  else if ((p.schedule_items || []).length) tipo = 'programa';
  const h = (p.schedule_items || [])[0];
  return {
    id: p.id,
    nombre: p.name,
    activa: p.is_enabled,
    tipo,
    orden: p.order === 'sequential' ? 'orden' : 'aleatorio',
    cada_canciones: p.play_per_songs || 4,
    dias: h?.days || [1, 2, 3, 4, 5],
    hora_inicio: h ? intAHora(h.start_time) : '09:00',
    hora_fin: h ? intAHora(h.end_time) : '11:00',
    horario: (p.schedule_items || []).map((s) => ({
      dias: s.days || [],
      inicio: intAHora(s.start_time),
      fin: intAHora(s.end_time),
    })),
  };
}

/** entero HHMM -> "HH:MM" */
function intAHora(n) {
  return String(Math.floor(n / 100)).padStart(2, '0') + ':' + String(n % 100).padStart(2, '0');
}

/** Construye el payload de AzuraCast a partir de campos amigables. */
function payloadPlaylist({ nombre, tipo, orden, activa, cada_canciones, dias, hora_inicio, hora_fin }) {
  const p = {};
  if (nombre !== undefined) p.name = nombre;
  if (orden !== undefined) p.order = orden === 'orden' ? 'sequential' : 'shuffle';
  if (activa !== undefined) p.is_enabled = Boolean(activa);
  if (tipo !== undefined) {
    if (tipo === 'jingle') {
      p.type = 'once_per_x_songs';
      p.play_per_songs = Number(cada_canciones) || 4;
      p.is_jingle = true;
    } else {
      p.type = 'default';
      p.is_jingle = false;
    }
    // El horario solo aplica a "programa"; si cambia a otro tipo se limpia
    if (tipo === 'programa' && Array.isArray(dias) && dias.length && hora_inicio && hora_fin) {
      p.schedule_items = [{ start_time: horaAInt(hora_inicio), end_time: horaAInt(hora_fin), days: dias.map(Number), loop_once: false }];
    } else {
      p.schedule_items = [];
    }
  }
  return p;
}

/** GET /cliente/playlists */
router.get('/playlists', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.json({ playlists: [] });
  const pls = await azuracast.getPlaylists(cliente.azuracast_station_id);
  res.json({ playlists: (pls || []).map(mapPlaylist), dias: DIAS });
}));

/**
 * POST /cliente/playlists
 * body: { nombre, tipo: 'general'|'jingle'|'programa',
 *         cada_canciones?, dias?: [1..7], hora_inicio?, hora_fin? }
 */
router.post('/playlists', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.status(400).json({ error: 'Tu estación aún no está lista' });
  const stationId = cliente.azuracast_station_id;

  const { nombre, tipo = 'general' } = req.body || {};
  if (!nombre) return res.status(400).json({ error: 'El nombre es requerido' });

  // Crear con lo básico y luego aplicar todo por PUT (el POST no guarda el horario)
  const pl = await azuracast.createPlaylist(stationId, { name: nombre, is_enabled: true });
  const full = payloadPlaylist({ activa: true, ...req.body, nombre, tipo });
  await azuracast.updatePlaylist(stationId, pl.id, full);

  res.status(201).json({ message: 'Playlist creada ✅', playlist: { id: pl.id, nombre, tipo } });
}));

/** PUT /cliente/playlists/:id — editar (nombre, tipo, orden, horario…) o activar/pausar */
router.put('/playlists/:id', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.status(400).json({ error: 'Sin estación' });
  const fields = payloadPlaylist(req.body || {});
  await azuracast.updatePlaylist(cliente.azuracast_station_id, req.params.id, fields);
  res.json({ message: 'Playlist actualizada ✅' });
}));

/** DELETE /cliente/playlists/:id */
router.delete('/playlists/:id', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.status(400).json({ error: 'Sin estación' });
  await azuracast.deletePlaylist(cliente.azuracast_station_id, req.params.id);
  res.json({ message: 'Playlist eliminada ✅' });
}));

// ==================================================================
//  ESTADÍSTICAS PERSONALES (mock por ahora)
// ==================================================================

/** Extrae puntos {x,y} de una gráfica de AzuraCast de forma defensiva. */
function puntos(chart) {
  const data = chart?.metrics?.[0]?.data || [];
  return data.map((p) => {
    if (Array.isArray(p)) return { x: p[0], y: Number(p[1]) || 0 };
    return { x: p.x ?? p.label ?? '', y: Number(p.y ?? p.value ?? 0) || 0 };
  });
}

/** GET /cliente/estadisticas — oyentes en vivo + audiencia + canciones top */
router.get('/estadisticas', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) {
    return res.json({ oyentes_ahora: 0, pico: 0, por_hora: [], por_dia: [], top_canciones: [] });
  }
  const stationId = cliente.azuracast_station_id;

  let oyentes_ahora = 0;
  try {
    const np = await azuracast.getNowPlaying(stationId);
    oyentes_ahora = np?.listeners?.current || 0;
  } catch (_) {}

  let por_hora = [], por_dia = [], top_canciones = [];
  try {
    const charts = await azuracast.getCharts(stationId);
    por_hora = puntos(charts?.hourly);
    por_dia = puntos(charts?.daily);
  } catch (_) {}
  try {
    const bw = await azuracast.getBestWorst(stationId);
    top_canciones = (bw?.mostPlayed || []).slice(0, 10).map((s) => ({
      titulo: s.song?.title || s.title || s.song?.text || 'Desconocida',
      artista: s.song?.artist || s.artist || '',
      reproducciones: s.num_plays ?? s.plays ?? 0,
    }));
  } catch (_) {}

  const pico = por_hora.reduce((m, p) => Math.max(m, p.y), 0);
  res.json({ oyentes_ahora, pico, por_hora, por_dia, top_canciones });
}));

/** GET /cliente/oyentes — lista de oyentes en vivo (país, ciudad, coords, dispositivo, tiempo) */
router.get('/oyentes', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.json({ oyentes: [] });
  const lista = await azuracast.getListeners(cliente.azuracast_station_id);
  const oyentes = (lista || []).map((l) => ({
    pais: l.location?.country || l.location?.description || '—',
    ciudad: l.location?.city || '',
    lat: l.location?.lat ?? null,
    lon: l.location?.lon ?? null,
    dispositivo: l.device?.client || (l.device?.is_mobile ? 'Móvil' : 'Escritorio'),
    conectado_seg: l.connected_time || 0,
  }));
  res.json({ total: oyentes.length, oyentes });
}));

/** POST /cliente/saltar — salta la canción que está sonando ahora */
router.post('/saltar', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.status(400).json({ error: 'Sin estación' });
  await azuracast.skipSong(cliente.azuracast_station_id);
  res.json({ message: 'Canción saltada ✅' });
}));

// ==================================================================
//  CONFIGURACIÓN DE LA CUENTA / RADIO
// ==================================================================

/** GET /cliente/configuracion */
router.get('/configuracion', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  const user = await userModel.findById(req.user.sub);
  if (!cliente?.azuracast_station_id) {
    return res.json({ config: { email: user?.email, plan: cliente?.plan, sin_estacion: true } });
  }
  const st = await azuracast.getStationAdmin(cliente.azuracast_station_id);
  res.json({
    config: {
      email: user?.email,
      plan: cliente.plan,
      nombre: st.name,
      descripcion: st.description || '',
      genero: st.genre || '',
      sitio_web: st.url || '',
      timezone: st.timezone || 'UTC',
      pagina_publica: st.enable_public_page,
      permite_solicitudes: st.enable_requests,
      url_publica: `${process.env.AZURACAST_BASE_URL}/public/${st.short_name}`,
    },
  });
}));

/** PUT /cliente/configuracion — edita perfil de la radio */
router.put('/configuracion', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.status(400).json({ error: 'Tu estación aún no está lista' });
  const { nombre, descripcion, genero, sitio_web, timezone, pagina_publica, permite_solicitudes } = req.body || {};
  const fields = {};
  if (nombre !== undefined) fields.name = nombre;
  if (descripcion !== undefined) fields.description = descripcion;
  if (genero !== undefined) fields.genre = genero;
  if (sitio_web !== undefined) fields.url = sitio_web;
  if (timezone !== undefined) fields.timezone = timezone;
  if (pagina_publica !== undefined) fields.enable_public_page = Boolean(pagina_publica);
  if (permite_solicitudes !== undefined) fields.enable_requests = Boolean(permite_solicitudes);
  await azuracast.updateStation(cliente.azuracast_station_id, fields);
  if (nombre !== undefined) await clienteModel.update(cliente.id, { nombre_empresa: nombre });
  res.json({ message: 'Configuración guardada ✅' });
}));

/** PUT /cliente/cuenta/password — cambia la contraseña de acceso al panel */
router.put('/cuenta/password', requireCliente, wrap(async (req, res) => {
  const { actual, nueva } = req.body || {};
  if (!actual || !nueva) return res.status(400).json({ error: 'Contraseña actual y nueva son requeridas' });
  if (String(nueva).length < 6) return res.status(400).json({ error: 'La nueva debe tener al menos 6 caracteres' });
  const user = await userModel.findById(req.user.sub);
  const ok = await bcrypt.compare(actual, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'La contraseña actual no es correcta' });
  await userModel.updatePassword(user.id, await bcrypt.hash(nueva, 10));
  res.json({ message: 'Contraseña actualizada ✅' });
}));

/** POST /cliente/dj/regenerar — genera una nueva contraseña de DJ */
router.post('/dj/regenerar', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.status(400).json({ error: 'Sin estación' });
  const streamers = await azuracast.getStreamers(cliente.azuracast_station_id);
  const st = streamers.find((s) => s.streamer_username === cliente.dj_usuario) || streamers[0];
  if (!st) return res.status(400).json({ error: 'Tu plan no incluye DJ en vivo' });
  const nueva = crypto.randomBytes(6).toString('hex');
  await azuracast.updateStreamer(cliente.azuracast_station_id, st.id, { streamer_password: nueva });
  await clienteModel.update(cliente.id, { dj_password: nueva });
  res.json({ message: 'Contraseña de DJ regenerada ✅', password: nueva });
}));

// ==================================================================
//  REPRODUCTOR / EMBED PARA LA WEB DEL CLIENTE
// ==================================================================

/** GET /cliente/reproductor — datos y links para poner la radio en su web */
router.get('/reproductor', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.json({ reproductor: null });
  const st = await azuracast.getStation(cliente.azuracast_station_id);
  const shortcode = st.shortcode || st.short_name;
  res.json({
    reproductor: {
      shortcode,
      nombre: cliente.nombre_empresa,
      stream_url: st.listen_url || `${process.env.AZURACAST_BASE_URL}/listen/${shortcode}/radio.mp3`,
      pls_url: st.playlist_pls_url || null,
      m3u_url: st.playlist_m3u_url || null,
    },
  });
}));

// ==================================================================
//  AUTODJ
// ==================================================================

/** GET /cliente/autodj */
router.get('/autodj', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.json({ autodj: null });
  const st = await azuracast.getStationAdmin(cliente.azuracast_station_id);
  const bc = st.backend_config || {};
  res.json({
    autodj: {
      crossfade_tipo: bc.crossfade_type || 'normal',
      crossfade_seg: bc.crossfade ?? 2,
      evitar_repetir_min: Math.round((bc.duplicate_prevention_time_range ?? 120) / 60),
      cola: bc.autodj_queue_length ?? 3,
    },
  });
}));

/** PUT /cliente/autodj */
router.put('/autodj', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.status(400).json({ error: 'Sin estación' });
  const { crossfade_tipo, crossfade_seg, evitar_repetir_min, cola } = req.body || {};
  const backend_config = {};
  if (crossfade_tipo !== undefined) backend_config.crossfade_type = crossfade_tipo;
  if (crossfade_seg !== undefined) backend_config.crossfade = Number(crossfade_seg);
  if (evitar_repetir_min !== undefined) backend_config.duplicate_prevention_time_range = Number(evitar_repetir_min) * 60;
  if (cola !== undefined) backend_config.autodj_queue_length = Number(cola);
  await azuracast.updateStation(cliente.azuracast_station_id, { backend_config });
  res.json({ message: 'AutoDJ actualizado ✅' });
}));

module.exports = router;
