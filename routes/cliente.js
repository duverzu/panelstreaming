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

router.get('/estadisticas', requireCliente, (req, res) => {
  res.json({
    oyentes_hoy: 0,
    oyentes_semana: 0,
    oyentes_mes: 0,
    cancion_mas_escuchada: null,
    pico_audiencia: 0,
  });
});

router.get('/estadisticas/historico', requireCliente, (req, res) => {
  res.json({ historico: [] });
});

module.exports = router;
