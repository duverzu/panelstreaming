import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { IconSun, IconMoon } from '../icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTowerBroadcast, faMicrophoneLines, faVideo, faUser, faLock,
  faEye, faEyeSlash, faCircleNotch, faArrowRightToBracket, faCircleExclamation,
} from '@fortawesome/free-solid-svg-icons';

/* Miniatura de 32px del propio fondo, incrustada: se pinta al instante y evita
   el fogonazo en blanco mientras carga la imagen real (136 KB). */
const LQIP = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAIKADAAQAAAABAAAAFQAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAFQAgAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMADAwMDAwMFAwMFB0UFBQdJx0dHR0nMScnJycnMTsxMTExMTE7Ozs7Ozs7O0dHR0dHR1NTU1NTXV1dXV1dXV1dXf/bAEMBDg8PGBYYKBYWKGFCNkJhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYf/dAAQAAv/aAAwDAQACEQMRAD8AzLfTLea4EioSp+bLDgj0rdaA4qjpGr26WqW86/dAG7P863vtVmUyG56Yr06NSEFoeLWpzkzGeE1C8DDkjrWpNdW3lsVOQxIGOuMdayrnV1UExqrBAMg9fTNavFwuSsNNo//Q8/guZFwR2Na1tqs3miHYpRzyDz/9f9awoun41Ztv+PpPrQ5O1zGyOkS43Fi4+UA/KpI/nmoL53EQnY5z8uMAcfUAU1Ojf7pov/8AjyX/AHv8aIxTg2F9bH//2Q==';

