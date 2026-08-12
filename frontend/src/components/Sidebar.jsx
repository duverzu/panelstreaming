import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { apiFetch } from '../api';
import Player from './Player';
import {
  IconDashboard, IconUsers, IconRadio, IconInvoice, IconChart,
  IconMic, IconMusic, IconPlaylist, IconSliders, IconSettings, IconShare, IconServer,
} from '../icons';

// `to` = ruta real (navegable). `soon` = aún no implementado (atenuado).
//
// El menú del admin va por ENTIDAD, no por servicio. Antes estaba al revés
// (una sección de Audio y otra de Video), y como las dos necesitan Clientes,
// Planes, Servidores y Documentación, todo salía duplicado: 13 entradas para
// 9 destinos reales, y ninguna vista del negocio completo.
// Audio o video se elige ahora con el selector de la cabecera (ver ambito.jsx).
const MENUS = {
  admin: [
    { seccion: 'General', items: [
      { label: 'Dashboard', icon: IconDashboard, to: '/admin' },
    ]},
    { seccion: 'Negocio', items: [
      { label: 'Clientes', icon: IconUsers, to: '/admin/clientes' },
      { label: 'Planes', icon: IconInvoice, to: '/admin/planes' },
      { label: 'Revendedores', icon: IconShare, to: '/admin/revendedores' },
    ]},
    { seccion: 'Operación', items: [
      { label: 'Servidores', icon: IconServer, to: '/admin/servidores' },
      { label: 'Estadísticas', icon: IconChart, to: '/admin/estadisticas' },
    ]},
    { seccion: 'Sistema', items: [
      { label: 'Documentación', icon: IconInvoice, to: '/admin/documentacion' },
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
      { label: 'Conectar', icon: IconMic, to: '/cliente/conectar' },
    ]},
    { seccion: '🎚️ AutoDJ', items: [
      { label: 'Ajustes y hora', icon: IconSliders, to: '/cliente/autodj' },
      { label: 'Música', icon: IconMusic, to: '/cliente/musica' },
      { label: 'Playlists', icon: IconPlaylist, to: '/cliente/playlists' },
      { label: 'Cuñas', icon: IconMic, to: '/cliente/cunas' },
    ]},
    { seccion: 'Difusión', items: [
      { label: 'Reproductor', icon: IconRadio, to: '/cliente/reproductor' },
      { label: 'Redes Sociales', icon: IconShare, to: '/cliente/redes' },
      { label: 'Estadísticas', icon: IconChart, to: '/cliente/estadisticas' },
    ]},
    { seccion: 'Cuenta', items: [
      { label: 'Configuración', icon: IconSettings, to: '/cliente/configuracion' },
      { label: 'Aprende', icon: IconMic, to: '/cliente/aprende' },
    ]},
  ],
};

export default function Sidebar() {
  const { role, user } = useAuth();
  const loc = useLocation();
  // Un cliente de video ve otro menú: las páginas de radio no le sirven
  const esVideo = role === 'cliente' && user?.tipo === 'video';
  let menu = (esVideo ? MENUS.cliente_video : MENUS[role]) || MENUS.admin;

  // Cliente de video SOLO EN VIVO (plan sin almacenamiento o canal asilivehd):
  // no usa VOD/24-7, así que se le ocultan "Gestionar videos" y "Playlist".
  if (esVideo && user?.permite_vod === false) {
    const ocultar = ['/cliente/videos', '/cliente/playlist'];
    menu = menu
      .map((g) => ({ ...g, items: g.items.filter((it) => !ocultar.includes(it.to)) }))
      .filter((g) => g.items.length > 0);
  }

  // Activo teniendo en cuenta el ?tipo= (dos ítems pueden compartir ruta y
  // diferenciarse solo por el tipo: Clientes de audio vs Clientes de video).
  // Basta con comparar la ruta: ya no hay dos ítems compartiendo destino y
  // diferenciándose por el `?tipo=` (eso desapareció al unificar el menú).
  const esActivo = (to) => Boolean(to) && loc.pathname === to;

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
          <div className="font-bold leading-tight">Asi Streaming</div>
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

      {role === 'admin' && <MonitorRadio />}
    </aside>
  );
}

/**
 * Monitor de radio, anclado al pie del sidebar.
 *
 * Antes vivía en una tarjeta del Dashboard, así que al navegar a cualquier otra
 * página se desmontaba y se cortaba el audio. Aquí el sidebar no se remonta al
 * cambiar de ruta: puedes dejar una estación sonando mientras trabajas, que es
 * justo para lo que sirve un monitor.
 */
function MonitorRadio() {
  const [radios, setRadios] = useState([]);
  const [sel, setSel] = useState('');
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    apiFetch('/admin/clientes')
      .then((d) => setRadios((d.clientes || []).filter((c) => c.url_streaming && (c.tipo || 'audio') !== 'video')))
      .catch(() => {});
  }, []);

  if (radios.length === 0) return null;
  const actual = radios.find((r) => String(r.id) === String(sel)) || radios[0];

  return (
    <div className="shrink-0 border-t border-gray-200 dark:border-gray-800 p-3">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center gap-2 text-[11px] uppercase tracking-wide text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition mb-2"
      >
        <IconRadio width={14} height={14} />
        <span className="flex-1 text-left">Monitor de radio</span>
        <span>{abierto ? '▾' : '▸'}</span>
      </button>

      {abierto && (
        <div className="space-y-2">
          <select
            className="input !py-1.5 !text-xs"
            value={actual?.id || ''}
            onChange={(e) => setSel(e.target.value)}
          >
            {radios.map((r) => <option key={r.id} value={r.id}>{r.nombre_empresa}</option>)}
          </select>
          {actual && <Player src={actual.url_streaming} title={actual.nombre_empresa} subtitle="Monitoreando" />}
        </div>
      )}
    </div>
  );
}
