import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../../api';

/** Carga y comparte los datos del canal de video del cliente. */
export function useVideo() {
  const [data, setData] = useState(undefined);
  const [error, setError] = useState(null);

  const cargar = useCallback(() => {
    apiFetch('/cliente/video').then(setData).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  return { data, error, cargar };
}

export const gb = (mb) => (mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : Math.round(mb) + ' MB');