export default function Login() {
  const { login } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();

  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [verPass, setVerPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fondoListo, setFondoListo] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const role = await login(usuario.trim(), password);
      navigate(role === 'admin' ? '/admin' : role === 'reseller' ? '/reseller' : '/cliente', { replace: true });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden grid place-items-center p-5">
      {/* ---- Fondo: foto desenfocada con deriva lenta ---- */}
      <div
        className="absolute inset-0 -z-20 bg-gray-950 bg-cover bg-center"
        style={{ backgroundImage: `url(${LQIP})` }}
      >
        <img
          src="/login-bg.jpg" alt="" aria-hidden="true"
          onLoad={() => setFondoListo(true)}
          className={`w-full h-full object-cover transition-opacity duration-1000 ${fondoListo ? 'opacity-100' : 'opacity-0'}`}
          /* Foto QUIETA: el movimiento lo ponen solo las nubes.
             El desenfoque (5px) deja ver la ciudad sin competir con el
             formulario, y el `scale` compensa que el blur difumina los bordes
             y dejaría una franja transparente alrededor. */
          style={{ filter: 'blur(5px) saturate(1.05)', transform: 'scale(1.04)' }}
        />
      </div>

      {/* Nubes cruzando el cielo. Van por encima de la foto pero por debajo del
          oscurecido, así se integran con la escena en vez de flotar sueltas. */}
      <div className="pointer-events-none absolute inset-0 -z-[15] overflow-hidden">
        {NUBES.map((n, i) => (
          <Nube key={i} {...n} />
        ))}
      </div>

      {/* Oscurecido. La foto es CLARA (cielo azul intenso) y encima va texto
          blanco: sin esto el título queda en ~2,7:1 de contraste, ilegible.
          El degradado aprieta arriba y abajo y afloja en el centro, donde está
          la ciudad, para no apagar la imagen entera. */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/65 via-slate-950/30 to-slate-950/72" />
      {/* Foco suave detrás de la tarjeta, para despegarla del fondo. */}
      <div
        className="absolute inset-0 -z-10"
        style={{ background: 'radial-gradient(ellipse 55% 55% at 50% 55%, rgba(2,6,23,.55), transparent 70%)' }}
      />

      {/* Un halo verde de marca, tenue, para que el azul no se coma la identidad */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="login-halo absolute -bottom-40 -left-24 w-[30rem] h-[30rem] rounded-full bg-brand-500/15 blur-3xl" />
      </div>

      <button
        onClick={toggle}
        className="absolute top-5 right-5 w-9 h-9 grid place-items-center rounded-xl border border-white/20 bg-white/10 text-white/80 backdrop-blur hover:border-brand-400 hover:text-white transition"
        title={dark ? 'Modo día' : 'Modo noche'}
      >
        {dark ? <IconSun width={18} height={18} /> : <IconMoon width={18} height={18} />}
      </button>

      <div className="w-full max-w-sm relative">
        {/* ---- Marca ---- */}
        <div className="text-center mb-7 login-entra">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 rounded-2xl bg-brand-500/40 blur-xl" />
            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 grid place-items-center text-white shadow-lg shadow-brand-900/40 ring-1 ring-white/20">
              <FontAwesomeIcon icon={faTowerBroadcast} className="text-2xl" />
            </div>
          </div>
          <h1 className="text-[1.7rem] leading-tight font-bold text-white tracking-tight">
            Panel <span className="text-brand-400">Asi Streaming</span>
          </h1>
          {/* white/80 y no /60: medido sobre el fondo real, a /60 el contraste
              cae a 3,6:1 y este texto es pequeño (necesita 4,5). */}
          <p className="text-sm text-white/80 mt-1.5">Inicia sesión en tu cuenta</p>

          {/* Audio y video se manejan desde el mismo panel */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {[[faMicrophoneLines, 'Audio'], [faVideo, 'Video']].map(([ic, txt]) => (
              <span key={txt} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white/90 bg-white/10 border border-white/15 rounded-full px-2.5 py-1 backdrop-blur">
                <FontAwesomeIcon icon={ic} className="text-brand-300" /> {txt}
              </span>
            ))}
          </div>
        </div>

        {/* ---- Tarjeta ---- */}
        <form
          onSubmit={onSubmit}
          className="login-entra rounded-2xl border border-white/15 bg-white/85 dark:bg-gray-900/70 backdrop-blur-xl shadow-2xl shadow-black/40 p-6 space-y-4"
          style={{ animationDelay: '.08s' }}
        >
          <Campo icono={faUser} label="Usuario">
            <input
              className="input !pl-10 bg-white/70 dark:bg-gray-950/60" type="text" value={usuario}
              autoComplete="username" autoFocus
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="tu usuario" required
            />
          </Campo>

          <Campo icono={faLock} label="Contraseña">
            <input
              className="input !pl-10 !pr-10 bg-white/70 dark:bg-gray-950/60"
              type={verPass ? 'text' : 'password'} value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" required
            />
            <button
              type="button" onClick={() => setVerPass((v) => !v)} tabIndex={-1}
              title={verPass ? 'Ocultar contraseña' : 'Ver contraseña'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-brand-600 transition z-10"
            >
              <FontAwesomeIcon icon={verPass ? faEyeSlash : faEye} />
            </button>
          </Campo>

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-xl px-3 py-2">
              <FontAwesomeIcon icon={faCircleExclamation} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button className="btn-primary w-full !py-3" disabled={loading}>
            {loading ? (
              <><FontAwesomeIcon icon={faCircleNotch} spin /> Entrando…</>
            ) : (
              <><FontAwesomeIcon icon={faArrowRightToBracket} /> Entrar</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ---- Nubes ----------------------------------------------------------
 * Se dibujan con SVG en vez de una imagen: pesan cero, escalan sin pixelarse
 * y se pueden teñir.
 *
 * Para que no parezcan pegatinas de dibujos animados hay tres trucos:
 *   1. El contorno se deforma con `feTurbulence` + `feDisplacementMap`, que le
 *      come el borde de forma irregular. Sin esto se notan los óvalos.
 *   2. Se rellenan con un degradado vertical (blanco arriba, azul grisáceo
 *      abajo): las nubes reales reciben la luz desde el cielo, no son planas.
 *   3. Cada una lleva su propia `semilla` de ruido, así no hay dos iguales.
 *
 * La opacidad va en el <g> y no en cada óvalo, porque si no se ven las
 * costuras donde se solapan. Los retardos son NEGATIVOS para que al cargar la
 * página ya estén repartidas por el cielo en vez de entrar todas juntas.
 */
const NUBES = [
  { top: '7%',  ancho: 560, opacidad: 0.80, seg: 170, retardo: -25,  desenfoque: 3, semilla: 7 },
  { top: '19%', ancho: 320, opacidad: 0.50, seg: 115, retardo: -75,  desenfoque: 2, semilla: 21 },
  { top: '32%', ancho: 700, opacidad: 0.42, seg: 230, retardo: -140, desenfoque: 6, semilla: 44 },
  { top: '4%',  ancho: 230, opacidad: 0.42, seg: 95,  retardo: -50,  desenfoque: 2, semilla: 58 },
  { top: '44%', ancho: 430, opacidad: 0.26, seg: 190, retardo: -100, desenfoque: 5, semilla: 91 },
];

function Nube({ top, ancho, opacidad, seg, retardo, desenfoque, semilla }) {
  const idF = `nubeF${semilla}`;
  const idG = `nubeG${semilla}`;
  return (
    <svg
      viewBox="0 0 220 110" aria-hidden="true"
      className="login-nube absolute left-0 overflow-visible"
      style={{
        top, width: ancho, filter: `blur(${desenfoque}px)`,
        animationDuration: `${seg}s`, animationDelay: `${retardo}s`,
      }}
    >
      <defs>
        {/* El área del filtro se agranda: el desplazamiento saca píxeles fuera
            del viewBox y, sin esto, el borde saldría recortado en recto. */}
        <filter id={idF} x="-25%" y="-40%" width="150%" height="190%">
          <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="4" seed={semilla} result="ruido" />
          <feDisplacementMap in="SourceGraphic" in2="ruido" scale="22" xChannelSelector="R" yChannelSelector="G" />
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
        <linearGradient id={idG} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="62%" stopColor="#f2f7ff" />
          <stop offset="100%" stopColor="#c3d4e8" />
        </linearGradient>
      </defs>

      {/* Silueta con lóbulos de tamaños dispares: los montículos regulares son
          justo lo que delata a una nube dibujada. */}
      <g fill={`url(#${idG})`} opacity={opacidad} filter={`url(#${idF})`}>
        <ellipse cx="58" cy="70" rx="40" ry="22" />
        <ellipse cx="92" cy="52" rx="34" ry="28" />
        <ellipse cx="128" cy="44" rx="28" ry="24" />
        <ellipse cx="156" cy="62" rx="33" ry="21" />
        <ellipse cx="182" cy="72" rx="24" ry="15" />
        <ellipse cx="40" cy="76" rx="22" ry="13" />
        <rect x="34" y="66" width="158" height="24" rx="12" />
      </g>
    </svg>
  );
}

/**
 * Campo con su etiqueta y el icono dentro del input.
 *
 * El `relative` envuelve SOLO al input, no a la etiqueta: así el icono se centra
 * con `top-1/2` respecto al input y no depende de cuánto mida la etiqueta (con
 * un `top` fijo calculado a mano quedaba descentrado hacia arriba).
 */
function Campo({ icono, label, children }) {
  return (
    <div>
      <label className="label !text-gray-600 dark:!text-gray-300">{label}</label>
      <div className="relative">
        <FontAwesomeIcon
          icon={icono}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none z-10"
        />
        {children}
      </div>
    </div>
  );
}
