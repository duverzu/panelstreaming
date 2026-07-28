/**
 * scripts/bajar-musica-centova.js — descarga la música del AutoDJ por FTP
 * ------------------------------------------------------------------
 * Centova expone la biblioteca de cada cuenta por FTP (host + usuario de la
 * cuenta + su clave de administrador). Esto la baja a ./musica/<usuario>/, sin
 * necesitar consola del servidor viejo. Después se sube a AzuraCast (ver
 * MIGRACION.md: por su SFTP o el gestor de medios).
 *
 * REQUIERE una vez:  npm install basic-ftp
 *
 * USO (una cuenta):
 *   FTP_HOST=radiohd4.streaminghd.co FTP_USER=agropalmira FTP_PASS=<clave admin de la cuenta> \
 *   node scripts/bajar-musica-centova.js
 *
 * USO (varias): repetir con cada usuario/clave, o envolver en un for.
 * ------------------------------------------------------------------
 */
const path = require('path');
const fs = require('fs');

let ftp;
try { ftp = require('basic-ftp'); }
catch { console.error('Falta la librería: corre  npm install basic-ftp  y reintenta.'); process.exit(1); }

const HOST = process.env.FTP_HOST;
const USER = process.env.FTP_USER;
const PASS = process.env.FTP_PASS;
const PUERTO = Number(process.env.FTP_PORT || 21);
const DESTINO = path.join(process.cwd(), 'musica', USER || 'cuenta');

if (!HOST || !USER || !PASS) {
  console.error('Faltan FTP_HOST, FTP_USER y FTP_PASS.');
  process.exit(1);
}

async function main() {
  fs.mkdirSync(DESTINO, { recursive: true });
  const client = new ftp.Client(30000);
  client.ftp.verbose = false;
  try {
    await client.access({ host: HOST, port: PUERTO, user: USER, password: PASS, secure: false });
    console.log(`Conectado a ${HOST} como ${USER}. Descargando a ${DESTINO} …`);
    // La música suele estar en /media (o la raíz). Se baja recursivo lo que haya.
    const raiz = (await client.list()).some((f) => f.name === 'media') ? 'media' : '.';
    await client.downloadToDir(DESTINO, raiz);
    console.log(`✅ Música de ${USER} descargada en ${DESTINO}`);
  } catch (e) {
    console.error(`✗ ${USER}:`, e.message);
    process.exit(1);
  } finally {
    client.close();
  }
}

main();
