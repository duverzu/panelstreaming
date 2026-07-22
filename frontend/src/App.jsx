import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Aprende from './pages/Aprende';
import AdminDashboard from './pages/admin/Dashboard';
import AdminDocumentacion from './pages/admin/Documentacion';
import AdminApiIntegracion from './pages/admin/ApiIntegracion';
import AdminClientes from './pages/admin/Clientes';
import AdminPlanes from './pages/admin/Planes';
import AdminEstadisticas from './pages/admin/Estadisticas';
import AdminRevendedores from './pages/admin/Revendedores';
import AdminServidores from './pages/admin/Servidores';
import AdminConfiguracion from './pages/admin/Configuracion';
import ResellerDashboard from './pages/reseller/Dashboard';
import ResellerClientes from './pages/reseller/Clientes';
import ResellerPlanes from './pages/reseller/Planes';
import ResellerEstadisticas from './pages/reseller/Estadisticas';
import ClienteDashboard from './pages/cliente/Dashboard';
import ClienteMusica from './pages/cliente/Musica';
import ClientePlaylists from './pages/cliente/Playlists';
import ClienteEstadisticas from './pages/cliente/Estadisticas';
import ClienteAutoDJ from './pages/cliente/AutoDJ';
import ClienteReproductor from './pages/cliente/Reproductor';
import ClienteRedes from './pages/cliente/Redes';
import ClienteConectar from './pages/cliente/Conectar';
import ClienteConfiguracion from './pages/cliente/Configuracion';
import VideoInicio from './pages/cliente/video/Inicio';
import VideoGestionar from './pages/cliente/video/Gestionar';
import VideoPlaylist from './pages/cliente/video/Playlist';
import VideoReproductor from './pages/cliente/video/Reproductor';
import VideoEnlaces from './pages/cliente/video/Enlaces';
import VideoConectar from './pages/cliente/video/Conectar';

/** Ruta protegida por rol. */
function Protected({ role, children }) {
  const { token, role: userRole } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (role && userRole !== role) return <Navigate to={homeDe(userRole)} replace />;
  return children;
}

function homeDe(role) {
  return role === 'admin' ? '/admin' : role === 'reseller' ? '/reseller' : '/cliente';
}

/** Estas páginas existen para audio y para video: se elige según el tipo. */
function InicioCliente() {
  const { user } = useAuth();
  return user?.tipo === 'video' ? <VideoInicio /> : <ClienteDashboard />;
}
function ReproductorCliente() {
  const { user } = useAuth();
  return user?.tipo === 'video' ? <VideoReproductor /> : <ClienteReproductor />;
}
function ConectarCliente() {
  const { user } = useAuth();
  return user?.tipo === 'video' ? <VideoConectar /> : <ClienteConectar />;
}

export default function App() {
  const { token, role } = useAuth();
  const home = homeDe(role);

  return (
    <Routes>
      <Route
        path="/login"
        element={token ? <Navigate to={home} replace /> : <Login />}
      />

      {/* Panel Admin */}
      <Route path="/admin" element={<Protected role="admin"><Layout /></Protected>}>
        <Route index element={<AdminDashboard />} />
        <Route path="clientes" element={<AdminClientes />} />
        <Route path="planes" element={<AdminPlanes />} />
        <Route path="revendedores" element={<AdminRevendedores />} />
        <Route path="servidores" element={<AdminServidores />} />
        <Route path="documentacion" element={<AdminDocumentacion />} />
        <Route path="configuracion" element={<AdminConfiguracion />} />
        <Route path="api" element={<AdminApiIntegracion />} />
        <Route path="estadisticas" element={<AdminEstadisticas />} />
      </Route>

      {/* Panel Revendedor */}
      <Route path="/reseller" element={<Protected role="reseller"><Layout /></Protected>}>
        <Route index element={<ResellerDashboard />} />
        <Route path="clientes" element={<ResellerClientes />} />
        <Route path="planes" element={<ResellerPlanes />} />
        <Route path="estadisticas" element={<ResellerEstadisticas />} />
        <Route path="aprende" element={<Aprende />} />
      </Route>

      {/* Panel Cliente */}
      <Route path="/cliente" element={<Protected role="cliente"><Layout /></Protected>}>
        {/* El cliente de video ve su canal; el de audio, su radio */}
        <Route index element={<InicioCliente />} />
        <Route path="videos" element={<VideoGestionar />} />
        <Route path="playlist" element={<VideoPlaylist />} />
        {/* reproductor/conectar del cliente de video comparten ruta con los de audio abajo */}
        <Route path="musica" element={<ClienteMusica />} />
        <Route path="playlists" element={<ClientePlaylists />} />
        <Route path="autodj" element={<ClienteAutoDJ />} />
        <Route path="reproductor" element={<ReproductorCliente />} />
        <Route path="redes" element={<ClienteRedes />} />
        <Route path="conectar" element={<ConectarCliente />} />
        <Route path="enlaces" element={<VideoEnlaces />} />
        <Route path="estadisticas" element={<ClienteEstadisticas />} />
        <Route path="aprende" element={<Aprende />} />
        <Route path="configuracion" element={<ClienteConfiguracion />} />
      </Route>

      <Route path="*" element={<Navigate to={token ? home : '/login'} replace />} />
    </Routes>
  );
}
