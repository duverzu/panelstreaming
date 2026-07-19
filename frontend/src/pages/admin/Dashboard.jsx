import { useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import StatTile from '../../components/charts/StatTile';
import DonutChart from '../../components/charts/DonutChart';
import ServerStats from '../../components/ServerStats';
import OverviewBar from '../../components/OverviewBar';
import GuardianBanda from '../../components/GuardianBanda';
import Player from '../../components/Player';
import { IconUsers, IconRadio, IconChart, IconMic } from '../../icons';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [monitorId, setMonitorId] = useState('');

  useEffect(() => {
    const load = () => {
      apiFetch('/admin/estadisticas').then(setStats).catch(() => {});
      apiFetch('/admin/clientes').then((c) => setClientes(c.clientes)).catch(() => {});
    };
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  const conStream = clientes.filter((c) => c.url_streaming);
  const monitor = conStream.find((c) => String(c.id) === String(monitorId)) || conStream[0];

  const total = stats?.total_clientes ?? 0;
  const activas = stats?.clientes_activos ?? 0;
  const alAire = stats?.al_aire ?? 0;
  const donut = [
    { label: 'Al aire', valor: alAire, color: '#10b981' },
    { label: 'Fuera de aire', valor: Math.max(0, activas - alAire), color: '#94a3b8' },
    { label: 'Suspendidas', valor: Math.max(0, total - activas), color: '#ef4444' },
  ];
  const ranking = stats?.ranking || [];
  const maxOy = Math.max(1, ...ranking.map((r) => r.oyentes));

  return (
    <div className="space-y-6">
      <OverviewBar />

      {/* KPIs con gradiente */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Oyentes en vivo" value={stats?.oyentes_totales ?? 0} icon={IconMic} color="brand" gradient hint="todas las radios" />
        <StatTile label="Clientes" value={total} icon={IconUsers} color="blue" hint={`${activas} activos`} />
        <StatTile label="Al aire" value={alAire} icon={IconRadio} color="violet" hint={`de ${stats?.estaciones ?? 0} estaciones`} />
        <StatTile label="Estaciones" value={stats?.estaciones ?? 0} icon={IconChart} color="amber" hint="aprovisionadas" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dona: estado de radios */}
        <div className="card p-5">
          <h2 className="font-semibold mb-4">Estado de las radios</h2>
          <DonutChart data={donut} centro="Radios" />
        </div>

        {/* Ranking */}
        <div className="card p-5">
          <h2 className="font-semibold mb-4">Top radios por oyentes</h2>
          {ranking.length ? (
            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
              {ranking.slice(0, 8).map((r, i) => (
                <div key={r.cliente_id} className="flex items-center gap-3">
                  <span className="w-5 text-sm text-gray-400 tabular-nums">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium truncate flex items-center gap-2">{r.nombre}
                        <span className={`w-1.5 h-1.5 rounded-full ${r.online ? 'bg-brand-500' : 'bg-gray-300 dark:bg-gray-700'}`} />
                      </span>
                      <span className="text-sm tabular-nums">{r.oyentes}</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${(r.oyentes / maxOy) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400 py-6 text-center">Sin oyentes todavía.</p>}
        </div>
      </div>

      <GuardianBanda />

      {/* VPS + Monitor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ServerStats />
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2"><IconRadio width={18} height={18} /> Monitor de radio</h2>
            {conStream.length > 0 && (
              <select className="input !w-auto !py-1.5 text-sm" value={monitor?.id || ''} onChange={(e) => setMonitorId(e.target.value)}>
                {conStream.map((c) => <option key={c.id} value={c.id}>{c.nombre_empresa}</option>)}
              </select>
            )}
          </div>
          {monitor ? <Player src={monitor.url_streaming} title={monitor.nombre_empresa} subtitle="Monitoreando" />
            : <p className="text-sm text-gray-400">Ninguna estación con stream disponible aún.</p>}
        </div>
      </div>
    </div>
  );
}
