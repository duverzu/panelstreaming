import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth';
import {
  IconDashboard, IconUsers, IconRadio, IconInvoice, IconChart,
  IconMic, IconMusic, IconPlaylist, IconSliders, IconSettings, IconShare, IconServer,
} from '../icons';

// `to` = ruta real (navegable). `soon` = aún no implementado (atenuado).
const MENUS = {
  admin: [
    { seccion: 'Gestión', items: [
      { label: 'Dashboard', icon: IconDashboard, to: '/admin' },
      { label: 'Clientes', icon: IconUsers, to: '/admin/clientes' },
      { label: 'Revendedores', icon: IconShare, to: '/admin/revendedores' },
      { label: 'Planes', icon: IconInvoice, to: '/admin/planes' },
    ]},
    { seccion: 'Infraestructura', items: [
      { label: 'Servidores', icon: IconServer, to: '/admin/servidores' },
      { label: 'Estadísticas', icon: IconChart, to: '/admin/estadisticas' },
    ]},
  ],
  reseller: [
    { seccion: 'Gestión', items: [
      { label: 'Dashboard', icon: IconDashboard, to: '/reseller' },
      { label: 'Mis Radios', icon: IconUsers, to: '/reseller/clientes' },
      { label: 'Mis Planes', icon: IconInvoice, to: '/reseller/planes' },
      { label: 'Estadísticas', icon: IconChart, to: '/reseller/estadisticas' },
    ]},
  ],
  cliente: [
    { seccion: 'Mi Radio', items: [
      { label: 'Dashboard', icon: IconDashboard, to: '/cliente' },
      { label: 'AutoDJ', icon: IconSliders, to: '/cliente/autodj' },
    ]},
    { seccion: 'Contenido', items: [
      { label: 'Música', icon: IconMusic, to: '/cliente/musica' },
      { label: 'Playlists', icon: IconPlaylist, to: '/cliente/playlists' },
      { label: 'Reproductor', icon: IconRadio, to: '/cliente/reproductor' },
      { label: 'Redes Sociales', icon: IconShare, to: '/cliente/redes' },
      { label: 'Estadísticas', icon: IconChart, to: '/cliente/estadisticas' },
    ]},
    { seccion: 'Cuenta', items: [
      { label: 'Configuración', icon: IconSettings, to: '/cliente/configuracion' },
    ]},
  ],
};

export default function Sidebar() {
  const { role } = useAuth();
  const menu = MENUS[role] || MENUS.admin;

  const itemClass = (isActive) =>
    `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
      isActive
        ? 'bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400'
        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
    }`;

  return (
    <aside className="hidden md:flex md:w-64 shrink-0 flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="h-16 flex items-center gap-2 px-6 border-b border-gray-200 dark:border-gray-800">
        <div className="w-8 h-8 rounded-lg bg-brand-600 grid place-items-center text-white text-lg">🎙️</div>
        <div>
          <div className="font-bold leading-tight">Panel Radio</div>
          <div className="text-[11px] text-gray-400 leading-tight">
            {role === 'admin' ? 'Super Admin' : role === 'reseller' ? 'Revendedor' : 'Portal Cliente'}
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {menu.map((grupo) => (
          <div key={grupo.seccion}>
            <div className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              {grupo.seccion}
            </div>
            <div className="space-y-1">
              {grupo.items.map((item) => {
                const Icon = item.icon;
                if (item.soon) {
                  return (
                    <div key={item.label} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 opacity-45 cursor-not-allowed">
                      <Icon />
                      <span className="flex-1 text-left">{item.label}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400">pronto</span>
                    </div>
                  );
                }
                return (
                  <NavLink key={item.label} to={item.to} end className={({ isActive }) => itemClass(isActive)}>
                    {({ isActive }) => (
                      <>
                        <Icon className={isActive ? 'text-brand-600 dark:text-brand-400' : ''} />
                        <span className="flex-1 text-left">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
