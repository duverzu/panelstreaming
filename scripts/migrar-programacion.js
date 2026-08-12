/**
 * scripts/migrar-programacion.js
 * ------------------------------------------------------------------
 * Migra una estación (o todas) del esquema viejo de anuncios/cuñas al nuevo,
 * basado en la programación NATIVA de AzuraCast. Ver services/programacion.js.
 *
 * Qué hace por estación:
 *   1. Borra las playlists del esquema viejo, que nunca pudieron funcionar
 *      porque nacieron con `type: 'default'` (donde `play_per_songs` se
 *      ignora):  `⏰ Anuncio de hora`, `📣 Anuncios`, `📣 Cuñas`.
 *   2. Saca los archivos de cuña de las playlists de MÚSICA del cliente, donde
 *      quedaron metidos por el `setFilePlaylists` destructivo del código viejo.
 *   3. Borra los `anuncio-hora-*.mp3` huérfanos (los que dejó el temporizador
 *      en memoria al morir con un `pm2 restart`; algunos anuncian una hora fija
 *      equivocada porque son del formato antiguo, sin timestamp).
 *   4. Crea las playlists nuevas del "da la hora" (`⏰ Hora :MM`, once_per_hour)
 *      según la config del cliente.
 *   5. Recrea una playlist por cuña con sus `schedule_items`.
 *
 * NO reinicia ninguna estación: con `write_playlists_to_liquidsoap: false`
 * (el default) los cambios de playlist los aplica el AutoDJ de PHP en caliente.
 *
 * Uso:
 *   node scripts/migrar-programacion.js <id-o-nombre>     # simulación (no toca nada)
 *   node scripts/migrar-programacion.js <id-o-nombre> --aplicar
 *   node scripts/migrar-programacion.js --todos --aplicar
 * ------------------------------------------------------------------
 */
require('dotenv').config();
const { query } = require('../config/database');
const clienteModel = require('../models/clienteModel');
const azuracast = require('../services/azuracast');
const anuncioHora = require('../services/anuncioHora');
const cunas = require('../services/cunas');
const prog = require('../services/programacion');
const { DEFAULT_TZ } = require('../services/zonaHoraria');

const APLICAR = process.argv.includes('--aplicar');
const L = (...a) => console.log(...a);
const marca = () => (APLICAR ? '' : '  [simulación]');

/** Playlists del esquema viejo, que hay que borrar. */
const PLAYLISTS_VIEJAS = ['⏰ Anuncio de hora', '📣 Anuncios', '📣 Cuñas', '📣 Cunas'];

