import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../api';
import StatCard from '../../components/StatCard';
import { IconUsers, IconRadio, IconChart } from '../../icons';

export default function ResellerDashboard() {
  const [p, setP] = useState(null);

  useEffect(() => {
    apiFetch('/reseller/perfil').then((d) => setP(d.perfil)).catch(() => {});
  }, []);

  const barra = (usado, total) => (total ? Math.min(100, Math.round((usado / total) * 100)) : 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Radios" value={p?.radios_usadas ?? '–'} icon={IconRadio} color="brand" hint={`de ${p?.cupo_radios ?? '–'} de cupo`} />
        <StatCard label="Oyentes asignados" value={p?.oyentes_usados ?? '–'} icon={IconUsers} color="blue" hint={`de ${p?.max_oyentes_total ?? '–'}`} />
        <StatCard label="Espacio usado" value={p ? `${(p.espacio_usado_mb / 1024).toFixed(1)} GB` : '–'} icon={IconChart} color="violet" hint={`de ${p ? (p.espacio_total_mb / 1024).toFixed(0) : '–'} GB`} />
      </div>

      <div className="card p-5 space-y-5">
        <h2 className="font-semibold">Uso de tu cuenta</h2>
        <Barra label="Radios" usado={p?.radios_usadas ?? 0} total={p?.cupo_radios ?? 0} pct={barra(p?.radios_usadas, p?.cupo_radios)} />
        <Barra label="Oyentes (suma de planes)" usado={p?.oyentes_usados ?? 0} total={p?.max_oyentes_total ?? 0} pct={barra(p?.oyentes_usados, p?.max_oyentes_total)} />
        <Barra label="Espacio (MB)" usado={p?.espacio_usado_mb ?? 0} total={p?.espacio_total_mb ?? 0} pct={barra(p?.espacio_usado_mb, p?.espacio_total_mb)} />
        <div>
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
      <div className="flex justify-between text-sm mb-1.5">
        <span className="text-gray-500 dark:text-gray-400">{label}</span>
        <span className="font-medium tabular-nums">{usado} / {total}</span>
      </div>
      <div className="h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: pct + '%' }} />
      </div>
    </div>
  );
}
