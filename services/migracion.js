/**
 * services/migracion.js — importar estaciones de audio EN LOTE (Centova → panel)
 * ------------------------------------------------------------------
 * El objetivo #1 es preservar la URL real del oyente:
 *     http://<dominio>:<PUERTO>/<MOUNT>     (ej. :8163/stream)
 * Para eso, al recrear cada radio en AzuraCast se fija:
 *   - el PUERTO del frontend (frontend_config.port) = el de Centova
 *   - el MOUNT (por defecto /stream) con AutoDJ
 *   - la CLAVE source (frontend_config.source_pw) = la de Centova, para que el
 *     cliente NO tenga que cambiar su encoder
 *
 * Con el dominio repuntado por DNS al servidor nuevo, la URL queda idéntica y
 * sirve tanto el AutoDJ como el DJ en vivo (una sola dirección, como Icecast).
 *
 * IMPORTANTE (operadores): esto crea de a una estación real en AzuraCast. Úsalo
 * contra el SERVIDOR NUEVO (recién montado), no contra producción. Es idempotente
 * a nivel de usuario: si el `usuario` ya existe, esa cuenta se SALTA (no duplica).
 * ------------------------------------------------------------------
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userModel = require('../models/userModel');
const clienteModel = require('../models/clienteModel');
const publico = require('./publico');

/**
 * Recrea UNA estación preservando puerto/mount/clave.
 * @param az       cliente AzuraCast del servidor destino (azuracast.crearCliente)
 * @param cuenta   { titulo, puerto, mount, source_password, max_oyentes, max_bitrate }
 * @returns la estación creada en AzuraCast
 */
async function importarEstacion(az, cuenta) {
  const {
    titulo, puerto, mount = '/stream',
    source_password, max_oyentes, max_bitrate = 128,
  } = cuenta;

  // 1) Crear la estación
  const station = await az.createStation(titulo, `Migrada: ${titulo}`);

  // 2) Fijar puerto, clave source y límites (frontend_config se fusiona)
  const frontend_config = { port: Number(puerto) || undefined, max_listeners: max_oyentes || null };
  if (source_password) frontend_config.source_pw = String(source_password);
  await az.updateStation(station.id, {
    max_bitrate: Number(max_bitrate) || 128,
    enable_public_page: true,
    frontend_config,
  });

  // 3) Mount /stream con AutoDJ (renombra el mount por defecto de AzuraCast)
  try {
    const mounts = await az.getMounts(station.id);
    const def = mounts.find((m) => m.is_default) || mounts[0];
    const autodj_bitrate = Math.min(Number(max_bitrate) || 128, 320);
    const opts = { name: mount, is_default: true, enable_autodj: true, autodj_format: 'mp3', autodj_bitrate };
    if (def) await az.updateMount(station.id, def.id, opts);
    else await az.createMount(station.id, opts);
  } catch (e) { console.error(`[migracion] mount ${titulo}:`, e.message); }

  // 4) Al aire
  await az.restartStation(station.id).catch(() => {});
  return station;
}

/**
 * Importa una LISTA de cuentas en un servidor. Devuelve el resultado de cada una
 * (creada / saltada / error) para que el operador vea el avance sin sorpresas.
 *
 * @param opts.az          cliente AzuraCast del servidor destino
 * @param opts.servidor    fila del servidor destino (para url_streaming/publica)
 * @param opts.plan        plan a asignar (nombre) — los límites reales van por cuenta
 * @param opts.reseller_id (opcional) revendedor dueño
 * @param cuentas          [{ usuario, titulo, email?, password?, puerto, mount, source_password, max_oyentes, max_bitrate }]
 */
async function importarLote({ az, servidor, plan, reseller_id = null }, cuentas) {
  const baseUrlPublica = publico.deServidor(servidor);
  const resultados = [];

  for (const c of cuentas) {
    const usuario = userModel.slugUsuario(c.usuario || c.titulo || '');
    try {
      if (!usuario || usuario.length < 3) throw new Error('usuario inválido');
      if (await userModel.findByUsername(usuario)) { resultados.push({ usuario, estado: 'saltada', motivo: 'ya existe' }); continue; }

      // Usuario del panel (clave: la que traiga o una generada)
      const password = c.password || crypto.randomBytes(6).toString('hex');
      const user = await userModel.create({
        username: usuario, email: c.email || `${usuario}@migrado.local`,
        password_hash: await bcrypt.hash(password, 10), role: 'cliente',
      });

      // Estación preservando puerto/mount/clave
      const station = await importarEstacion(az, {
        titulo: c.titulo || usuario, puerto: c.puerto, mount: c.mount || '/stream',
        source_password: c.source_password, max_oyentes: c.max_oyentes, max_bitrate: c.max_bitrate,
      });

      // URL de escucha REAL (la que ya usan los oyentes)
      const mount = (c.mount || '/stream').replace(/^\/?/, '/');
      const url_streaming = `${baseUrlPublica}:${c.puerto}${mount}`;

      const cliente = await clienteModel.create({
        user_id: user.id, nombre_empresa: c.titulo || usuario, plan: plan?.nombre || 'Migrado',
        azuracast_station_id: station.id, url_streaming, reseller_id,
        servidor_id: servidor.id, short_name: station.short_name, tipo: 'audio',
      });

      resultados.push({ usuario, estado: 'creada', station_id: station.id, url_streaming, password });
    } catch (e) {
      resultados.push({ usuario, estado: 'error', motivo: e.message });
    }
  }

  const creadas = resultados.filter((r) => r.estado === 'creada').length;
  const saltadas = resultados.filter((r) => r.estado === 'saltada').length;
  const errores = resultados.filter((r) => r.estado === 'error').length;
  return { total: cuentas.length, creadas, saltadas, errores, resultados };
}

module.exports = { importarEstacion, importarLote };
