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

  const pct = p && p.cupo_radios ? Math.round((p.radios_usadas / p.cupo_radios) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Radios usadas" value={p?.radios_usadas ?? '–'} icon={IconRadio} color="brand" hint={`de ${p?.cupo_radios ?? '–'} de cupo`} />
        <StatCard label="Disponibles" value={p?.disponibles ?? '–'} icon={IconUsers} color="blue" hint="para crear" />
        <StatCard label="Cupo total" value={p?.cupo_radios ?? '–'} icon={IconChart} color="violet" hint="asignado por el admin" />
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Uso de tu cupo</h2>
          <span className="text-sm text-gray-400">{p?.radios_usadas ?? 0} / {p?.cupo_radios ?? 0}</span>
        </div>
        <div className="h-3 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : pct > 75 ? 'bg-amber-500' : 'bg-brand-500'}`} style={{ width: pct + '%' }} />
        </div>
        <div className="mt-4">
          <Link to="/reseller/clientes" className="btn-primary inline-flex">Gestionar mis radios</Link>
        </div>
        {p?.disponibles === 0 && (
          <p className="text-xs text-amber-600 mt-3">Llegaste a tu cupo. Pide más al administrador para crear más radios.</p>
        )}
      </div>
    </div>
  );
}
