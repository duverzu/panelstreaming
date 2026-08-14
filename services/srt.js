/**
 * services/srt.js
 * ------------------------------------------------------------------
 * Datos de conexión SRT de un canal de video.
 *
 * SRT retransmite lo que se pierde dentro de una ventana de tiempo en vez de
 * atascarse como RTMP sobre TCP: sirve para clientes que emiten desde
 * conexiones malas. Es solo para la SUBIDA — el público sigue viendo el mismo
 * HLS y la URL del canal no cambia.
 *
 * Vive aquí y no en una ruta porque lo necesitan tanto el admin (ficha del
 * cliente) como el propio cliente (su página de Conectar), y si se copia en
 * los dos sitios el día que cambie el puerto solo se arregla uno.
 * ------------------------------------------------------------------
 */
const PUERTO = Number(process.env.SRT_PUERTO || 8890);
// Los cable operadores llevan años apuntando a un nombre concreto y cambiarlo
// en su cabecera es una visita técnica. Por eso el host de SALIDA se configura
// aparte: puede no ser el mismo por el que sube el cliente aunque hoy los dos
// lleven a la misma máquina.
const HOST_SALIDA = process.env.SRT_HOST_SALIDA || null;
const LATENCIA_US = Number(process.env.SRT_LATENCIA_US || 2000000);   // 2 s

/**
 * Arma la conexión SRT a partir de la de RTMP, que ya trae el nodo.
 * La credencial es el MISMO token que usa por RTMP: el cliente no tiene que
 * aprenderse nada nuevo, solo cambiar la dirección en su OBS.
 *
 * @param {string} user   canal (short_name)
 * @param {object} video  datos del nodo: { servidor_rtmp, clave }
 * @returns {object|null} null si faltan los datos de RTMP
 */
function datos(user, video) {
  const token = String(video?.clave || '').split('token=')[1] || null;
  let host = null;
  try { host = new URL(String(video?.servidor_rtmp || '').replace(/^rtmp:/, 'http:')).hostname; } catch (_) {}
  if (!token || !host) return null;
  const streamid = `publish:${user}:${user}:${token}`;
  return {
    host,
    puerto: PUERTO,
    streamid,
    url: `srt://${host}:${PUERTO}?streamid=${streamid}&latency=${LATENCIA_US}`,
    latencia_ms: Math.round(LATENCIA_US / 1000),
  };
}

/**
 * URL de SALIDA: la que engancha un cable operador para BAJAR la señal.
 * Sin credencial, igual que en el servidor que tenían antes: el operador ya la
 * tiene puesta en su cabecera. Quién puede llevarse qué lo decide el
 * interruptor por canal, no la URL.
 *
 * @param {string} user   canal
 * @param {object} video  datos del nodo (para deducir el host si no hay uno fijo)
 */
function salida(user, video) {
  let host = HOST_SALIDA;
  if (!host) {
    try { host = new URL(String(video?.servidor_rtmp || '').replace(/^rtmp:/, 'http:')).hostname; } catch (_) {}
  }
  if (!host || !user) return null;
  return {
    host,
    puerto: PUERTO,
    streamid: `read:${user}`,
    url: `srt://${host}:${PUERTO}?streamid=read:${user}`,
  };
}

module.exports = { datos, salida, PUERTO, LATENCIA_US };
