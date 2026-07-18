import { useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import StatCard from '../../components/StatCard';
import ServerStats from '../../components/ServerStats';
import Player from '../../components/Player';
import { IconUsers, IconRadio, IconChart } from '../../icons';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [monitorId, setMonitorId] = useState('');

  useEffect(() => {
    apiFetch('/admin/estadisticas').then(setStats).catch(() => {});
    apiFetch('/admin/clientes').then((c) => setClientes(c.clientes)).catch(() => {});
  }, []);

  const conStream = clientes.filter((c) => c.url_streaming);
  const monitor = conStream.find((c) => String(c.id) === String(monitorId)) || conStream[0];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Clientes" value={stats?.total_clientes ?? '–'} icon={IconUsers} color="brand"
          hint={`${stats?.clientes_activos ?? 0} activos`} />
        <StatCard label="Estaciones" value={stats?.estaciones ?? '–'} icon={IconRadio} color="blue" hint="en AzuraCast" />
        <StatCard label="Oyentes" value={stats?.oyentes_totales ?? 0} icon={IconChart} color="violet" hint="en vivo" />
      </div>

      {/* Monitoreo: VPS + player */}
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
          {monitor ? (
            <Player src={monitor.url_streaming} title={monitor.nombre_empresa} subtitle="Monitoreando" />
          ) : (
            <p className="text-sm text-gray-400">Ninguna estación con stream disponible aún.</p>
          )}
        </div>
      </div>
    </div>
  );
}
