import { useState } from 'react';
import VideoPlayer from '../../../components/VideoPlayer';
import { IconShare } from '../../../icons';
import { useVideo } from './useVideo';
import Copiable from '../../../components/Copiable';
import { apiFetch } from '../../../api';

export default function VideoReproductor() {
  const { data, error } = useVideo();
  const [entrando, setEntrando] = useState(false);
  const ext = data?.player_externo;   // player de la plataforma (streaminghd.co/user/...)

  /** Abre el editor del player en la plataforma con acceso directo (magic link). */
  async function editarPlayer() {
    setEntrando(true);
    const tab = window.open('', '_blank');   // se abre en el clic para que no lo bloquee
    try {
      const { url } = await apiFetch('/cliente/player/acceso', { method: 'POST' });
      if (tab) tab.location = url; else window.location = url;
    } catch (e) {
      if (tab) tab.location = ext?.url_editar || ext?.url; else alert(e.message);
    } finally { setEntrando(false); }
  }

  if (error && data === undefined) return <div className="py-10 text-center text-red-600">{error}</div>;
  if (data === undefined) return <p className="py-10 text-center text-gray-400">Cargando…</p>;

  const embed = `<video controls playsinline style="width:100%;max-width:720px;aspect-ratio:16/9;background:#000" id="shd-player"></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>
<script>(function(){var v=document.getElementById('shd-player'),s='${data.urls.canal}';
if(window.Hls&&Hls.isSupported()){var h=new Hls();h.loadSource(s);h.attachMedia(v);}
else if(v.canPlayType('application/vnd.apple.mpegurl')){v.src=s;}})();</script>`;

  return (
    <div className="space-y-6">
      {/* Player oficial de la plataforma (el que el cliente configura allá) */}
      {ext && ext.url && (
        <div className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              {ext.logo && <img src={ext.logo} alt="" className="w-12 h-12 rounded-xl object-cover bg-gray-100 dark:bg-gray-800" />}
              <div>
                <h2 className="font-semibold flex items-center gap-2">
                  Tu reproductor
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">Video</span>
                </h2>
                <p className="text-xs text-gray-400">Tu player oficial{ext.ubicacion ? ` · ${ext.ubicacion}` : ''}. Edítalo con el botón: entras sin volver a poner contraseña.</p>
              </div>
            </div>
            <button onClick={editarPlayer} disabled={entrando} className="btn-primary !py-2 !px-3 text-xs shrink-0 disabled:opacity-60">
              {entrando ? 'Abriendo…' : 'Editar player ↗'}
            </button>
          </div>

          <div className="rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800">
            <iframe src={ext.url} width="100%" height="460" frameBorder="0" allow="autoplay" title="Mi reproductor" style={{ display: 'block' }} />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            ¿No carga la vista previa? <a href={ext.url} target="_blank" rel="noreferrer" className="text-brand-600 dark:text-brand-400 underline underline-offset-2">Ábrelo en una pestaña nueva</a>.
          </p>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><div className="label mb-1">🔗 Link para compartir</div><Copiable texto={ext.url} /></div>
            {ext.embed && <div><div className="label mb-1">💻 Código para tu web</div><Copiable texto={ext.embed} /></div>}
          </div>
        </div>
      )}

      {ext && ext.url && (
        <p className="text-sm text-gray-400 -mb-2">¿Prefieres el reproductor simple? También tienes estas opciones básicas:</p>
      )}

      <div className="card p-5">
        <h2 className="font-semibold mb-1">Vista previa</h2>
        <p className="text-xs text-gray-400 mb-3">Así se ve tu canal en el reproductor.</p>
        <div className="max-w-2xl"><VideoPlayer src={data.urls.canal} /></div>
      </div>
      <div className="card p-5">
        <h2 className="font-semibold flex items-center gap-2 mb-1"><IconShare width={18} height={18} /> Reproductor para tu web</h2>
        <p className="text-xs text-gray-400 mb-3">Copia este código y pégalo en tu sitio.</p>
        <Copiable texto={embed} />
      </div>
    </div>
  );
}
