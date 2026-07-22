import { useState } from 'react';
import { apiFetch } from '../../../api';
import { IconChevronDown } from '../../../icons';
import { useVideo, gb } from './useVideo';

export default function VideoPlaylist() {
  const { data, error, cargar } = useVideo();
  const [orden, setOrden] = useState(null);
  const [guardando, setGuardando] = useState(false);

  if (error && data === undefined) return <div className="py-10 text-center text-red-600">{error}</div>;
  if (data === undefined) return <p className="py-10 text-center text-gray-400">Cargando…</p>;

  const lista = orden || data.videos.map((v) => v.nombre);

  function mover(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= lista.length) return;
    const arr = [...lista];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setOrden(arr);
  }
  async function guardar() {
    setGuardando(true);
    try { await apiFetch('/cliente/video/orden', { method: 'PUT', body: JSON.stringify({ orden: lista }) }); setOrden(null); cargar(); }
    catch (e) { alert(e.message); }
    finally { setGuardando(false); }
  }

  return (
    <div className="card p-5">
      <h2 className="font-semibold mb-1">Playlist de tu canal</h2>
      <p className="text-xs text-gray-400 mb-4">Tu canal emite estos videos en bucle, en este orden. Usa las flechas para reordenar y guarda; se aplica en vivo.</p>

      {data.videos.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Sube videos en <b>Gestionar videos</b> para armar tu playlist.</p>
      ) : (
        <>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {lista.map((nombre, i) => {
              const v = data.videos.find((x) => x.nombre === nombre) || { nombre, tam_mb: 0 };
              return (
                <div key={nombre} className="flex items-center gap-2 py-2.5">
                  <span className="text-xs text-gray-400 w-6 text-right tabular-nums shrink-0">{i + 1}</span>
                  <div className="flex flex-col shrink-0">
                    <button onClick={() => mover(i, -1)} disabled={i === 0} className="text-gray-400 hover:text-brand-600 disabled:opacity-30 transition leading-none"><IconChevronDown width={14} height={14} className="rotate-180" /></button>
                    <button onClick={() => mover(i, 1)} disabled={i === lista.length - 1} className="text-gray-400 hover:text-brand-600 disabled:opacity-30 transition leading-none"><IconChevronDown width={14} height={14} /></button>
                  </div>
                  <span className="flex-1 min-w-0">
                    <span className="text-sm truncate block">{v.nombre}</span>
                    <span className="text-xs text-gray-400">{gb(v.tam_mb)}</span>
                  </span>
                </div>
              );
            })}
          </div>
          {orden && (
            <div className="flex gap-2 mt-3">
              <button onClick={() => setOrden(null)} className="btn-ghost flex-1 text-sm">Cancelar</button>
              <button onClick={guardar} disabled={guardando} className="btn-primary flex-1 text-sm">{guardando ? 'Guardando…' : 'Guardar orden'}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
