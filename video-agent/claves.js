/**
 * claves.js — claves de transmisión de cada cuenta
 * ------------------------------------------------------------------
 * Guarda en disco qué clave puede usar cada cuenta para salir en vivo.
 * Vive en el nodo (no en el panel) porque nginx pregunta a cada conexión
 * y no puede depender de que el panel esté disponible en ese instante:
 * si el panel se cae, el cliente igual debe poder transmitir.
 *
 * El panel la escribe al crear la cuenta o al regenerarla.
 * ------------------------------------------------------------------
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const ARCHIVO = process.env.CLAVES_FILE || path.join(__dirname, 'claves.json');

let cache = null;

async function leer() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fsp.readFile(ARCHIVO, 'utf8'));
  } catch {
    cache = {};   // todavía no existe: cuenta sin claves
  }
  return cache;
}

async function guardar(datos) {
  cache = datos;
  // Escritura atómica: si el proceso muere a mitad, no queda un archivo roto
  const tmp = `${ARCHIVO}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(datos, null, 2), { mode: 0o600 });
  await fsp.rename(tmp, ARCHIVO);
}

/** Devuelve la clave actual de una cuenta; la crea si aún no tiene. */
async function obtener(user) {
  const datos = await leer();
  if (!datos[user]?.clave) return definir(user);
  return datos[user].clave;
}

/** Define (o reemplaza) la clave de una cuenta. Si no se pasa, se genera. */
async function definir(user, clave) {
  const datos = await leer();
  const valor = clave || crypto.randomBytes(12).toString('hex');
  datos[user] = { clave: valor, activo: true, actualizado: new Date().toISOString() };
  await guardar(datos);
  return valor;
}

/** Bloquea el vivo de una cuenta sin borrar su clave (suspensión). */
async function activar(user, activo) {
  const datos = await leer();
  if (!datos[user]) return false;
  datos[user].activo = Boolean(activo);
  await guardar(datos);
  return true;
}

async function quitar(user) {
  const datos = await leer();
  delete datos[user];
  await guardar(datos);
}

/**
 * ¿Puede esta cuenta transmitir con esta clave?
 * La comparación es en tiempo constante para no filtrar información
 * probando claves y midiendo cuánto tarda en responder.
 */
async function valida(user, clave) {
  const datos = await leer();
  const registro = datos[user];
  if (!registro || !registro.activo || !clave) return false;

  const a = Buffer.from(String(registro.clave));
  const b = Buffer.from(String(clave));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const listar = async () => Object.keys(await leer());

module.exports = { definir, obtener, activar, quitar, valida, listar, ARCHIVO };
