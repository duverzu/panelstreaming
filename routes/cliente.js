/**
 * routes/cliente.js
 * ------------------------------------------------------------------
 * Panel Cliente — rutas montadas bajo /cliente
 * Cada cliente solo accede a SU estación. Las llamadas a AzuraCast se
 * enrutan al SERVIDOR de esa radio (multi-servidor) vía `az`.
 * ------------------------------------------------------------------
 */

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const userModel = require('../models/userModel');
const clienteModel = require('../models/clienteModel');
const { generateToken } = require('../services/auth');
const azuracast = require('../services/azuracast');
const publico = require('../services/publico');
const planModel = require('../models/planModel');
const consumoClienteModel = require('../models/consumoClienteModel');
const playerExterno = require('../services/playerExterno');
const videoNode = require('../services/videoNode');
const servidorModel = require('../models/servidorModel');
const nowplayingSvc = require('../services/nowplaying');
const authFactory = require('../middleware/auth');
const isCliente = require('../middleware/isCliente');

const router = express.Router();
const requireCliente = [authFactory('cliente'), isCliente];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/audio\/(mpeg|mp3)|\.mp3$/i.test(file.mimetype + file.originalname)) cb(null, true);
    else cb(new Error('Solo se permiten archivos MP3'));
  },
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Bytes a algo legible (B/KB/MB/GB/TB). */
function humanBytes(n) {
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let v = Number(n) || 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return v.toFixed(1) + ' ' + u[i];
}

/** Cliente del token. */
function getCliente(req) {
  return clienteModel.findById(req.user.cliente_id);
}
/** Cliente AzuraCast del servidor de esa radio. */
function azDe(cliente) {
  return azuracast.paraServidorId(cliente?.servidor_id);
}

// ==================================================================
//  AUTENTICACIÓN
// ==================================================================
router.post('/login', wrap(async (req, res) => {
  const { usuario, email, password } = req.body || {};
  const identificador = (usuario || email || '').trim();
  if (!identificador || !password) return res.status(400).json({ error: 'usuario y password son requeridos' });
  const user = await userModel.findByLogin(identificador);
  if (!user || user.role !== 'cliente') return res.status(401).json({ error: 'Credenciales inválidas' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });
  const cliente = await clienteModel.findByUserId(user.id);
  if (!cliente) return res.status(403).json({ error: 'El usuario no tiene un cliente asociado' });
  if (!cliente.activo) return res.status(403).json({ error: 'Cuenta desactivada. Contacta al administrador.' });
  const token = generateToken(user.id, 'cliente', { cliente_id: cliente.id });
  res.json({ token, user: { id: user.id, email: user.email, role: user.role, cliente_id: cliente.id } });
}));

router.post('/logout', requireCliente, (req, res) => res.json({ message: 'Sesión cerrada.' }));

router.get('/perfil', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  const user = await userModel.findById(cliente.user_id);
  res.json({ perfil: { username: user?.username, email: user?.email, nombre_empresa: cliente.nombre_empresa, plan: cliente.plan, created_at: cliente.created_at, activo: cliente.activo } });
}));

// ==================================================================
//  MI ESTACIÓN
// ==================================================================
router.get('/mi-estacion', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  const base = { nombre: cliente.nombre_empresa, plan: cliente.plan, url_streaming: cliente.url_streaming, azuracast_station_id: cliente.azuracast_station_id };
  if (!cliente.azuracast_station_id) return res.json({ estacion: { ...base, aviso: 'Estación aún no aprovisionada.' } });
  try {
    const az = await azDe(cliente);
    const station = await az.getStation(cliente.azuracast_station_id);
    res.json({ estacion: { ...base, azuracast: station } });
  } catch (err) { res.status(err.status || 502).json({ error: err.message }); }
}));

router.get('/nowplaying', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.json({ nowplaying: null });
  try {
    const az = await azDe(cliente);
    const np = await az.getNowPlaying(cliente.azuracast_station_id);
    res.json({ nowplaying: np, estado: nowplayingSvc.normalizar(np) });
  } catch (err) { res.status(err.status || 502).json({ error: err.message }); }
}));

router.put('/mi-estacion', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  const actualizado = await clienteModel.update(cliente.id, { nombre_empresa: req.body?.nombre });
  res.json({ message: 'Estación actualizada ✅', estacion: { nombre: actualizado.nombre_empresa } });
}));

