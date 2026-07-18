/**
 * store.js — persistencia de la sesión en localStorage (sin React).
 * Se usa desde api.js y desde el AuthContext, evitando dependencias circulares.
 */

const KEYS = {
  token: 'panel_token',
  role: 'panel_role',
  user: 'panel_user',
  backup: 'panel_admin_backup', // sesión de admin guardada mientras impersona
};

export function getToken() {
  return localStorage.getItem(KEYS.token);
}
export function getRole() {
  return localStorage.getItem(KEYS.role);
}
export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.user));
  } catch {
    return null;
  }
}

export function setSession({ token, role, user }) {
  localStorage.setItem(KEYS.token, token);
  localStorage.setItem(KEYS.role, role);
  localStorage.setItem(KEYS.user, JSON.stringify(user));
}

export function clearSession() {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
}

// --- Impersonación: respaldar/restaurar la sesión de admin ---
export function backupAdmin() {
  const backup = { token: getToken(), role: getRole(), user: getUser() };
  localStorage.setItem(KEYS.backup, JSON.stringify(backup));
}
export function getBackup() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.backup));
  } catch {
    return null;
  }
}
export function clearBackup() {
  localStorage.removeItem(KEYS.backup);
}
