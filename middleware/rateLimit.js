/**
 * middleware/rateLimit.js — limitador de solicitudes simple, en memoria y sin
 * dependencias. Pensado para endpoints sensibles (login, SSO): frena la fuerza
 * bruta sin necesidad de Redis ni paquetes externos.
 *
 * `clave(req)` decide contra qué se cuenta (por defecto la IP). Para el login
 * conviene contar por USUARIO, así un proxy delante no agrupa a todos bajo una
 * sola IP ni penaliza a usuarios legítimos.
 */
function rateLimit({ ventanaMs = 60000, max = 20, clave } = {}) {
  const hits = new Map();

  // Limpieza perezosa para que el Map no crezca sin límite.
  function limpiar(ahora) {
    if (hits.size < 5000) return;
    for (const [k, r] of hits) if (ahora > r.reset) hits.delete(k);
  }

  return (req, res, next) => {
    const k = String((clave ? clave(req) : req.ip) || 'anon').slice(0, 120);
    const ahora = Date.now();
    limpiar(ahora);
    let reg = hits.get(k);
    if (!reg || ahora > reg.reset) { reg = { n: 0, reset: ahora + ventanaMs }; hits.set(k, reg); }
    reg.n++;
    if (reg.n > max) {
      const seg = Math.ceil((reg.reset - ahora) / 1000);
      res.set('Retry-After', String(seg));
      return res.status(429).json({ error: `Demasiados intentos. Espera ${seg}s e intenta de nuevo.` });
    }
    next();
  };
}

module.exports = rateLimit;