// ==================================================================
//  CONECTAR DJ EN VIVO
// ==================================================================
router.get('/configurar-dj', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (!cliente.dj_usuario) return res.json({ disponible: false, mensaje: 'Tu plan no incluye DJ en vivo. Usa el AutoDJ subiendo tu música.' });
  const host = publico.host(await publico.deCliente(cliente));
  res.json({
    disponible: true, servidor: host, puerto: cliente.dj_puerto, punto_montaje: '/',
    usuario: cliente.dj_usuario, password: cliente.dj_password, formato: 'MP3', protocolo: 'Icecast 2',
    url_escucha: cliente.url_streaming,
  });
}));

// ==================================================================
//  MEDIA
// ==================================================================
router.get('/media', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.json({ media: [] });
  const az = await azDe(cliente);
  const archivos = await az.listMedia(cliente.azuracast_station_id);
  const media = (archivos || []).map((f) => ({
    id: f.id, titulo: f.title || f.path, artista: f.artist || '', duracion: f.length_text || '',
    playlists: (f.playlists || []).map((p) => ({ id: p.id, nombre: p.name })),
  }));
  res.json({ media });
}));

router.post('/media/subir', requireCliente, upload.single('archivo'), wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.status(400).json({ error: 'Tu estación aún no está lista' });
  if (!req.file) return res.status(400).json({ error: 'No se envió ningún archivo' });
  const az = await azDe(cliente);
  const stationId = cliente.azuracast_station_id;
  const media = await az.uploadMedia(stationId, req.file.originalname, req.file.buffer.toString('base64'));
  try {
    const destinoId = req.body?.playlist_id ? Number(req.body.playlist_id) : null;
    const playlists = await az.getPlaylists(stationId);
    const destino = (destinoId && playlists.find((p) => p.id === destinoId))
      || playlists.find((p) => p.is_enabled && p.type === 'default') || playlists.find((p) => p.is_enabled) || playlists[0];
    if (destino) await az.setFilePlaylists(stationId, media.id, [destino.id]);
  } catch (err) { console.error('[media] playlist:', err.message); }
  res.status(201).json({ message: 'Canción subida ✅', media: { id: media.id, titulo: media.title || media.path, duracion: media.length_text } });
}));

router.delete('/media/:id', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.status(400).json({ error: 'Sin estación' });
  const az = await azDe(cliente);
  await az.deleteMedia(cliente.azuracast_station_id, req.params.id);
  res.json({ message: 'Canción eliminada ✅' });
}));

router.put('/media/:id/playlists', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.status(400).json({ error: 'Sin estación' });
  const az = await azDe(cliente);
  await az.setFilePlaylists(cliente.azuracast_station_id, req.params.id, (req.body?.playlist_ids || []).map(Number));
  res.json({ message: 'Playlists actualizadas ✅' });
}));

// ==================================================================
//  PLAYLISTS
// ==================================================================
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
function horaAInt(str) { const [h, m] = String(str).split(':').map(Number); return (h || 0) * 100 + (m || 0); }
function intAHora(n) { return String(Math.floor(n / 100)).padStart(2, '0') + ':' + String(n % 100).padStart(2, '0'); }

function mapPlaylist(p) {
  let tipo = 'general';
  if (p.is_jingle || p.type === 'once_per_x_songs' || p.type === 'once_per_x_minutes') tipo = 'jingle';
  else if ((p.schedule_items || []).length) tipo = 'programa';
  const h = (p.schedule_items || [])[0];
  return {
    id: p.id, nombre: p.name, activa: p.is_enabled, tipo,
    orden: p.order === 'sequential' ? 'orden' : 'aleatorio',
    cada_canciones: p.play_per_songs || 4,
    dias: h?.days || [1, 2, 3, 4, 5],
    hora_inicio: h ? intAHora(h.start_time) : '09:00',
    hora_fin: h ? intAHora(h.end_time) : '11:00',
    horario: (p.schedule_items || []).map((s) => ({ dias: s.days || [], inicio: intAHora(s.start_time), fin: intAHora(s.end_time) })),
  };
}
function payloadPlaylist({ nombre, tipo, orden, activa, cada_canciones, dias, hora_inicio, hora_fin }) {
  const p = {};
  if (nombre !== undefined) p.name = nombre;
  if (orden !== undefined) p.order = orden === 'orden' ? 'sequential' : 'shuffle';
  if (activa !== undefined) p.is_enabled = Boolean(activa);
  if (tipo !== undefined) {
    if (tipo === 'jingle') { p.type = 'once_per_x_songs'; p.play_per_songs = Number(cada_canciones) || 4; p.is_jingle = true; }
    else { p.type = 'default'; p.is_jingle = false; }
    if (tipo === 'programa' && Array.isArray(dias) && dias.length && hora_inicio && hora_fin) {
      p.schedule_items = [{ start_time: horaAInt(hora_inicio), end_time: horaAInt(hora_fin), days: dias.map(Number), loop_once: false }];
    } else { p.schedule_items = []; }
  }
  return p;
}

