import { useRef, useState } from 'react';
import { apiFetch } from '../../../api';
import { IconTrash, IconCheck, IconRefresh } from '../../../icons';
import { useVideo, gb } from './useVideo';

const TIPOS = 'video/mp4,video/x-matroska,video/quicktime,video/webm,.mp4,.mkv,.mov,.webm,.flv';
const EXT_OK = /\.(mp4|mkv|mov|webm|flv)$/i;

/** Icono de subida (nube con flecha), inline para no depender del set de iconos. */
function IconUpload({ className = '', width = 22, height = 22 }) {
  return (
    <svg className={className} width={width} height={height} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V5M12 5l-4 4M12 5l4 4" />
      <path d="M4 15v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

let _uid = 0;

export default function VideoGestionar() {
  const { data, error: errCarga, cargar } = useVideo();
  const [cola, setCola] = useState([]);        // [{id, file, nombre, tam, pct, estado, error}]
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef(null);
  const trabajando = useRef(false);
  const colaRef = useRef([]);                  // espejo de `cola` para leer el estado más reciente

  // El espejo se actualiza AL INSTANTE (no dentro del updater de setCola, que
  // React ejecuta más tarde): si no, procesar() no ve el archivo recién
  // encolado y la subida se queda en "en cola…" para siempre.
  const actualizar = (updater) => {
    const n = updater(colaRef.current);
    colaRef.current = n;
    setCola(n);
  };

  // ---- Cola de subida ---------------------------------------------------
  function encolar(fileList) {
    const nuevos = [...fileList]
      .filter((f) => EXT_OK.test(f.name))
      .map((f) => ({ id: ++_uid, file: f, nombre: f.name, tam: f.size, pct: 0, estado: 'espera', error: null }));
    const rechazados = [...fileList].length - nuevos.length;
    if (nuevos.length) actualizar((c) => [...c, ...nuevos]);
    if (rechazados) alert(`${rechazados} archivo(s) ignorado(s): solo se aceptan MP4, MKV, MOV, WEBM o FLV.`);
    procesar();
  }

  async function procesar() {
    if (trabajando.current) return;
    trabajando.current = true;
    // Sube de a uno para no saturar la red ni el nodo.
    for (;;) {
      const siguiente = colaRef.current.find((x) => x.estado === 'espera');
      if (!siguiente) break;
      await subirUno(siguiente);
    }
    trabajando.current = false;
    cargar();   // refresca la lista al terminar la tanda
  }

  async function subirUno(item) {
    const set = (campos) => actualizar((c) => c.map((x) => (x.id === item.id ? { ...x, ...campos } : x)));
    set({ estado: 'subiendo', pct: 0 });
    try {
      const { url } = await apiFetch('/cliente/video/ticket', { method: 'POST' });
      await subirConProgreso(url, item.file, (pct) => set({ pct }));
      set({ estado: 'listo', pct: 100 });
      cargar();   // aparece en "Mis videos" apenas termina cada uno
    } catch (err) {
      set({ estado: 'error', error: err.message || 'fallo al subir' });
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

  // ---- Drag & drop ------------------------------------------------------
  function onDrop(e) {
    e.preventDefault();
    setArrastrando(false);
    if (e.dataTransfer?.files?.length) encolar(e.dataTransfer.files);
  }

  async function borrar(nombre) {
    if (!confirm(`¿Borrar "${nombre}"? Esta acción no se puede deshacer.`)) return;
    try { await apiFetch('/cliente/video/' + encodeURIComponent(nombre), { method: 'DELETE' }); cargar(); }
    catch (e) { alert(e.message); }
  }

  const subiendoAlgo = cola.some((x) => x.estado === 'subiendo' || x.estado === 'espera');
  const pendientes = cola.filter((x) => x.estado !== 'listo');

  if (errCarga && data === undefined) return <div className="py-10 text-center text-red-600">{errCarga}</div>;
  if (data === undefined) return <p className="py-10 text-center text-gray-400">Cargando…</p>;

  return (
    <div className="space-y-6">
      {/* ── Zona de subida (arrastrar y soltar) ── */}
      <div className="card p-5">
        <h2 className="font-semibold mb-3">Subir videos</h2>
        <div
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed px-6 py-10 text-center transition
            ${arrastrando
              ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10 scale-[1.01]'
              : 'border-gray-200 dark:border-gray-700 hover:border-brand-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
        >
          <div className={`mx-auto w-14 h-14 rounded-2xl grid place-items-center mb-3 transition
            ${arrastrando ? 'bg-brand-500 text-white' : 'bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400'}`}>
            <IconUpload width={26} height={26} />
          </div>
          <p className="font-medium text-sm">
            {arrastrando ? 'Suelta para subir 📥' : 'Arrastra tus videos aquí'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            o <span className="text-brand-600 dark:text-brand-400 font-medium">haz clic para elegir</span> · MP4, MKV, MOV, WEBM, FLV · varios a la vez
          </p>
          <input ref={inputRef} type="file" accept={TIPOS} multiple className="hidden"
            onChange={(e) => { encolar(e.target.files); e.target.value = ''; }} />
        </div>

        {/* ── Progreso de la tanda ── */}
        {pendientes.length > 0 && (
          <div className="mt-4 space-y-2">
            {pendientes.map((x) => (
              <div key={x.id} className="rounded-xl border border-gray-100 dark:border-gray-800 p-3">
                <div className="flex items-center gap-2 text-sm mb-1.5">
                  <span className="flex-1 truncate">{x.nombre}</span>
                  {x.estado === 'error'
                    ? <span className="text-xs text-red-500 shrink-0">✕ {x.error}</span>
                    : x.estado === 'listo'
                      ? <span className="text-xs text-emerald-500 shrink-0 flex items-center gap-1"><IconCheck width={13} height={13} /> listo</span>
                      : x.estado === 'subiendo'
                        ? <span className="text-xs tabular-nums text-gray-500 shrink-0">{x.pct}%</span>
                        : <span className="text-xs text-gray-400 shrink-0">en cola…</span>}
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div className={`h-full transition-all ${x.estado === 'error' ? 'bg-red-400' : 'bg-brand-500'}`}
                    style={{ width: (x.estado === 'listo' ? 100 : x.pct) + '%' }} />
                </div>
                <div className="mt-1 text-[11px] text-gray-400">{gb(x.tam / (1024 * 1024))}</div>
              </div>
            ))}
            {subiendoAlgo && <p className="text-[11px] text-gray-400">No cierres esta página hasta que termine la subida.</p>}
          </div>
        )}
      </div>

      {/* ── Lista de videos ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Mis videos <span className="text-gray-400 font-normal">({data.videos.length})</span></h2>
          <button onClick={cargar} title="Refrescar" className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 dark:border-gray-800 hover:border-brand-400 hover:text-brand-500 transition">
            <IconRefresh width={15} height={15} />
          </button>
        </div>

        {data.videos.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Aún no has subido videos. Súbelos arriba y tu canal los emitirá en bucle.</p>
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
    </div>
  );
}
