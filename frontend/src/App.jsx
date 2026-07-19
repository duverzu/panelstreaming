import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import AdminDashboard from './pages/admin/Dashboard';
import AdminClientes from './pages/admin/Clientes';
import AdminPlanes from './pages/admin/Planes';
import AdminEstadisticas from './pages/admin/Estadisticas';
import AdminRevendedores from './pages/admin/Revendedores';
import ResellerDashboard from './pages/reseller/Dashboard';
import ResellerClientes from './pages/reseller/Clientes';
import ClienteDashboard from './pages/cliente/Dashboard';
import ClienteMusica from './pages/cliente/Musica';
import ClientePlaylists from './pages/cliente/Playlists';
import ClienteEstadisticas from './pages/cliente/Estadisticas';
import ClienteAutoDJ from './pages/cliente/AutoDJ';
import ClienteReproductor from './pages/cliente/Reproductor';
import ClienteRedes from './pages/cliente/Redes';
import ClienteConfiguracion from './pages/cliente/Configuracion';

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
        <Route path="estadisticas" element={<AdminEstadisticas />} />
      </Route>

      {/* Panel Revendedor */}
      <Route path="/reseller" element={<Protected role="reseller"><Layout /></Protected>}>
        <Route index element={<ResellerDashboard />} />
        <Route path="clientes" element={<ResellerClientes />} />
      </Route>

      {/* Panel Cliente */}
      <Route path="/cliente" element={<Protected role="cliente"><Layout /></Protected>}>
        <Route index element={<ClienteDashboard />} />
        <Route path="musica" element={<ClienteMusica />} />
        <Route path="playlists" element={<ClientePlaylists />} />
        <Route path="autodj" element={<ClienteAutoDJ />} />
        <Route path="reproductor" element={<ClienteReproductor />} />
        <Route path="redes" element={<ClienteRedes />} />
        <Route path="estadisticas" element={<ClienteEstadisticas />} />
        <Route path="configuracion" element={<ClienteConfiguracion />} />
      </Route>

      <Route path="*" element={<Navigate to={token ? home : '/login'} replace />} />
    </Routes>
  );
}