router.get('/playlists', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.json({ playlists: [] });
  const az = await azDe(cliente);
  const pls = await az.getPlaylists(cliente.azuracast_station_id);
  res.json({ playlists: (pls || []).map(mapPlaylist), dias: DIAS });
}));

router.post('/playlists', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.status(400).json({ error: 'Tu estación aún no está lista' });
  const { nombre, tipo = 'general' } = req.body || {};
  if (!nombre) return res.status(400).json({ error: 'El nombre es requerido' });
  const az = await azDe(cliente);
  const stationId = cliente.azuracast_station_id;
  const pl = await az.createPlaylist(stationId, { name: nombre, is_enabled: true });
  await az.updatePlaylist(stationId, pl.id, payloadPlaylist({ activa: true, ...req.body, nombre, tipo }));
  res.status(201).json({ message: 'Playlist creada ✅', playlist: { id: pl.id, nombre, tipo } });
}));

router.put('/playlists/:id', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.status(400).json({ error: 'Sin estación' });
  const az = await azDe(cliente);
  await az.updatePlaylist(cliente.azuracast_station_id, req.params.id, payloadPlaylist(req.body || {}));
  res.json({ message: 'Playlist actualizada ✅' });
}));

router.delete('/playlists/:id', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.status(400).json({ error: 'Sin estación' });
  const az = await azDe(cliente);
  await az.deletePlaylist(cliente.azuracast_station_id, req.params.id);
  res.json({ message: 'Playlist eliminada ✅' });
}));

// ==================================================================
//  ESTADÍSTICAS
// ==================================================================
function puntos(chart) {
  const data = chart?.metrics?.[0]?.data || [];
  return data.map((p) => (Array.isArray(p) ? { x: p[0], y: Number(p[1]) || 0 } : { x: p.x ?? p.label ?? '', y: Number(p.y ?? p.value ?? 0) || 0 }));
}

router.get('/estadisticas', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.json({ oyentes_ahora: 0, pico: 0, por_hora: [], por_dia: [], top_canciones: [] });
  const az = await azDe(cliente);
  const stationId = cliente.azuracast_station_id;
  let oyentes_ahora = 0;
  try { oyentes_ahora = (await az.getNowPlaying(stationId))?.listeners?.current || 0; } catch (_) {}
  let por_hora = [], por_dia = [], top_canciones = [];
  try { const charts = await az.getCharts(stationId); por_hora = puntos(charts?.hourly); por_dia = puntos(charts?.daily); } catch (_) {}
  try {
    const bw = await az.getBestWorst(stationId);
    top_canciones = (bw?.mostPlayed || []).slice(0, 10).map((s) => ({ titulo: s.song?.title || s.title || 'Desconocida', artista: s.song?.artist || s.artist || '', reproducciones: s.num_plays ?? s.plays ?? 0 }));
  } catch (_) {}
  res.json({ oyentes_ahora, pico: por_hora.reduce((m, p) => Math.max(m, p.y), 0), por_hora, por_dia, top_canciones });
}));


/**
 * GET /cliente/consumo — transferencia y disco de SU radio.
 * La banda sale del Guardián (muestreo de oyentes × bitrate) y el disco de la
 * cuota real de AzuraCast. Es lo que pinta los gráficos del dashboard.
 */
