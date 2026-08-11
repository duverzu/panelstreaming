/**
 * compat.js — Capa de compatibilidad "asilivehd"
 * ------------------------------------------------------------------
 * Permite migrar clientes que YA transmiten a otro servidor con el
 * esquema por-ruta (rtmp://dominio/live  ·  clave "usuario?token=XXX"
 * ·  https://dominio/live/usuario.m3u8) SIN que cambien nada: al
 * voltear el DNS de su dominio a este nodo, su OBS/vMix y su
 * reproductor siguen funcionando idénticos.
 *
 * Este módulo solo valida el par (usuario, token) contra un archivo
 * JSON con los tokens EXACTOS del sistema viejo. nginx (app `live`)
 * pregunta aquí en cada publicación (on_publish).
 *
 * El archivo de tokens NO va en git (son secretos). Se crea en el nodo:
 *   /opt/panelstreaming/video-agent/compat-tokens.json
 *   { "vocesriv": "SFYS79ZePW5G", "huilatv": "lD5W@osP7[Y47j", ... }
 * ------------------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');

const ARCHIVO = process.env.COMPAT_TOKENS || path.join(__dirname, 'compat-tokens.json');
let tokens = {};

function cargar() {
  try {
    tokens = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));
    if (!tokens || typeof tokens !== 'object') tokens = {};
  } catch (_) {
    tokens = {};   // sin archivo aún: nadie valida (la app live rechaza todo)
  }
  return Object.keys(tokens).length;
}
cargar();

// Recargar solo cuando cambie el archivo, para agregar clientes (p.ej.
// sensaciontv) sin reiniciar el agente ni cortar a nadie.
try {
  fs.watch(ARCHIVO, { persistent: false }, () => setTimeout(cargar, 200));
} catch (_) { /* el archivo aún no existe; se lee en cada valida() igual */ }

/** ¿El usuario existe y su token coincide EXACTO? */
function valida(user, token) {
  if (!user || token == null) return false;
  if (tokens[user] === undefined) cargar();   // por si el watch no disparó
  return tokens[user] !== undefined && String(tokens[user]) === String(token);
}

/** Alta/actualización de un token (deja el archivo con permisos 600). */
function definir(user, token) {
  tokens[user] = String(token);
  fs.writeFileSync(ARCHIVO, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  return true;
}

function lista() { return Object.keys(tokens); }

module.exports = { valida, definir, lista, cargar, archivo: ARCHIVO };
