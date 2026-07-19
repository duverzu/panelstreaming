import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../api';
import StatTile from '../../components/charts/StatTile';
import DonutChart from '../../components/charts/DonutChart';
import { IconUsers, IconRadio, IconChart, IconMic } from '../../icons';

export default function ResellerDashboard() {
  const [p, setP] = useState(null);
  const [est, setEst] = useState(null);

  useEffect(() => {
    const load = () => {
      apiFetch('/reseller/perfil').then((d) => setP(d.perfil)).catch(() => {});
      apiFetch('/reseller/estadisticas').then(setEst).catch(() => {});
    };
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  const barra = (u, t) => (t ? Math.min(100, Math.round((u / t) * 100)) : 0);
  const donut = [
    { label: 'Usadas', valor: p?.radios_usadas ?? 0, color: '#10b981' },
    { label: 'Disponibles', valor: p?.disponibles ?? 0, color: '#94a3b8' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Oyentes en vivo" value={est?.oyentes_totales ?? 0} icon={IconMic} color="brand" gradient hint="tus radios" />
        <StatTile label="Radios" value={p?.radios_usadas ?? '–'} icon={IconRadio} color="blue" hint={`de ${p?.cupo_radios ?? '–'} de cupo`} />
        <StatTile label="Oyentes asignados" value={p?.oyentes_usados ?? '–'} icon={IconUsers} color="violet" hint={`de ${p?.max_oyentes_total ?? '–'}`} />
        <StatTile label="Espacio usado" value={p ? `${(p.espacio_usado_mb / 1024).toFixed(1)} GB` : '–'} icon={IconChart} color="amber" hint={`de ${p ? (p.espacio_total_mb / 1024).toFixed(0) : '–'} GB`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="font-semibold mb-4">Uso de tu cupo de radios</h2>
          <DonutChart data={donut} centro="Cupo" />
        </div>

        <div className="card p-5 space-y-5">
          <h2 className="font-semibold">Recursos de tu cuenta</h2>
          <Barra label="Radios" usado={p?.radios_usadas ?? 0} total={p?.cupo_radios ?? 0} pct={barra(p?.radios_usadas, p?.cupo_radios)} />
          <Barra label="Oyentes (suma de planes)" usado={p?.oyentes_usados ?? 0} total={p?.max_oyentes_total ?? 0} pct={barra(p?.oyentes_usados, p?.max_oyentes_total)} />
          <Barra label="Espacio (MB)" usado={p?.espacio_usado_mb ?? 0} total={p?.espacio_total_mb ?? 0} pct={barra(p?.espacio_usado_mb, p?.espacio_total_mb)} />
          <Link to="/reseller/clientes" className="btn-primary inline-flex">Gestionar mis radios</Link>
        </div>
      </div>
    </div>
  );
}

function Barra({ label, usado, total, pct }) {
  const color = pct >= 100 ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-brand-500';
  return (
    <div>
      <div className="flex justify-between text-sm mb-1.5"><span className="text-gray-500 dark:text-gray-400">{label}</span><span className="font-medium tabular-nums">{usado} / {total}</span></div>
      <div className="h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden"><div className={`h-full rounded-full ${color} transition-all`} style={{ width: pct + '%' }} /></div>
    </div>
  );
}
