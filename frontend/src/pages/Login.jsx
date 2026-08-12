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
const LQIP = 'data:image/jpeg;base64,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';

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
          className={`login-deriva w-full h-full object-cover transition-opacity duration-1000 ${fondoListo ? 'opacity-100' : 'opacity-0'}`}
          /* Suficiente para que no compita con el formulario, pero no tanto como
             para perder la foto: a 14px quedaba un puré verde irreconocible. */
          style={{ filter: 'blur(9px) saturate(1.2)' }}
        />
      </div>

      {/* Oscurecido: la foto es clara en el centro y ahí va el texto blanco */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-gray-950/70 via-gray-950/45 to-gray-950/85" />

      {/* Halos verdes de marca, flotando muy despacio */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="login-halo absolute -top-32 -left-24 w-[26rem] h-[26rem] rounded-full bg-brand-500/20 blur-3xl" />
        <div className="login-halo absolute -bottom-40 -right-20 w-[30rem] h-[30rem] rounded-full bg-emerald-300/10 blur-3xl" style={{ animationDelay: '-9s' }} />
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
          <p className="text-sm text-white/60 mt-1.5">Inicia sesión en tu cuenta</p>

          {/* Audio y video se manejan desde el mismo panel */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {[[faMicrophoneLines, 'Audio'], [faVideo, 'Video']].map(([ic, txt]) => (
              <span key={txt} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white/75 bg-white/10 border border-white/15 rounded-full px-2.5 py-1 backdrop-blur">
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
