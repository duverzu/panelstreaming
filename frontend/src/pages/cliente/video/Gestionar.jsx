import { useRef, useState } from 'react';
import { apiFetch } from '../../../api';
import { IconTrash, IconPlus } from '../../../icons';
import { useVideo, gb } from './useVideo';

export default function VideoGestionar() {
  const { data, error: errCarga, cargar } = useVideo();
  const [subiendo, setSubiendo] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  async function elegirArchivo(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const { url } = await apiFetch('/cliente/video/ticket', { method: 'POST' });
      setSubiendo({ nombre: file.name, pct: 0 });
      await subirConProgreso(url, file, (pct) => setSubiendo({ nombre: file.name, pct }));
      setSubiendo(null);
      cargar();
    } catch (err) {
      setSubiendo(null);
      setError('No se pudo subir el video: ' + err.message);
    }
  }

  function subirConProgreso(url, file, onProgreso) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append('video', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgreso(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300)
        ? resolve()
        : reject(new Error(JSON.parse(xhr.responseText || '{}').error || `error ${xhr.status}`));
      xhr.onerror = () => reject(new Error('fallo de red'));
      xhr.send(fd);
    });
  }

  async function borrar(nombre) {
    if (!confirm(`¿Borrar "${nombre}"? Esta acción no se puede deshacer.`)) return;
    try { await apiFetch('/cliente/video/' + encodeURIComponent(nombre), { method: 'DELETE' }); cargar(); }
    catch (e) { alert(e.message); }
  }

  if (errCarga && data === undefined) return <div className="py-10 text-center text-red-600">{errCarga}</div>;
  if (data === undefined) return <p className="py-10 text-center text-gray-400">Cargando…</p>;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Mis videos <span className="text-gray-400 font-normal">({data.videos.length})</span></h2>
        <button onClick={() => inputRef.current?.click()} disabled={subiendo} className="btn-primary !py-2 !px-3 text-xs disabled:opacity-60">
          <IconPlus width={15} height={15} /> Subir video
        </button>
        <input ref={inputRef} type="file" accept="video/mp4,video/x-matroska,video/quicktime,video/webm,.mp4,.mkv,.mov,.webm,.flv" className="hidden" onChange={elegirArchivo} />
      </div>

      {subiendo && (
        <div className="mb-4 rounded-xl border border-brand-200 dark:border-brand-500/30 p-3">
          <div className="flex justify-between text-sm mb-1.5">
            <span className="truncate">{subiendo.nombre}</span>
            <span className="tabular-nums shrink-0">{subiendo.pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div className="h-full bg-brand-500 transition-all" style={{ width: subiendo.pct + '%' }} />
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">No cierres esta página hasta que termine.</p>
        </div>
      )}
      {error && <div className="mb-3 text-sm rounded-xl px-3 py-2 text-red-600 bg-red-50 dark:bg-red-500/10">{error}</div>}

      {data.videos.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Aún no has subido videos. Súbelos y tu canal los emitirá en bucle.</p>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {data.videos.map((v) => (
            <div key={v.nombre} className="flex items-center gap-3 py-2.5">
              <span className="flex-1 min-w-0">
                <span className="text-sm truncate block">{v.nombre}</span>
                <span className="text-xs text-gray-400">{gb(v.tam_mb)} · {new Date(v.modificado).toLocaleDateString('es')}</span>
              </span>
              <button onClick={() => borrar(v.nombre)} title="Borrar" className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 dark:border-gray-800 hover:border-red-400 hover:text-red-500 transition shrink-0">
                <IconTrash width={15} height={15} />
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-400 mt-4">El orden de emisión se ajusta en <b>Playlist</b>.</p>
    </div>
  );
}
