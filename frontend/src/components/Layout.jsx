import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import Sidebar from './Sidebar';
import TopHeader from './TopHeader';
import { IconEnter } from '../icons';

const TITULOS = {
  '/admin': { title: 'Dashboard', subtitle: 'Resumen general del negocio' },
  '/admin/clientes': { title: 'Clientes', subtitle: 'Gestiona radios: iniciar, parar, suspender, borrar' },
  '/admin/planes': { title: 'Planes', subtitle: 'Plantillas de radio y sus límites' },
  '/admin/estadisticas': { title: 'Estadísticas', subtitle: 'Audiencia y rendimiento del negocio' },
  '/cliente/musica': { title: 'Música', subtitle: 'Tu biblioteca para el AutoDJ' },
  '/cliente/playlists': { title: 'Playlists', subtitle: 'Música, jingles/spots y programas por horario' },
  '/cliente/estadisticas': { title: 'Estadísticas', subtitle: 'Oyentes en vivo y audiencia de tu radio' },
  '/cliente/autodj': { title: 'AutoDJ', subtitle: 'Cómo suena tu radio en automático' },
  '/cliente/reproductor': { title: 'Reproductor', subtitle: 'Pon tu radio en tu sitio web' },
  '/cliente/configuracion': { title: 'Configuración', subtitle: 'Tu radio y tu cuenta' },
};

export default function Layout() {
  const { role, user, impersonating, stopImpersonating } = useAuth();
  const { pathname } = useLocation();

  const porRuta = TITULOS[pathname];
  const title = porRuta?.title || (role === 'admin' ? 'Dashboard' : 'Mi Radio');
  const subtitle =
    porRuta?.subtitle ||
    (role === 'admin' ? 'Resumen general del negocio' : user?.nombre_empresa || 'Panel de tu estación');

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Banner de impersonación (admin viendo como cliente) */}
        {impersonating && (
          <div className="bg-amber-500 text-white text-sm px-5 py-2 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <IconEnter width={16} height={16} />
              Estás viendo como <b>{user?.nombre_empresa || 'cliente'}</b> (modo revisión)
            </span>
            <button
              onClick={stopImpersonating}
              className="font-semibold underline underline-offset-2 hover:opacity-90"
            >
              ← Volver a Super Admin
            </button>
          </div>
        )}

        <TopHeader title={title} subtitle={subtitle} />

        <main className="flex-1 overflow-y-auto p-5 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