router.get('/consumo', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  const plan = await planModel.findByNombre(cliente?.plan);

  // --- Transferencia (últimos 30 días + total del mes) ---
  const [serie, bandaMes] = await Promise.all([
    consumoClienteModel.serieCliente(cliente.id, 30),
    consumoClienteModel.totalMesCliente(cliente.id),
  ]);

  // --- Disco (cuota real de la estación en AzuraCast) ---
  let disco = { usado_mb: 0, total_mb: plan?.espacio_mb || 0, porcentaje: 0, archivos: 0 };
  if (cliente?.azuracast_station_id) {
    const az = await azDe(cliente);
    try {
      const info = await az.getStationAdmin(cliente.azuracast_station_id);
      const loc = info?.media_storage_location
        ? await az.getStorageLocation(typeof info.media_storage_location === 'object' ? info.media_storage_location.id : info.media_storage_location)
        : null;
      const usadoBytes = Number(loc?.storageUsedBytes ?? loc?.storage_used_bytes ?? 0);
      const totalBytes = Number(loc?.storageQuotaBytes ?? loc?.storage_quota_bytes ?? 0);
      if (usadoBytes) disco.usado_mb = Math.round(usadoBytes / 1048576);
      if (totalBytes) disco.total_mb = Math.round(totalBytes / 1048576);
    } catch (e) { console.error('[consumo] disco:', e.message); }
    try {
      const archivos = await az.listMedia(cliente.azuracast_station_id);
      disco.archivos = (archivos || []).length;
    } catch (_) {}
  }
  disco.porcentaje = disco.total_mb > 0 ? Math.min(100, Math.round((disco.usado_mb / disco.total_mb) * 100)) : 0;

  res.json({
    banda: {
      mes_bytes: bandaMes,
      mes: humanBytes(bandaMes),
      serie: serie.map((d) => ({ fecha: d.fecha, gb: +(d.bytes / 1073741824).toFixed(3) })),
      hay_datos: serie.some((d) => d.bytes > 0),
    },
    disco,
    plan: { nombre: cliente?.plan, max_oyentes: plan?.max_oyentes || null, espacio_mb: plan?.espacio_mb || null },
  });
}));

router.get('/oyentes', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.json({ oyentes: [] });
  const az = await azDe(cliente);
  const lista = await az.getListeners(cliente.azuracast_station_id);
  const oyentes = (lista || []).map((l) => ({
    pais: l.location?.country || l.location?.description || '—', ciudad: l.location?.city || '',
    lat: l.location?.lat ?? null, lon: l.location?.lon ?? null,
    dispositivo: l.device?.client || (l.device?.is_mobile ? 'Móvil' : 'Escritorio'), conectado_seg: l.connected_time || 0,
  }));
  res.json({ total: oyentes.length, oyentes });
}));

router.post('/saltar', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.status(400).json({ error: 'Sin estación' });
  const az = await azDe(cliente);
  await az.skipSong(cliente.azuracast_station_id);
  res.json({ message: 'Canción saltada ✅' });
}));

// ==================================================================
//  CONFIGURACIÓN
// ==================================================================
router.get('/configuracion', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  const user = await userModel.findById(req.user.sub);
  if (!cliente?.azuracast_station_id) return res.json({ config: { username: user?.username, email: user?.email, plan: cliente?.plan, sin_estacion: true } });
  const az = await azDe(cliente);
  const st = await az.getStationAdmin(cliente.azuracast_station_id);
  res.json({
    config: {
      username: user?.username, email: user?.email, plan: cliente.plan, nombre: st.name, descripcion: st.description || '',
      genero: st.genre || '', sitio_web: st.url || '', timezone: st.timezone || 'UTC',
      pagina_publica: st.enable_public_page, permite_solicitudes: st.enable_requests,
      url_publica: `${await publico.deCliente(cliente)}/public/${st.short_name}`,
    },
  });
}));

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
  const az = await azDe(cliente);
  await az.updateStation(cliente.azuracast_station_id, fields);
  if (nombre !== undefined) await clienteModel.update(cliente.id, { nombre_empresa: nombre });
  res.json({ message: 'Configuración guardada ✅' });
}));

router.put('/cuenta/password', requireCliente, wrap(async (req, res) => {
  const { actual, nueva } = req.body || {};
  if (!actual || !nueva) return res.status(400).json({ error: 'Contraseña actual y nueva son requeridas' });
  if (String(nueva).length < 6) return res.status(400).json({ error: 'La nueva debe tener al menos 6 caracteres' });
  const user = await userModel.findById(req.user.sub);
  if (!(await bcrypt.compare(actual, user.password_hash))) return res.status(401).json({ error: 'La contraseña actual no es correcta' });
  await userModel.updatePassword(user.id, await bcrypt.hash(nueva, 10));
  res.json({ message: 'Contraseña actualizada ✅' });
}));

