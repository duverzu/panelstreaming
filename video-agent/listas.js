/**
 * listas.js — listas de reproducción y programación por horario
 * ------------------------------------------------------------------
 * Cada cuenta tiene un `listas.json` en su carpeta:
 *
 *   {
 *     "listas": {
 *       "l1": { "nombre": "Mañana",  "videos": ["01.mp4","02.mp4"] },
 *       "l2": { "nombre": "Tarde",   "videos": ["03.mp4"] }
 *     },
 *     "programacion": [
 *       { "desde": "06:00", "hasta": "12:00", "lista": "l1" },
 *       { "desde": "12:00", "hasta": "18:00", "lista": "l2" }
 *     ],
 *     "activa": "l1"      // lista al aire cuando NO hay franja horaria que aplique
 *   }
 *
 * `listaActual()` decide qué videos emitir AHORA: la franja horaria que
 * corresponda, o la lista activa, o (si no hay listas) todos los videos.
 * ------------------------------------------------------------------
 */
const path = require('path');
const fsp = require('fs/promises');
const crypto = require('crypto');

const ARCHIVO = 'listas.json';

async function leer(dirCuenta) {
  try { return JSON.parse(await fsp.readFile(path.join(dirCuenta, ARCHIVO), 'utf8')); }
  catch { return { listas: {}, programacion: [], activa: null }; }
}

async function guardar(dirCuenta, datos) {
  const ruta = path.join(dirCuenta, ARCHIVO);
  const tmp = ruta + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(datos, null, 2));
  await fsp.rename(tmp, ruta);
}

const nuevoId = () => 'l' + crypto.randomBytes(4).toString('hex');
const hhmm = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ''));

// ---- Listas -------------------------------------------------------

async function crear(dirCuenta, nombre) {
  const datos = await leer(dirCuenta);
  const id = nuevoId();
  datos.listas[id] = { nombre: String(nombre || 'Lista').slice(0, 60), videos: [] };
  if (!datos.activa) datos.activa = id;   // la primera queda activa
  await guardar(dirCuenta, datos);
  return { id, ...datos.listas[id] };
}

async function renombrar(dirCuenta, id, nombre) {
  const datos = await leer(dirCuenta);
  if (!datos.listas[id]) return null;
  datos.listas[id].nombre = String(nombre).slice(0, 60);
  await guardar(dirCuenta, datos);
  return { id, ...datos.listas[id] };
}

async function borrar(dirCuenta, id) {
  const datos = await leer(dirCuenta);
  if (!datos.listas[id]) return false;
  delete datos.listas[id];
  datos.programacion = datos.programacion.filter((p) => p.lista !== id);
  if (datos.activa === id) datos.activa = Object.keys(datos.listas)[0] || null;
  await guardar(dirCuenta, datos);
  return true;
}

/** Reemplaza los videos (y su orden) de una lista. Nombres saneados. */
async function fijarVideos(dirCuenta, id, videos) {
  const datos = await leer(dirCuenta);
  if (!datos.listas[id]) return null;
  datos.listas[id].videos = (videos || []).map((f) => path.basename(String(f)));
  await guardar(dirCuenta, datos);
  return { id, ...datos.listas[id] };
}

async function marcarActiva(dirCuenta, id) {
  const datos = await leer(dirCuenta);
  if (id && !datos.listas[id]) return false;
  datos.activa = id;
  await guardar(dirCuenta, datos);
  return true;
}

// ---- Programación -------------------------------------------------

/** Reemplaza toda la programación. Cada franja: {desde,hasta,lista}. */
async function fijarProgramacion(dirCuenta, franjas) {
  const datos = await leer(dirCuenta);
  const validas = (franjas || []).filter(
    (f) => hhmm(f.desde) && hhmm(f.hasta) && datos.listas[f.lista]
  ).map((f) => ({ desde: f.desde, hasta: f.hasta, lista: f.lista }));
  datos.programacion = validas;
  await guardar(dirCuenta, datos);
  return validas;
}

/** ¿Qué lista aplica a esta hora? (soporta franjas que cruzan medianoche). */
function listaParaHora(datos, ahoraMin) {
  for (const f of datos.programacion || []) {
    const [dh, dm] = f.desde.split(':').map(Number);
    const [hh, hm] = f.hasta.split(':').map(Number);
    const ini = dh * 60 + dm;
    const fin = hh * 60 + hm;
    const dentro = ini <= fin
      ? (ahoraMin >= ini && ahoraMin < fin)
      : (ahoraMin >= ini || ahoraMin < fin);   // cruza medianoche
    if (dentro && datos.listas[f.lista]) return f.lista;
  }
  return null;
}

/**
 * Videos que deben emitir AHORA y un identificador de la selección
 * (para saber si cambió y reiniciar). `disponibles` = videos que existen
 * en disco (para filtrar los borrados).
 */
function listaActual(datos, disponibles, fecha) {
  const min = fecha ? fecha.getHours() * 60 + fecha.getMinutes() : 0;
  const setDisp = new Set(disponibles);

  // 1) Franja horaria  2) lista activa  3) todos los videos
  const idPorHora = fecha ? listaParaHora(datos, min) : null;
  const id = idPorHora || datos.activa;
  const lista = id && datos.listas[id] ? datos.listas[id] : null;

  let videos;
  if (lista) {
    const enLista = lista.videos.filter((v) => setDisp.has(v));   // solo existentes
    const resto = disponibles.filter((v) => !lista.videos.includes(v)); // nuevos al final
    videos = [...enLista, ...resto];
  } else {
    videos = [...disponibles].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  }
  return { id: id || 'todos', videos };
}

module.exports = {
  leer, crear, renombrar, borrar, fijarVideos, marcarActiva,
  fijarProgramacion, listaActual, listaParaHora,
};
