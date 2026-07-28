/**
 * scripts/exportar-centova.js — arma el "manifiesto" de migración
 * ------------------------------------------------------------------
 * Toma un CSV con las cuentas de Centova y lo normaliza a un JSON limpio que
 * consume el importador del panel (POST /admin/migracion/importar).
 *
 * CÓMO CONSEGUIR LOS DATOS (sin consola del servidor viejo):
 *   La mayoría se ven en el panel de Centova (Listado de cuentas): usuario,
 *   título, puerto, oyentes (Clientes), bitrate. Falta por cuenta:
 *     - mount        → casi siempre /stream (míralo en "Enlaces rápidos")
 *     - source_password → en cada cuenta: Configuración → Stream settings
 *   Arma un CSV con estas columnas (encabezado EXACTO):
 *
 *     usuario,titulo,puerto,mount,source_password,max_oyentes,bitrate,email
 *     agropalmira,Club de Artistas Stream,8163,/stream,claveSource123,500,128,dueno@correo.com
 *
 *   email es opcional (si falta se genera uno). source_password es lo que
 *   preserva la transmisión del DJ; si no lo pones, el cliente tendrá que
 *   actualizar solo ese dato en su encoder (los oyentes NO se enteran).
 *
 * USO:
 *   node scripts/exportar-centova.js  centova-export.csv  manifest.json
 * ------------------------------------------------------------------
 */
const fs = require('fs');

const [entrada, salida = 'manifest.json'] = process.argv.slice(2);
if (!entrada) {
  console.error('Uso: node scripts/exportar-centova.js <centova-export.csv> [manifest.json]');
  process.exit(1);
}

/** CSV simple: soporta comillas dobles alrededor de campos con comas. */
function parseCSV(texto) {
  const lineas = texto.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  const cabecera = separarLinea(lineas.shift()).map((h) => h.trim().toLowerCase());
  return lineas.map((l) => {
    const celdas = separarLinea(l);
    const fila = {};
    cabecera.forEach((h, i) => { fila[h] = (celdas[i] ?? '').trim(); });
    return fila;
  });
}
function separarLinea(l) {
  const out = []; let actual = ''; let comillas = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (ch === '"') { comillas = !comillas; continue; }
    if (ch === ',' && !comillas) { out.push(actual); actual = ''; continue; }
    actual += ch;
  }
  out.push(actual);
  return out;
}

const filas = parseCSV(fs.readFileSync(entrada, 'utf8'));
const manifest = [];
const problemas = [];

for (const f of filas) {
  const usuario = (f.usuario || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!usuario || !f.puerto) { problemas.push(`fila ignorada (sin usuario o puerto): ${JSON.stringify(f)}`); continue; }
  manifest.push({
    usuario,
    titulo: f.titulo || usuario,
    puerto: Number(f.puerto),
    mount: (f.mount || '/stream').startsWith('/') ? f.mount : '/' + (f.mount || 'stream'),
    source_password: f.source_password || null,
    max_oyentes: Number(f.max_oyentes || f.oyentes || 0) || null,
    max_bitrate: Number(f.bitrate || f.max_bitrate || 128) || 128,
    email: f.email || null,
  });
}

fs.writeFileSync(salida, JSON.stringify(manifest, null, 2));
console.log(`✅ ${manifest.length} cuentas escritas en ${salida}`);
const sinClave = manifest.filter((m) => !m.source_password).length;
if (sinClave) console.log(`⚠️  ${sinClave} sin source_password → esas radios tendrán que reconfigurar su encoder (los oyentes no).`);
if (problemas.length) { console.log(`⚠️  ${problemas.length} filas con problemas:`); problemas.forEach((p) => console.log('   ' + p)); }
console.log('\nSiguiente: revisa el manifest y córrelo con el importador (ver MIGRACION.md).');
