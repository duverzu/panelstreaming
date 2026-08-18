/**
 * services/limitePublico.js
 * ------------------------------------------------------------------
 * Freno para los endpoints PÚBLICOS (los que llama la web de un cliente,
 * sin credenciales). Son la única puerta abierta del panel, así que son por
 * donde entraría cualquiera que quiera hacer daño.
 *
 * Lo que se defiende NO es el CPU: es que cada consulta que no está en caché
 * dispara una lectura a la base y una llamada a AzuraCast — el mismo AzuraCast
 * que está emitiendo las radios. Convertir un servidor de emisión en el
 * amplificador de un ataque es el peor final posible.
 *
 * El contador vive en memoria a propósito: el panel es un solo proceso, y
 * meter Redis por esto sería añadir una pieza que también se puede caer.
 * ------------------------------------------------------------------
 */

const VENTANA_MS = Number(process.env.LIMITE_PUBLICO_VENTANA_MS || 60000);
const MAXIMO = Number(process.env.LIMITE_PUBLICO_MAX || 120);
// Techo de IPs vigiladas a la vez. Sin él, un atacante que falsee direcciones
// haría crecer este mapa hasta tumbar el panel por memoria — exactamente el
// daño que este archivo existe para evitar.
const MAX_IPS = Number(process.env.LIMITE_PUBLICO_MAX_IPS || 20000);

const visitas = new Map();   // ip -> { desde, cuenta }

function limpiar(ahora) {
  for (const [ip, v] of visitas) {
    if (ahora - v.desde >= VENTANA_MS) visitas.delete(ip);
  }
}

/**
 * Middleware. Un oyente normal pide una vez cada 10-15 s: 120 por minuto deja
 * sitio de sobra para una oficina entera o un operador móvil compartiendo
 * salida, y aun así corta a quien venga a inundar.
 */
function limitar(req, res, next) {
  const ahora = Date.now();
  const ip = req.ip || req.socket?.remoteAddress || 'desconocida';

  if (visitas.size > MAX_IPS) limpiar(ahora);
  // Si tras limpiar sigue lleno, se deja pasar en vez de bloquear a todos:
  // ante la duda, es mejor un panel lento que un panel que no atiende a nadie.
  if (visitas.size > MAX_IPS) return next();

  const v = visitas.get(ip);
  if (!v || ahora - v.desde >= VENTANA_MS) {
    visitas.set(ip, { desde: ahora, cuenta: 1 });
    return next();
  }
  v.cuenta += 1;
  if (v.cuenta > MAXIMO) {
    const faltan = Math.ceil((VENTANA_MS - (ahora - v.desde)) / 1000);
    res.set('Retry-After', String(faltan));
    return res.status(429).json({ error: 'Demasiadas consultas. Espera un momento.' });
  }
  next();
}

/** Caché con techo: al llenarse se tira lo más viejo, no crece sin final. */
function crearCache(maximo = 500) {
  const m = new Map();
  return {
    get(clave) { return m.get(clave); },
    set(clave, valor) {
      if (m.size >= maximo && !m.has(clave)) m.delete(m.keys().next().value);
      m.set(clave, valor);
    },
  };
}

module.exports = { limitar, crearCache, VENTANA_MS, MAXIMO };