router.post('/dj/regenerar', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.status(400).json({ error: 'Sin estación' });
  const az = await azDe(cliente);
  const streamers = await az.getStreamers(cliente.azuracast_station_id);
  const st = streamers.find((s) => s.streamer_username === cliente.dj_usuario) || streamers[0];
  if (!st) return res.status(400).json({ error: 'Tu plan no incluye DJ en vivo' });
  const nueva = crypto.randomBytes(6).toString('hex');
  await az.updateStreamer(cliente.azuracast_station_id, st.id, { streamer_password: nueva });
  await clienteModel.update(cliente.id, { dj_password: nueva });
  res.json({ message: 'Contraseña de DJ regenerada ✅', password: nueva });
}));

// ==================================================================
//  REDES SOCIALES
// ==================================================================
const REDES_VALIDAS = ['discord', 'telegram', 'twitter', 'mastodon'];

router.get('/redes', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.json({ redes: [] });
  const az = await azDe(cliente);
  const whs = await az.getWebhooks(cliente.azuracast_station_id);
  res.json({ redes: (whs || []).filter((w) => REDES_VALIDAS.includes(w.type)).map((w) => ({ id: w.id, nombre: w.name, tipo: w.type, activa: w.is_enabled })) });
}));

router.post('/redes', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.status(400).json({ error: 'Sin estación' });
  const { tipo, config } = req.body || {};
  if (!REDES_VALIDAS.includes(tipo)) return res.status(400).json({ error: 'Red no soportada' });
  const nombres = { discord: 'Discord', telegram: 'Telegram', twitter: 'Twitter/X', mastodon: 'Mastodon' };
  const az = await azDe(cliente);
  const wh = await az.createWebhook(cliente.azuracast_station_id, { name: nombres[tipo], type: tipo, triggers: ['song_changed'], config: config || {}, is_enabled: true });
  res.status(201).json({ message: 'Red conectada ✅', red: { id: wh.id, tipo } });
}));

router.put('/redes/:id', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.status(400).json({ error: 'Sin estación' });
  const az = await azDe(cliente);
  await az.updateWebhook(cliente.azuracast_station_id, req.params.id, { is_enabled: Boolean(req.body?.activa) });
  res.json({ message: 'Red actualizada ✅' });
}));

router.delete('/redes/:id', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.status(400).json({ error: 'Sin estación' });
  const az = await azDe(cliente);
  await az.deleteWebhook(cliente.azuracast_station_id, req.params.id);
  res.json({ message: 'Red desconectada ✅' });
}));

// ==================================================================
//  REPRODUCTOR / EMBED
// ==================================================================
router.get('/reproductor', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.json({ reproductor: null });
  const az = await azDe(cliente);
  const st = await az.getStation(cliente.azuracast_station_id);
  const shortcode = st.shortcode || st.short_name;
  // Player de la plataforma externa (el que el cliente configura allá).
  // Si existe, es EL player: el del panel queda como alternativa simple.
  const externo = await playerExterno.buscar(cliente.short_name || shortcode);

  res.json({
    reproductor: {
      shortcode, nombre: cliente.nombre_empresa,
      stream_url: `${await publico.deCliente(cliente)}/listen/${shortcode}/radio.mp3`,
      pls_url: st.playlist_pls_url || null, m3u_url: st.playlist_m3u_url || null,
    },
    player_externo: externo,
  });
}));

// ==================================================================
//  AUTODJ
// ==================================================================
/**
 * POST /cliente/player/acceso — enlace de acceso directo a SU player.
 * El cliente solo puede pedir el suyo (sale del token, no del body).
 */
router.post('/player/acceso', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  const user = cliente?.short_name;
  if (!user) return res.status(400).json({ error: 'Tu estación aún no está lista' });

  const url = await playerExterno.magicLink(user);
  if (!url) return res.status(502).json({ error: 'No se pudo generar el acceso. Intenta de nuevo en un momento.' });
  res.json({ url });
}));

router.get('/autodj', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.json({ autodj: null });
  const az = await azDe(cliente);
  const st = await az.getStationAdmin(cliente.azuracast_station_id);
  const bc = st.backend_config || {};
  res.json({ autodj: { crossfade_tipo: bc.crossfade_type || 'normal', crossfade_seg: bc.crossfade ?? 2, evitar_repetir_min: Math.round((bc.duplicate_prevention_time_range ?? 120) / 60), cola: bc.autodj_queue_length ?? 3 } });
}));

