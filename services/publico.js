/**
 * services/publico.js
 * ------------------------------------------------------------------
 * Resuelve la URL PÚBLICA de un servidor: la que se le muestra al cliente
 * para escuchar y para conectar su encoder.
 *
 * Se separa de la URL de administración a propósito:
 *   - `servidores.url`         → habla el panel con la API de AzuraCast.
 *                                Abrirla en el navegador muestra AzuraCast.
 *   - `servidores.url_publica` → dominio de marca blanca que solo sirve
 *                                /listen y /public (lo limita el proxy).
 *
 * Si `url_publica` está vacía se cae a `url` para no romper lo que ya existe.
 * ------------------------------------------------------------------
 */
const servidorModel = require('../models/servidorModel');

const limpiar = (u) => String(u || '').replace(/\/+$/, '');

/** URL pública a partir de un registro de servidor (o del .env si no hay). */
function deServidor(servidor) {
  return limpiar(
    servidor?.url_publica ||
    servidor?.url ||
    process.env.AZURACAST_PUBLIC_URL ||
    process.env.AZURACAST_BASE_URL
  );
}

/** URL pública del servidor donde vive la radio de un cliente. */
async function deCliente(cliente) {
  const servidor = cliente?.servidor_id ? await servidorModel.findById(cliente.servidor_id) : null;
  return deServidor(servidor);
}

/** Host sin protocolo — es lo que se pega en BUTT/Mixxx/Sam Broadcaster. */
function host(url) {
  try { return new URL(url).hostname; } catch (_) { return limpiar(url).replace(/^https?:\/\//, ''); }
}

module.exports = { deServidor, deCliente, host, limpiar };
