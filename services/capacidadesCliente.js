/**
 * capacidadesCliente.js — qué puede USAR un cliente según su tipo y plan.
 * Sirve para ocultar opciones del panel que su plan no incluye.
 *
 * permite_vod = puede subir videos y usar la emisión 24/7 (VOD/AutoDJ de video).
 *   - Audio: no aplica (tienen su propio panel).
 *   - Video "solo vivo" (plan con 0 almacenamiento) o canal asilivehd (compat):
 *     false → no ve "Gestionar videos" ni "Playlist".
 */
const planModel = require('../models/planModel');

async function capacidadesCliente(cliente) {
  if (!cliente || cliente.tipo !== 'video') return { permite_vod: false };
  // Incluye compat: un canal asilivehd con plan de espacio SÍ puede usar AutoDJ
  // (el motor 24/7 de la capa, compat247). 0 GB = solo vivo.
  const plan = await planModel.findByNombre(cliente.plan);
  return { permite_vod: (plan?.espacio_mb || 0) > 0 };
}

module.exports = { capacidadesCliente };