router.put('/autodj', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  if (!cliente?.azuracast_station_id) return res.status(400).json({ error: 'Sin estación' });
  const { crossfade_tipo, crossfade_seg, evitar_repetir_min, cola } = req.body || {};
  const backend_config = {};
  if (crossfade_tipo !== undefined) backend_config.crossfade_type = crossfade_tipo;
  if (crossfade_seg !== undefined) backend_config.crossfade = Number(crossfade_seg);
  if (evitar_repetir_min !== undefined) backend_config.duplicate_prevention_time_range = Number(evitar_repetir_min) * 60;
  if (cola !== undefined) backend_config.autodj_queue_length = Number(cola);
  const az = await azDe(cliente);
  await az.updateStation(cliente.azuracast_station_id, { backend_config });
  res.json({ message: 'AutoDJ actualizado ✅' });
}));


// ==================================================================
//  CLIENTE DE VIDEO — sus videos, subida, borrado y datos del canal
// ==================================================================

/** Nodo de video del cliente (o null si su cuenta no es de video). */
async function nodoDe(cliente) {
  if (!cliente || cliente.tipo !== 'video' || !cliente.servidor_id) return null;
  const s = await servidorModel.findById(cliente.servidor_id);
  if (!s || s.tipo !== 'video') return null;
  return { nodo: videoNode.crearCliente(s.url, s.api_key), servidor: s };
}

/** GET /cliente/video — resumen del canal: videos, espacio, consumo, URLs. */
router.get('/video', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  const ctx = await nodoDe(cliente);
  if (!ctx) return res.status(400).json({ error: 'Tu cuenta no es de video' });

  const user = cliente.short_name;
  const [detalle, consumo] = await Promise.all([
    ctx.nodo.cuenta(user),
    ctx.nodo.consumo(user, 30),
  ]);
  if (!detalle) return res.status(502).json({ error: 'No se pudo consultar tu canal ahora mismo. Intenta en un momento.' });

  const publica = (ctx.servidor.url_publica || ctx.servidor.url).replace(/\/+$/, '');
  const puerto = detalle.puertos?.http;
  const base = puerto ? `${publica}:${puerto}` : publica;

  res.json({
    nombre: cliente.nombre_empresa,
    al_aire: detalle.al_aire,
    videos: (detalle.videos || []).map((v) => ({
      nombre: v.nombre, tam_mb: +(v.bytes / 1048576).toFixed(1), modificado: v.modificado,
    })),
    espacio_mb: +(detalle.espacio_bytes / 1048576).toFixed(1),
    urls: {
      canal: `${base}/hybrid/play.m3u8`,     // lo que ponen en su web/app
      emision: `${base}/stream/play.m3u8`,
      vivo: `${base}/live/play.m3u8`,
    },
    consumo: consumo ? {
      total_gb: +(consumo.total_bytes / 1073741824).toFixed(2),
      por_dia: consumo.por_dia.map((d) => ({ fecha: d.fecha, gb: +(d.bytes / 1073741824).toFixed(3) })),
    } : null,
  });
}));

/** POST /cliente/video/ticket — ticket para subir un video directo al nodo. */
router.post('/video/ticket', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  const ctx = await nodoDe(cliente);
  if (!ctx) return res.status(400).json({ error: 'Tu cuenta no es de video' });

  const detalle = await ctx.nodo.cuenta(cliente.short_name);
  const t = await ctx.nodo.ticketSubida(cliente.short_name);
  if (!t?.ticket) return res.status(502).json({ error: 'No se pudo preparar la subida' });

  const publica = (ctx.servidor.url_publica || ctx.servidor.url).replace(/\/+$/, '');
  const puerto = detalle?.puertos?.http;
  // El navegador sube directo a esta URL (no pasa por el panel)
  res.json({ url: `${publica}${puerto ? ':' + puerto : ''}/_subir?ticket=${encodeURIComponent(t.ticket)}` });
}));

/** DELETE /cliente/video/:nombre — borra uno de sus videos. */
router.delete('/video/:nombre', requireCliente, wrap(async (req, res) => {
  const cliente = await getCliente(req);
  const ctx = await nodoDe(cliente);
  if (!ctx) return res.status(400).json({ error: 'Tu cuenta no es de video' });

  const r = await ctx.nodo.borrarVideo(cliente.short_name, req.params.nombre);
  if (!r?.ok) return res.status(404).json({ error: r?.error || 'No se pudo borrar' });
  res.json({ ok: true });
}));


module.exports = router;
