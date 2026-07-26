import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

/**
 * /sso#t=<token> — entrada por SSO desde el panel de facturación.
 * Lee el token del fragmento (no viaja al servidor ni queda en logs), lo canjea
 * por una sesión y entra al panel del cliente.
 */
export default function SSO() {
  const { ssoLogin } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = hash.get('t');
    // Limpia el token de la URL de inmediato (no quede en el historial)
    window.history.replaceState(null, '', '/sso');
    if (!token) { setError('Enlace inválido.'); return; }
    ssoLogin(token)
      .then((role) => navigate(role === 'cliente' ? '/cliente' : '/login', { replace: true }))
      .catch((e) => setError(e.message || 'No se pudo iniciar sesión.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen grid place-items-center bg-gray-50 dark:bg-gray-950 p-6 text-center">
      {error ? (
        <div className="max-w-sm">
          <div className="text-3xl mb-2">🔒</div>
          <p className="font-semibold mb-1">No se pudo entrar</p>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <button onClick={() => navigate('/login', { replace: true })} className="btn-primary">Ir al inicio de sesión</button>
        </div>
      ) : (
        <div>
          <div className="w-10 h-10 mx-auto mb-3 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
          <p className="text-sm text-gray-500">Entrando a tu panel…</p>
        </div>
      )}
    </div>
  );
}
