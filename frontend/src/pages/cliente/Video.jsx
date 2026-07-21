import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../api';
import { useAuth } from '../../auth';
import StatTile from '../../components/charts/StatTile';
import AreaChart from '../../components/charts/AreaChart';
import DonutChart from '../../components/charts/DonutChart';
import { IconServer, IconChart, IconPlaylist, IconTrash, IconCopy, IconCheck, IconPlus, IconMic, IconShare } from '../../icons';

function Copiable({ texto }) {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={() => navigator.clipboard?.writeText(texto).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); })}
      className="inline-flex items-center gap-1.5 font-mono text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-brand-500 transition break-all text-left w-full">
      {ok ? <IconCheck width={13} height={13} className="text-brand-600 shrink-0" /> : <IconCopy width={13} height={13} className="shrink-0" />}
      <span className="truncate">{texto}</span>
    </button>
  );
}

export default function ClienteVideo() {
  const { user } = useAuth();
  const [data, setData] = useState(undefined);
  const [error, setError] = useState(null);
  const [subiendo, setSubiendo] = useState(null);   // { nombre, pct }
  const inputRef = useRef(null);

  function cargar() {
    apiFetch('/cliente/video').then(setData).catch((e) => setError(e.message));
  }
  useEffect(() => { cargar(); }, []);

  async function elegirArchivo(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    try {
      // 1) El panel da una URL de subida directa al nodo de video
      const { url } = await apiFetch('/cliente/video/ticket', { method: 'POST' });
      // 2) El navegador sube el archivo DIRECTO ahí (no pasa por el panel)
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

  if (error && data === undefined) return <div className="py-10 text-center text-red-600">{error}</div>;
  if (data === undefined) return <p className="py-10 text-center text-gray-400">Cargando tu canal…</p>;

  const gb = (mb) => mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : Math.round(mb) + ' MB';
  const libreMb = Math.max(0, (data.espacio_total_mb || 0) - data.espacio_mb);
  const pctDisco = data.espacio_total_mb ? Math.min(100, Math.round((data.espacio_mb / data.espacio_total_mb) * 100)) : 0;
  const embed = `<video controls playsinline style="width:100%;max-width:720px;aspect-ratio:16/9;background:#000" id="shd-player"></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>
<script>(function(){var v=document.getElementById('shd-player'),s='${data.urls.canal}';
if(window.Hls&&Hls.isSupported()){var h=new Hls();h.loadSource(s);h.attachMedia(v);}
else if(v.canPlayType('application/vnd.apple.mpegurl')){v.src=s;}})();</script>`;

  const serie = (data.consumo?.por_dia || []).map((d) => ({
    label: new Date(d.fecha).toLocaleDateString('es', { day: '2-digit', month: 'short' }),
    valor: d.gb,
  }));

  return (
    <div className="space-y-6">
      <div className="rounded-2xl p-6 bg-gradient-to-br from-brand-600 to-emerald-600 text-white shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{data.nombre || user?.nombre_empresa} 🎬</h2>
          <p className="text-brand-50/90 text-sm mt-1">
            {data.al_aire ? '● Tu canal está al aire' : 'Tu canal está en pausa'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Almacenamiento en donut (como el de audio) */}
        <div className="card p-5">
          <h2 className="font-semibold flex items-center gap-2 mb-1"><IconServer width={18} height={18} /> Almacenamiento</h2>
          <p className="text-xs text-gray-400 mb-2">Espacio de tus videos</p>
          <div className="grid place-items-center">
            <DonutChart size={150} thickness={20}
              centro={`${pctDisco}%`}
              data={[
                { label: 'Usado', valor: data.espacio_mb, color: pctDisco >= 90 ? '#ef4444' : pctDisco >= 70 ? '#f59e0b' : '#10b981' },
                { label: 'Libre', valor: libreMb, color: '#e5e7eb' },
              ]} />
          </div>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Usado</span><b>{gb(data.espacio_mb)}</b></div>
            <div className="flex justify-between"><span className="text-gray-400">Total del plan</span><b>{data.espacio_total_mb ? gb(data.espacio_total_mb) : '—'}</b></div>
            <div className="flex justify-between"><span className="text-gray-400">Videos</span><b>{data.videos.length}</b></div>
          </div>
        </div>

        <div className="lg:col-span-2 grid grid-cols-2 gap-4 content-start">
          <StatTile label="Videos" value={data.videos.length} icon={IconPlaylist} color="violet" />
          <StatTile label="Transferencia" value={`${data.consumo?.total_gb ?? 0} GB`} icon={IconChart} color="blue" hint="este mes" gradient />

          {/* Tu canal para poner en la web */}
          <div className="card p-4 col-span-2">
            <h2 className="font-semibold mb-1">Tu canal</h2>
            <p className="text-xs text-gray-400 mb-2">El enlace de tu señal, para tu web, app o reproductor.</p>
            <Copiable texto={data.urls.canal} />
          </div>
        </div>
      </div>

      {/* Transmitir en vivo */}
      {data.permite_vivo && data.conexion && (
        <div className="card p-5">
          <h2 className="font-semibold flex items-center gap-2 mb-1"><IconMic width={18} height={18} /> Transmitir en vivo</h2>
          <p className="text-xs text-gray-400 mb-3">Con OBS, vMix o cualquier encoder. Mientras transmites, tu señal en vivo reemplaza a tus videos; al terminar, vuelven solos.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <div className="label mb-1">Servidor (URL)</div>
              <Copiable texto={data.conexion.servidor} />
            </div>
            <div>
              <div className="label mb-1">Clave de transmisión</div>
              <Copiable texto={data.conexion.clave} />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">En OBS: Ajustes → Emisión → Servicio «Personalizado», pega el servidor y la clave.</p>
        </div>
      )}

      {/* Player para insertar en tu web */}
      <div className="card p-5">
        <h2 className="font-semibold flex items-center gap-2 mb-1"><IconShare width={18} height={18} /> Reproductor para tu web</h2>
        <p className="text-xs text-gray-400 mb-3">Copia este código y pégalo en tu sitio. Muestra tu canal con reproductor.</p>
        <Copiable texto={embed} />
        <details className="mt-3">
          <summary className="text-xs text-gray-400 cursor-pointer">Ver vista previa</summary>
          <div className="mt-2 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800" dangerouslySetInnerHTML={{ __html: embed }} />
        </details>
      </div>

      {/* Videos */}
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
                  <span className="text-xs text-gray-400">
                    {v.tam_mb >= 1024 ? (v.tam_mb / 1024).toFixed(1) + ' GB' : v.tam_mb + ' MB'} · {new Date(v.modificado).toLocaleDateString('es')}
                  </span>
                </span>
                <button onClick={() => borrar(v.nombre)} title="Borrar" className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 dark:border-gray-800 hover:border-red-400 hover:text-red-500 transition shrink-0">
                  <IconTrash width={15} height={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Consumo */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold flex items-center gap-2"><IconChart width={18} height={18} /> Transferencia</h2>
          <span className="text-sm text-gray-400">últimos 30 días</span>
        </div>
        {data.consumo?.por_dia?.some((d) => d.gb > 0)
          ? <AreaChart data={serie} color="#6366f1" unidad=" GB" height={180} />
          : <div className="grid place-items-center text-sm text-gray-400" style={{ height: 180 }}>Aún sin datos de consumo</div>}
      </div>
    </div>
  );
}