async function migrar(cliente) {
  const st = cliente.azuracast_station_id;
  if (!st) { L(`- ${cliente.nombre_empresa}: sin estación, saltada`); return; }

  L(`\n• ${cliente.nombre_empresa} (cliente ${cliente.id}, station ${st})`);
  const az = await azuracast.paraServidorId(cliente.servidor_id);

  let playlists;
  try { playlists = (await az.getPlaylists(st)) || []; }
  catch (e) { L(`   ⚠️  no responde: ${e.message}`); return; }

  const files = (await az.listMedia(st)) || [];
  const idsViejas = new Set(playlists.filter((p) => PLAYLISTS_VIEJAS.includes(p.name)).map((p) => p.id));

  // --- 2. Sacar cuñas y anuncios VIEJOS de las playlists de música del cliente ---
  // Ojo: NO se tocan los `panel-hora-*`. Esos son los del esquema nuevo y ya
  // están donde deben (el planificador los coloca); sacarlos aquí desharía el
  // trabajo recién hecho y dejaría la franja muda hasta el siguiente tick.
  const rxViejos = /(^|\/)(cuna-\d+-|anuncio-hora-)/;
  for (const f of files) {
    const path = f.path || '';
    if (!rxViejos.test(path)) continue;
    const actuales = (f.playlists || []).map((p) => p.id);
    // Se quedan fuera de TODA playlist: las nuevas se las asigna el paso 4/5.
    if (actuales.length === 0) continue;
    const nombres = (f.playlists || []).map((p) => p.name).join(', ');
    L(`   ← saco "${path}" de: ${nombres}${marca()}`);
    if (APLICAR) await az.setFilePlaylists(st, f.id, []).catch((e) => L(`      error: ${e.message}`));
  }

  // --- 3. Borrar anuncios de hora huérfanos del esquema viejo ---
  // Los nuevos (`panel-hora-*`) son deterministas y reutilizables: se quedan.
  for (const f of files) {
    if (!/(^|\/)anuncio-hora-\d+/.test(f.path || '')) continue;
    L(`   🗑  borro archivo huérfano "${f.path}"${marca()}`);
    if (APLICAR) await az.deleteMedia(st, f.id).catch((e) => L(`      error: ${e.message}`));
  }

  // --- 1. Borrar las playlists del esquema viejo ---
  for (const p of playlists) {
    if (!idsViejas.has(p.id)) continue;
    L(`   🗑  borro playlist vieja "${p.name}" (type=${p.type}, nunca pudo sonar puntual)${marca()}`);
    if (APLICAR) await az.deletePlaylist(st, p.id).catch((e) => L(`      error: ${e.message}`));
  }

  // --- 4. Da la hora, ya nativo ---
  const cfg = await anuncioHora.verConfig(cliente.id);
  const zona = cfg.zona_horaria || DEFAULT_TZ;
  L(`   🕐 da la hora: ${cfg.activo ? `ON cada ${cfg.cada_min} min, voz ${cfg.voz}` : 'OFF'} · zona ${zona}${marca()}`);
  if (APLICAR) {
    await prog.sincronizarZona(az, st, zona);
    await anuncioHora.sincronizarPlaylists(az, st, cfg);
    if (cfg.activo) {
      // Deja el audio de la próxima franja listo ya, sin esperar al tick.
      const { partesEnZona } = require('../services/zonaHoraria');
      const { hora, minuto } = partesEnZona(zona);
      for (const min of anuncioHora.franjasDe(Number(cfg.cada_min))) {
        const faltan = (min - minuto + 60) % 60 || 60;
        const horaObjetivo = (hora + Math.floor((minuto + faltan) / 60)) % 24;
        await anuncioHora.prepararFranja(az, st, cfg, horaObjetivo, min)
          .then(() => L(`      ✓ ${String(horaObjetivo).padStart(2, '0')}:${String(min).padStart(2, '0')} listo`))
          .catch((e) => L(`      error franja :${min}: ${e.message}`));
      }
    }
  }

  // --- 5. Cuñas, una playlist cada una con sus horarios ---
  const { rows: lista } = await query('SELECT id, nombre, horas, activo, media_id FROM cunas WHERE cliente_id=$1 ORDER BY id', [cliente.id]);
  if (!lista.length) L('   📣 sin cuñas');
  for (const c of lista) {
    const horas = Array.isArray(c.horas) ? c.horas : [];
    const estado = !c.media_id ? 'SIN AUDIO (no se programa)' : !c.activo ? 'inactiva' : horas.length ? horas.join(', ') : 'sin horas';
    L(`   📣 "${c.nombre}" #${c.id} → ${estado}${marca()}`);
  }
  if (APLICAR && lista.length) {
    await cunas.resincronizarCliente(cliente)
      .then((n) => L(`      ✓ ${n} cuña(s) sincronizada(s)`))
      .catch((e) => L(`      error: ${e.message}`));
  }
}

(async () => {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const arg = args[0] || '';
  const todos = process.argv.includes('--todos');

  let objetivos = [];
  if (todos) {
    const { rows } = await query(`SELECT id FROM clientes WHERE tipo IS DISTINCT FROM 'video' AND azuracast_station_id IS NOT NULL ORDER BY id`);
    for (const r of rows) objetivos.push(await clienteModel.findById(r.id));
  } else if (arg) {
    let c = /^\d+$/.test(arg) ? await clienteModel.findById(Number(arg)) : null;
    if (!c) {
      const { rows } = await query(`SELECT id, short_name, nombre_empresa FROM clientes WHERE tipo IS DISTINCT FROM 'video' ORDER BY id`);
      const m = rows.find((r) => (r.short_name || '').toLowerCase().includes(arg.toLowerCase())
        || (r.nombre_empresa || '').toLowerCase().includes(arg.toLowerCase()));
      if (m) c = await clienteModel.findById(m.id);
    }
    if (!c) { L(`No encontré "${arg}".`); process.exit(1); }
    objetivos = [c];
  } else {
    L('Uso: node scripts/migrar-programacion.js <id-o-nombre> [--aplicar]');
    L('     node scripts/migrar-programacion.js --todos [--aplicar]');
    process.exit(1);
  }

  if (!APLICAR) L('\n⚠️  SIMULACIÓN — no se toca nada. Añade --aplicar para ejecutar.\n');

  for (const c of objetivos) if (c) await migrar(c);

  L(APLICAR
    ? '\n✅ Listo. El "da la hora" y las cuñas los programa ahora AzuraCast (sin reiniciar estaciones).'
    : '\n(simulación terminada — nada cambió)');
  process.exit(0);
})();
