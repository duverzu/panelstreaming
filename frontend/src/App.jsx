import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import AdminDashboard from './pages/admin/Dashboard';
import AdminClientes from './pages/admin/Clientes';
import AdminPlanes from './pages/admin/Planes';
import ClienteDashboard from './pages/cliente/Dashboard';
import ClienteMusica from './pages/cliente/Musica';

/** Ruta protegida por rol. */
function Protected({ role, children }) {
  const { token, role: userRole } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (role && userRole !== role) {
    return <Navigate to={userRole === 'admin' ? '/admin' : '/cliente'} replace />;
  }
  return children;
}

export default function App() {
  const { token, role } = useAuth();
  const home = role === 'admin' ? '/admin' : '/cliente';

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
      </Route>

      {/* Panel Cliente */}
      <Route path="/cliente" element={<Protected role="cliente"><Layout /></Protected>}>
        <Route index element={<ClienteDashboard />} />
        <Route path="musica" element={<ClienteMusica />} />
      </Route>

      <Route path="*" element={<Navigate to={token ? home : '/login'} replace />} />
    </Routes>
  );
}
