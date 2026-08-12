import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { useAmbito, AMBITOS, ETIQUETA } from '../ambito';
import { IconSun, IconMoon, IconLogout, IconChevronDown } from '../icons';

/**
 * Selector Todo / Audio / Video. Solo para el admin: es el único que gestiona
 * los dos servicios (los clientes ya entran a su panel por su `tipo`).
 *
 * Va aquí arriba y siempre visible a propósito. El riesgo de un modo global es
 * olvidarse de en cuál estás y malinterpretar lo que ves ("¿solo 13 clientes?"),
 * así que tiene que estar delante todo el rato, no escondido en el menú.
 */
function SelectorAmbito() {
  const { ambito, setAmbito } = useAmbito();
  return (
    <div className="hidden sm:flex items-center gap-0.5 p-0.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
      {AMBITOS.map((a) => (
        <button
          key={a}
          onClick={() => setAmbito(a)}
          title={`Ver solo ${ETIQUETA[a].txt}`}
          className={`px-2.5 py-1.5 rounded-[10px] text-xs font-medium transition ${
            ambito === a
              ? 'bg-white dark:bg-gray-800 text-brand-700 dark:text-brand-400 shadow-sm'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <span className="mr-1">{ETIQUETA[a].icono}</span>{ETIQUETA[a].txt}
        </button>
      ))}
    </div>
  );
}

export default function TopHeader({ title, subtitle }) {
  const { user, role, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const aprendeUrl = role === 'reseller' ? '/reseller/aprende' : role === 'cliente' ? '/cliente/aprende' : null;

  const email = user?.email || '';
  const usuario = user?.username || email;
  const inicial = (usuario[0] || '?').toUpperCase();

  return (
    <header className="h-16 shrink-0 flex items-center justify-between px-5 md:px-8 border-b border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-950/60 backdrop-blur sticky top-0 z-20">
      <div>
        <h1 className="text-lg font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="text-xs text-gray-400 leading-tight">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2">
        {role === 'admin' && <SelectorAmbito />}

        {/* Botón llamativo Aprende (cliente y revendedor) */}
        {aprendeUrl && (
          <Link to={aprendeUrl}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-brand-500 to-emerald-600 hover:opacity-90 shadow-sm transition">
            📚 Aprende
          </Link>
        )}
        {/* Toggle día/noche */}
        <button
          onClick={toggle}
          className="w-9 h-9 grid place-items-center rounded-xl border border-gray-200 dark:border-gray-800 hover:border-brand-500 transition"
          title={dark ? 'Modo día' : 'Modo noche'}
        >
          {dark ? <IconSun width={18} height={18} /> : <IconMoon width={18} height={18} />}
        </button>

        {/* Menú de usuario */}
        <div className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-brand-500 transition"
          >
            <div className="w-7 h-7 rounded-lg bg-brand-600 text-white grid place-items-center text-xs font-bold">
              {inicial}
            </div>
            <span className="hidden sm:block text-sm max-w-[140px] truncate">{usuario}</span>
            <IconChevronDown width={16} height={16} className="text-gray-400" />
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div className="absolute right-0 mt-2 w-56 card p-1.5 z-20">
                <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
                  <div className="text-sm font-medium truncate">{usuario}</div>
                  {email && <div className="text-xs text-gray-400 truncate">{email}</div>}
                  <div className="text-xs text-gray-400 capitalize">{role}</div>
                </div>
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-2 px-3 py-2 mt-1 rounded-lg text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition"
                >
                  <IconLogout width={16} height={16} /> Cerrar sesión
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
