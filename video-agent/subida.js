/**
 * subida.js — subir y borrar videos de una cuenta
 * ------------------------------------------------------------------
 * Los videos son grandes (cientos de MB, GB) y NO deben pasar por el
 * panel: se suben DIRECTO del navegador al VPS de video, que ya sirve
 * HTTPS con certificado válido en el puerto de cada cuenta.
 *
 * Autorización por TICKET: el panel (que comparte el AGENT_TOKEN) firma
 * un ticket temporal con HMAC para una cuenta; el navegador lo usa; el
 * agente lo valida. Así el token del agente nunca llega al navegador.
 * ------------------------------------------------------------------
 */
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const multer = require('multer');

const SECRETO = process.env.AGENT_TOKEN || '';
const HOME = process.env.HOME_BASE || '/home';
const VENTANA_MS = Number(process.env.TICKET_MS || 30 * 60 * 1000); // 30 min para subir
const MAX_BYTES = Number(process.env.SUBIDA_MAX_BYTES || 5 * 1024 * 1024 * 1024); // 5 GB
const VIDEO = /\.(mp4|mkv|mov|webm|flv)$/i;

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Nombre de archivo seguro: sin rutas, sin caracteres raros, conserva la extensión. */
function nombreSeguro(original) {
  const ext = (path.extname(original).match(/\.(mp4|mkv|mov|webm|flv|ts)/i) || ['.mp4'])[0].toLowerCase();
  const base = path.basename(original, path.extname(original))
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ._-]/g, '').trim().slice(0, 80) || 'video';
  return base + ext;
}

// ---- Tickets de subida (HMAC) -------------------------------------

function firmarTicket(user, expira) {
  const dato = `${user}.${expira}`;
  const firma = crypto.createHmac('sha256', SECRETO).update(dato).digest('hex').slice(0, 32);
  return `${dato}.${firma}`;
}

/** El panel llama esto (autenticado con el token) para dar un ticket al cliente. */
function emitirTicket(user) {
  const u = slug(user);
  const expira = Date.now() + VENTANA_MS;
  return { ticket: firmarTicket(u, expira), expira, user: u };
}

/** Valida un ticket y devuelve el user, o null si es inválido/vencido. */
function validarTicket(ticket) {
  const partes = String(ticket || '').split('.');
  if (partes.length !== 3) return null;
  const [user, expira, firma] = partes;
  const esperado = firmarTicket(user, expira).split('.')[2];
  const a = Buffer.from(firma), b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Date.now() > Number(expira)) return null;
  return user;
}

// ---- Multer: guarda el archivo directo en la carpeta de la cuenta -

const almacen = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(HOME, req.videoUser, 'uploads');
    fs.mkdir(dir, { recursive: true }, (e) => cb(e, dir));
  },
  filename: (req, file, cb) => {
    let nombre = nombreSeguro(file.originalname);
    // Evitar pisar un video existente: agrega -2, -3…
    const dir = path.join(HOME, req.videoUser, 'uploads');
    let final = nombre, n = 2;
    while (fs.existsSync(path.join(dir, final))) {
      const ext = path.extname(nombre);
      final = nombre.slice(0, -ext.length) + '-' + n++ + ext;
    }
    cb(null, final);
  },
});

const subir = multer({
  storage: almacen,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => cb(null, VIDEO.test(file.originalname)),
}).single('video');

// ---- Borrado ------------------------------------------------------

/** Borra un video de una cuenta (nombre sin rutas). Devuelve si existía. */
async function borrar(user, nombre) {
  const u = slug(user);
  const base = path.basename(String(nombre)); // nunca rutas relativas
  if (!VIDEO.test(base)) return { ok: false, error: 'No es un archivo de video' };
  const ruta = path.join(HOME, u, 'uploads', base);
  try {
    await fsp.unlink(ruta);
    return { ok: true, borrado: base };
  } catch {
    return { ok: false, error: 'El video no existe' };
  }
}

module.exports = { emitirTicket, validarTicket, subir, borrar, slug, nombreSeguro };
