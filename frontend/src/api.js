/**
 * api.js — wrapper de fetch hacia el backend (/api/*).
 * Adjunta el token actual y, si recibe 401, limpia la sesión y manda al login.
 */
import { getToken, clearSession } from './store';

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch('/api' + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    clearSession();
    window.location.href = '/login';
    throw new Error('Sesión expirada');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error en la petición');
  return data;
}

/** Subida de archivos (FormData). No fija Content-Type: el navegador pone el boundary. */
export async function apiUpload(path, formData) {
  const token = getToken();
  const res = await fetch('/api' + path, {
    method: 'POST',
    headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: formData,
  });
  if (res.status === 401) {
    clearSession();
    window.location.href = '/login';
    throw new Error('Sesión expirada');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error al subir');
  return data;
}
