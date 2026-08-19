/**
 * services/renombrar.js
 * ------------------------------------------------------------------
 * Cambiarle el nombre de usuario a un cliente.
 *
 * Ese nombre no vive en un sitio: es su carpeta y sus aplicaciones RTMP en el
 * nodo, su player en la plataforma, su usuario para entrar al panel y su
 * `short_name` en la base. Cambiarlo a medias deja al cliente con el canal en
 * un nombre y el player en otro, y nadie se entera hasta que algo no carga.
 *
 * Por eso el orden importa: primero lo que puede fallar y se puede deshacer
 * (el nodo), y solo cuando eso salió bien se toca lo demás.
 * ------------------------------------------------------------------
 */
const clienteModel = require('../models/clienteModel');
const userModel = require('../models/userModel');
const servidorModel = require('../models/servidorModel');
const videoNode = require('./videoNode');
const playerExterno = require('./playerExterno');

const limpio = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function cambiarUsuario(clienteId, nombreNuevo) {
  const nuevo = limpio(nombreNuevo);
  if (nuevo.length < 3) throw new Error('El nombre debe tener al menos 3 letras o números');

  const c = await clienteModel.findById(Number(clienteId));
  if (!c) throw new Error('Cliente no encontrado');
  const anterior = c.short_name;
  if (anterior === nuevo) return { sin_cambios: true, user: nuevo };

  // Que no lo tenga ya otro: dos clientes con el mismo nombre se pisarían la
  // carpeta y los puertos en el nodo.
  if (await clienteModel.findByShortName(nuevo)) throw new Error(`Ya hay un cliente llamado «${nuevo}»`);
  if (await userModel.findByUsername(nuevo)) throw new Error(`Ya hay un usuario llamado «${nuevo}»`);

  const avisos = [];
  let urlNueva = c.url_streaming;

  // 1) El nodo primero: es lo único que puede fallar por motivos ajenos (que
  //    el canal exista, que nginx acepte la configuración). Si falla, no se ha
  //    tocado nada más y el cliente sigue como estaba.
  if ((c.tipo || 'audio') === 'video' && !c.compat && c.servidor_id) {
    const nodo = await videoNode.paraServidorId(c.servidor_id);
    if (!nodo) throw new Error('El canal no está asignado a un nodo de video');
    const r = await nodo.renombrarCuenta(anterior, nuevo);
    if (!r?.ok && !r?.sin_cambios) throw new Error('El nodo no confirmó el cambio');

    const srv = await servidorModel.findById(c.servidor_id);
    const base = String(srv?.url_publica || srv?.url || '').replace(/\/+$/, '');
    if (base && r.puertos?.http) urlNueva = `${base}:${r.puertos.http}/hybrid/play.m3u8`;
    if (r.conservo_puertos === false) {
      avisos.push('Cambiaron los puertos del canal: hay que darle al cliente su dirección nueva.');
    }
  }

  // 2) El player. Si falla, el canal ya está renombrado: se avisa y se corrige
  //    a mano, en vez de dejar el cambio a medias deshaciendo el nodo.
  const playerViejo = c.player_user || anterior;
  const rp = await playerExterno.actualizar(playerViejo, { user: nuevo, url_video: urlNueva });
  if (!rp) {
    avisos.push(`No se pudo tocar el player «${playerViejo}»: revísalo a mano.`);
  } else if (!rp.renombrado) {
    // Su enlace de video SÍ se actualizó, así que el player sigue funcionando;
    // lo único que conserva es el nombre viejo en su dirección pública.
    avisos.push(`El player sigue llamándose «${rp.user}»: la plataforma de players todavía no permite renombrarlos. Su enlace de video sí quedó apuntando al canal nuevo.`);
  }

  // 3) Y lo nuestro, que no puede fallar por causas externas.
  await clienteModel.update(c.id, {
    url_streaming: urlNueva,
    player_user: rp?.user || playerViejo,
  });
  await clienteModel.cambiarShortName(c.id, nuevo);
  await userModel.cambiarUsername(c.user_id, nuevo);

  return { ok: true, anterior, user: nuevo, url_streaming: urlNueva, avisos };
}

module.exports = { cambiarUsuario, limpio };
