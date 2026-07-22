import VideoPlayer from '../../../components/VideoPlayer';
import { IconShare } from '../../../icons';
import { useVideo } from './useVideo';
import Copiable from '../../../components/Copiable';

export default function VideoReproductor() {
  const { data, error } = useVideo();
  if (error && data === undefined) return <div className="py-10 text-center text-red-600">{error}</div>;
  if (data === undefined) return <p className="py-10 text-center text-gray-400">Cargando…</p>;

  const embed = `<video controls playsinline style="width:100%;max-width:720px;aspect-ratio:16/9;background:#000" id="shd-player"></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>
<script>(function(){var v=document.getElementById('shd-player'),s='${data.urls.canal}';
if(window.Hls&&Hls.isSupported()){var h=new Hls();h.loadSource(s);h.attachMedia(v);}
else if(v.canPlayType('application/vnd.apple.mpegurl')){v.src=s;}})();</script>`;

  return (
    <div className="space-y-6">
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
