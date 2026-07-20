import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { IconSun, IconMoon } from '../icons';

export default function Login() {
  const { login } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();

  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const role = await login(usuario.trim(), password);
      navigate(role === 'admin' ? '/admin' : role === 'reseller' ? '/reseller' : '/cliente', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-5 relative">
      <button
        onClick={toggle}
        className="absolute top-5 right-5 w-9 h-9 grid place-items-center rounded-xl border border-gray-200 dark:border-gray-800 hover:border-brand-500 transition"
        title={dark ? 'Modo día' : 'Modo noche'}
      >
        {dark ? <IconSun width={18} height={18} /> : <IconMoon width={18} height={18} />}
      </button>

      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-brand-600 grid place-items-center text-white text-2xl mx-auto mb-3">
            🎙️
          </div>
          <h1 className="text-2xl font-bold">Panel Radio</h1>
          <p className="text-sm text-gray-400 mt-1">Inicia sesión en tu cuenta</p>
        </div>

        <form onSubmit={onSubmit} className="card p-6 space-y-4">
          <div>
            <label className="label">Usuario</label>
            <input
              className="input" type="text" value={usuario} autoComplete="username"
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="tu usuario" required
            />
          </div>
          <div>
            <label className="label">Contraseña</label>
            <input
              className="input" type="password" value={password} autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" required
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded-xl px-3 py-2">
              {error}
            </div>
          )}

          <button className="btn-primary w-full" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-5">
          Mismo acceso para administradores, revendedores y clientes.
        </p>
      </div>
    </div>
  );
}
