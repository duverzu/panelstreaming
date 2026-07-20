/**
 * auth.jsx — contexto de autenticación.
 * Maneja login único, logout e impersonación (admin → panel de cliente).
 */
import { createContext, useContext, useState } from 'react';
import * as store from './store';
import { apiFetch } from './api';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => ({
    token: store.getToken(),
    role: store.getRole(),
    user: store.getUser(),
    impersonating: !!store.getBackup(),
  }));

  /** Login único: el backend devuelve el rol y redirigimos según él. */
  async function login(usuario, password) {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ usuario, password }),
    });
    store.clearBackup();
    store.setSession({ token: data.token, role: data.role, user: data.user });
    setSession({ token: data.token, role: data.role, user: data.user, impersonating: false });
    return data.role;
  }

  function logout() {
    store.clearSession();
    setSession({ token: null, role: null, user: null, impersonating: false });
  }

  /** Admin o revendedor entra al panel de un cliente para revisar. */
  async function impersonate(clienteId) {
    const base = store.getRole() === 'reseller' ? '/reseller' : '/admin';
    const data = await apiFetch(`${base}/clientes/${clienteId}/impersonar`, { method: 'POST' });
    store.backupAdmin();
    const user = { ...data.cliente, role: 'cliente', cliente_id: data.cliente.id };
    store.setSession({ token: data.token, role: 'cliente', user });
    setSession({ token: data.token, role: 'cliente', user, impersonating: true });
  }

  /** El admin entra al panel de un revendedor. */
  async function impersonateReseller(resellerId) {
    const data = await apiFetch(`/admin/resellers/${resellerId}/impersonar`, { method: 'POST' });
    store.backupAdmin();
    const user = { ...data.reseller, role: 'reseller', reseller_id: data.reseller.id };
    store.setSession({ token: data.token, role: 'reseller', user });
    setSession({ token: data.token, role: 'reseller', user, impersonating: true });
  }

  /** Vuelve de la impersonación a la sesión de admin. */
  function stopImpersonating() {
    const backup = store.getBackup();
    if (!backup) return;
    store.setSession(backup);
    store.clearBackup();
    setSession({ ...backup, impersonating: false });
  }

  return (
    <AuthCtx.Provider value={{ ...session, login, logout, impersonate, impersonateReseller, stopImpersonating }}>
      {children}
    </AuthCtx.Provider>
  );
}
