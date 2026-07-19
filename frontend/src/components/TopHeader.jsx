import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { IconSun, IconMoon, IconLogout, IconChevronDown } from '../icons';

export default function TopHeader({ title, subtitle }) {
  const { user, role, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const aprendeUrl = role === 'reseller' ? '/reseller/aprende' : role === 'cliente' ? '/cliente/aprende' : null;

  const email = user?.email || '';
  const inicial = (email[0] || '?').toUpperCase();

  return (
    <header className="h-16 shrink-0 flex items-center justify-between px-5 md:px-8 border-b border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-950/60 backdrop-blur sticky top-0 z-20">
      <div>
        <h1 className="text-lg font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="text-xs text-gray-400 leading-tight">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2">
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
            <span className="hidden sm:block text-sm max-w-[140px] truncate">{email}</span>
            <IconChevronDown width={16} height={16} className="text-gray-400" />
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div className="absolute right-0 mt-2 w-56 card p-1.5 z-20">
                <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
                  <div className="text-sm font-medium truncate">{email}</div>
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
