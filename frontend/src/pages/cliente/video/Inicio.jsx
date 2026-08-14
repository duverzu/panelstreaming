import { useAuth } from '../../../auth';
import DonutChart from '../../../components/charts/DonutChart';
import AreaChart from '../../../components/charts/AreaChart';
import VideoPlayer from '../../../components/VideoPlayer';
import Copiable from '../../../components/Copiable';
import { IconServer, IconChart, IconMic } from '../../../icons';
import { useVideo, gb } from './useVideo';

export default function VideoInicio() {
  const { user } = useAuth();
  const { data, error } = useVideo();

  if (error && data === undefined) return <div className="py-10 text-center text-red-600">{error}</div>;
  if (data === undefined) return <p className="py-10 text-center text-gray-400">Cargando tu canal…</p>;

  const pctDisco = data.espacio_total_mb ? Math.min(100, Math.round((data.espacio_mb / data.espacio_total_mb) * 100)) : 0;
  const libreMb = Math.max(0, (data.espacio_total_mb || 0) - data.espacio_mb);
  const serie = (data.consumo?.por_dia || []).map((d) => ({
    label: new Date(d.fecha).toLocaleDateString('es', { day: '2-digit', month: 'short' }), valor: d.gb,
  }));

  const ext = data.player_externo;
  const compartir = ext?.url || data.urls?.player || data.urls?.canal;
  const insertar = ext?.embed || `<iframe src="${data.urls?.player || data.urls?.canal}" width="100%" height="400" frameborder="0" allow="autoplay"></iframe>`;

  return (
    <div className="space-y-5">
      {/* Título pequeño + estado */}
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-lg font-bold">{data.nombre || user?.nombre_empresa} 🎬</h1>
        <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full ${data.al_aire ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${data.al_aire ? 'bg-brand-500 animate-pulse' : 'bg-gray-400'}`} />
          {data.al_aire ? 'Tu canal está al aire' : 'En pausa'}
        </span>
      </div>

      {/* ── Fila superior: 3 cards (video grande + conectar + disco) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-stretch">
        {/* Video (grande, borde con degradado moderno) */}
        <div className="lg:col-span-2 rounded-2xl p-[1.5px] bg-gradient-to-br from-brand-500 to-emerald-500 shadow-sm">
          <div className="rounded-2xl bg-white dark:bg-gray-900 p-4 h-full flex flex-col">
            <div className="flex items-center gap-2 mb-2 text-sm font-semibold">📺 Tu canal en vivo</div>
            {ext?.url ? (
              <div className="rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800 aspect-video bg-black">
                <iframe src={ext.url} width="100%" height="100%" frameBorder="0" allow="autoplay" title="Tu canal" style={{ display: 'block' }} />
              </div>
            ) : (
              <VideoPlayer src={data.urls?.canal} />
            )}
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div><div className="label mb-1 !text-[11px]">🔗 Link para compartir</div><Copiable texto={compartir} /></div>
              <div><div className="label mb-1 !text-[11px]">💻 Insertar (embed)</div><Copiable texto={insertar} /></div>
            </div>
          </div>
        </div>

        {/* Conectar en vivo + enlaces (índigo) */}
        <div className="rounded-2xl bg-gradient-to-br from-indigo-500/10 to-indigo-500/[0.03] border border-indigo-100 dark:border-indigo-500/20 p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-indigo-700 dark:text-indigo-300"><IconMic width={16} height={16} /> Conectar en vivo</div>
          {data.conexion ? (
            <div className="space-y-2.5">
              <div><div className="label mb-1 !text-[11px]">Servidor RTMP</div><Copiable texto={data.conexion.servidor} /></div>
              <div><div className="label mb-1 !text-[11px]">Clave</div><Copiable texto={data.conexion.clave} /></div>
              {/* SRT solo si se le activó. Se etiqueta como alternativa y no
                  como un tercer dato que rellenar: quien lo lea de corrido no
                  debe acabar pegando las dos cosas a la vez en su OBS. */}
              {data.srt && (
                <div className="pt-2.5 border-t border-indigo-100 dark:border-indigo-500/20">
                  <div className="label mb-1 !text-[11px]">📡 SRT — en vez del RTMP, si se te corta</div>
                  <Copiable texto={data.srt.url} />
                  <p className="text-[10px] text-gray-400 mt-1">Va en «Servidor» y la clave se deja vacía.</p>
                </div>
              )}
            </div>
          ) : <p className="text-xs text-gray-400">Tu plan no incluye transmisión en vivo.</p>}
          <div className="mt-3"><div className="label mb-1 !text-[11px]">🔗 Enlace del canal (.m3u8)</div><Copiable texto={data.urls?.canal} /></div>
        </div>

        {/* Almacenamiento (ámbar) */}
        <div className="rounded-2xl bg-gradient-to-br from-amber-500/10 to-amber-500/[0.03] border border-amber-100 dark:border-amber-500/20 p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-amber-700 dark:text-amber-400"><IconServer width={16} height={16} /> Almacenamiento</div>
          <div className="grid place-items-center flex-1 py-2">
            <DonutChart size={120} thickness={16} centro={`${pctDisco}%`} data={[
              { label: 'Usado', valor: data.espacio_mb, color: pctDisco >= 90 ? '#ef4444' : pctDisco >= 70 ? '#f59e0b' : '#10b981' },
              { label: 'Libre', valor: libreMb, color: '#e5e7eb' },
            ]} />
          </div>
          <div className="text-xs flex justify-between mt-1"><span className="text-gray-400">Usado</span><b>{gb(data.espacio_mb)}</b></div>
          <div className="text-xs flex justify-between"><span className="text-gray-400">Total del plan</span><b>{data.espacio_total_mb ? gb(data.espacio_total_mb) : '—'}</b></div>
        </div>
      </div>

      {/* ── Fila inferior: transferencia grande + 3 mini-cards verticales ── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-stretch">
        <div className="lg:col-span-3 card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2"><IconChart width={18} height={18} /> Transferencia</h2>
            <span className="text-sm text-gray-400">últimos 30 días · <b className="text-gray-600 dark:text-gray-300">{data.consumo?.total_gb ?? 0} GB</b></span>
          </div>
          {data.consumo?.por_dia?.some((d) => d.gb > 0)
            ? <AreaChart data={serie} color="#6366f1" unidad=" GB" height={230} />
            : <div className="grid place-items-center text-sm text-gray-400" style={{ height: 230 }}>Aún sin datos de consumo</div>}
        </div>

        <div className="flex flex-col gap-4">
          <MiniStat label="Viewers en vivo" value={data.viewers ?? 0} icon="🔴" hint="ahora mismo" color="brand" />
          <MiniStat label="Videos" value={data.videos.length} icon="🎞️" color="violet" />
          <MiniStat label="Estado" value={data.al_aire ? 'Al aire' : 'Pausa'} icon="📡" color={data.al_aire ? 'brand' : 'amber'} />
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, icon, hint, color }) {
  const cls = {
    brand: 'from-brand-500/10 to-brand-500/[0.03] border-brand-100 dark:border-brand-500/20',
    violet: 'from-violet-500/10 to-violet-500/[0.03] border-violet-100 dark:border-violet-500/20',
    amber: 'from-amber-500/10 to-amber-500/[0.03] border-amber-100 dark:border-amber-500/20',
  }[color] || '';
  return (
    <div className={`flex-1 rounded-2xl bg-gradient-to-br border p-4 transition hover:shadow-sm ${cls}`}>
      <div className="text-xs text-gray-400 flex items-center gap-1.5"><span>{icon}</span> {label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
      {hint && <div className="text-[11px] text-gray-400">{hint}</div>}
    </div>
  );
}
