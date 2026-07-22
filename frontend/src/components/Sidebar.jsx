import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import {
  IconDashboard, IconUsers, IconRadio, IconInvoice, IconChart,
  IconMic, IconMusic, IconPlaylist, IconSliders, IconSettings, IconShare, IconServer,
} from '../icons';

// `to` = ruta real (navegable). `soon` = aún no implementado (atenuado).
// El super admin separa Audio y Video: las páginas se reusan con ?tipo=…
const MENUS = {
  admin: [
    { seccion: 'General', items: [
      { label: 'Dashboard', icon: IconDashboard, to: '/admin' },
    ]},
    { seccion: '🎙️ Streaming Audio', items: [
      { label: 'Clientes', icon: IconUsers, to: '/admin/clientes?tipo=audio' },
      { label: 'Revendedores', icon: IconShare, to: '/admin/revendedores' },
      { label: 'Planes', icon: IconInvoice, to: '/admin/planes?tipo=audio' },
      { label: 'Estadísticas', icon: IconChart, to: '/admin/estadisticas' },
      { label: 'Servidores', icon: IconServer, to: '/admin/servidores?tipo=audio' },
      { label: 'Documentación', icon: IconInvoice, to: '/admin/documentacion?tipo=audio' },
    ]},
    { seccion: '🎬 Streaming Video', items: [
      { label: 'Clientes', icon: IconUsers, to: '/admin/clientes?tipo=video' },
      { label: 'Planes', icon: IconInvoice, to: '/admin/planes?tipo=video' },
      { label: 'Servidores', icon: IconServer, to: '/admin/servidores?tipo=video' },
      { label: 'Documentación', icon: IconInvoice, to: '/admin/documentacion?tipo=video' },
      { label: 'Revendedores', icon: IconShare, soon: true },
      { label: 'Estadísticas', icon: IconChart, soon: true },
    ]},
    { seccion: 'Sistema', items: [
      { label: 'Configuración', icon: IconSettings, to: '/admin/configuracion' },
      { label: 'API / Integración', icon: IconShare, to: '/admin/api' },
    ]},
  ],
  reseller: [
    { seccion: 'Gestión', items: [
      { label: 'Dashboard', icon: IconDashboard, to: '/reseller' },
      { label: 'Mis Radios', icon: IconUsers, to: '/reseller/clientes' },
      { label: 'Mis Planes', icon: IconInvoice, to: '/reseller/planes' },
      { label: 'Estadísticas', icon: IconChart, to: '/reseller/estadisticas' },
    ]},
    { seccion: 'Ayuda', items: [
      { label: 'Aprende', icon: IconMic, to: '/reseller/aprende' },
    ]},
  ],
  // Cliente de VIDEO: mismo panel, otro contenido
  cliente_video: [
    { seccion: 'Mi Canal', items: [
      { label: 'Inicio', icon: IconDashboard, to: '/cliente' },
      { label: 'Gestionar videos', icon: IconMusic, to: '/cliente/videos' },
      { label: 'Playlist', icon: IconPlaylist, to: '/cliente/playlist' },
    ]},
    { seccion: 'Difusión', items: [
      { label: 'Reproductor', icon: IconRadio, to: '/cliente/reproductor' },
      { label: 'Enlaces', icon: IconShare, to: '/cliente/enlaces' },
      { label: 'Conectar (en vivo)', icon: IconMic, to: '/cliente/conectar' },
    ]},
    { seccion: 'Cuenta', items: [
      { label: 'Configuración', icon: IconSettings, to: '/cliente/configuracion' },
      { label: 'Aprende', icon: IconMic, to: '/cliente/aprende' },
    ]},
  ],

  cliente: [
    { seccion: 'Mi Radio', items: [
      { label: 'Dashboard', icon: IconDashboard, to: '/cliente' },
      { label: 'AutoDJ', icon: IconSliders, to: '/cliente/autodj' },
      { label: 'Conectar', icon: IconMic, to: '/cliente/conectar' },
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
    { seccion: 'Ayuda', items: [
      { label: 'Aprende', icon: IconMic, to: '/cliente/aprende' },
    ]},
  ],
};

export default function Sidebar() {
  const { role, user } = useAuth();
  const loc = useLocation();
  // Un cliente de video ve otro menú: las páginas de radio no le sirven
  const esVideo = role === 'cliente' && user?.tipo === 'video';
  const menu = (esVideo ? MENUS.cliente_video : MENUS[role]) || MENUS.admin;

  // Activo teniendo en cuenta el ?tipo= (dos ítems pueden compartir ruta y
  // diferenciarse solo por el tipo: Clientes de audio vs Clientes de video).
  const esActivo = (to) => {
    if (!to) return false;
    const [path, query] = to.split('?');
    if (loc.pathname !== path) return false;
    const tActual = new URLSearchParams(loc.search).get('tipo');
    const tItem = query ? new URLSearchParams(query).get('tipo') : null;
    return tItem ? tActual === tItem : !tActual;
  };

  const itemClass = (isActive) =>
    `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
      isActive
        ? 'bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400'
        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
    }`;

  return (
    <aside className="hidden md:flex md:w-64 shrink-0 flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="h-16 flex items-center gap-2 px-6 border-b border-gray-200 dark:border-gray-800">
        <div className="w-8 h-8 rounded-lg bg-brand-600 grid place-items-center text-white text-lg">{esVideo ? '🎬' : '🎙️'}</div>
        <div>
          <div className="font-bold leading-tight">{esVideo ? 'Panel Video' : 'Panel Radio'}</div>
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
                const activo = esActivo(item.to);
                return (
                  <NavLink key={item.label} to={item.to} end className={itemClass(activo)}>
                    <Icon className={activo ? 'text-brand-600 dark:text-brand-400' : ''} />
                    <span className="flex-1 text-left">{item.label}</span>
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
