import { useAuth } from '../../../auth';
import StatTile from '../../../components/charts/StatTile';
import DonutChart from '../../../components/charts/DonutChart';
import AreaChart from '../../../components/charts/AreaChart';
import VideoPlayer from '../../../components/VideoPlayer';
import { IconServer, IconChart, IconPlaylist } from '../../../icons';
import { useVideo, gb } from './useVideo';

export default function VideoInicio() {
  const { user } = useAuth();
  const { data, error } = useVideo();

  if (error && data === undefined) return <div className="py-10 text-center text-red-600">{error}</div>;
  if (data === undefined) return <p className="py-10 text-center text-gray-400">Cargando tu canal…</p>;

  const libreMb = Math.max(0, (data.espacio_total_mb || 0) - data.espacio_mb);
  const pctDisco = data.espacio_total_mb ? Math.min(100, Math.round((data.espacio_mb / data.espacio_total_mb) * 100)) : 0;
  const serie = (data.consumo?.por_dia || []).map((d) => ({
    label: new Date(d.fecha).toLocaleDateString('es', { day: '2-digit', month: 'short' }),
    valor: d.gb,
  }));

  return (
    <div className="space-y-6">
      <div className="rounded-2xl p-6 bg-gradient-to-br from-brand-600 to-emerald-600 text-white shadow-sm">
        <h2 className="text-xl font-bold">{data.nombre || user?.nombre_empresa} 🎬</h2>
        <p className="text-brand-50/90 text-sm mt-1">{data.al_aire ? '● Tu canal está al aire' : 'Tu canal está en pausa'}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Player en vivo */}
        <div className="lg:col-span-2 space-y-2">
          <h2 className="font-semibold flex items-center gap-2">📺 Tu canal en vivo</h2>
          <VideoPlayer src={data.urls.canal} />
        </div>

        {/* Almacenamiento en donut */}
        <div className="card p-5">
          <h2 className="font-semibold flex items-center gap-2 mb-1"><IconServer width={18} height={18} /> Almacenamiento</h2>
          <div className="grid place-items-center mt-2">
            <DonutChart size={150} thickness={20} centro={`${pctDisco}%`}
              data={[
                { label: 'Usado', valor: data.espacio_mb, color: pctDisco >= 90 ? '#ef4444' : pctDisco >= 70 ? '#f59e0b' : '#10b981' },
                { label: 'Libre', valor: libreMb, color: '#e5e7eb' },
              ]} />
          </div>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Usado</span><b>{gb(data.espacio_mb)}</b></div>
            <div className="flex justify-between"><span className="text-gray-400">Total del plan</span><b>{data.espacio_total_mb ? gb(data.espacio_total_mb) : '—'}</b></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatTile label="Videos" value={data.videos.length} icon={IconPlaylist} color="violet" />
        <StatTile label="Transferencia" value={`${data.consumo?.total_gb ?? 0} GB`} icon={IconChart} color="blue" hint="este mes" gradient />
        <StatTile label="Estado" value={data.al_aire ? 'Al aire' : 'Pausa'} icon={IconServer} color={data.al_aire ? 'brand' : 'amber'} />
      </div>

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
