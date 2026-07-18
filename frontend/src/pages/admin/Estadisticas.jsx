import { useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import StatCard from '../../components/StatCard';
import { IconUsers, IconRadio, IconChart, IconMic } from '../../icons';

export default function AdminEstadisticas() {
  const [s, setS] = useState(null);
  const [loading, setLoading] = useState(true);

  async function cargar() {
    try { setS(await apiFetch('/admin/estadisticas')); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    cargar();
    const id = setInterval(cargar, 15000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <p className="py-10 text-center text-gray-400">Cargando…</p>;

  const ranking = s?.ranking || [];
  const maxOy = Math.max(1, ...ranking.map((r) => r.oyentes));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard label="Oyentes totales" value={s?.oyentes_totales ?? 0} icon={IconMic} color="brand" hint="en vivo, todas las radios" />
        <StatCard label="Al aire" value={s?.al_aire ?? 0} icon={IconRadio} color="blue" hint={`de ${s?.estaciones ?? 0} estaciones`} />
        <StatCard label="Clientes" value={s?.total_clientes ?? 0} icon={IconUsers} color="violet" hint={`${s?.clientes_activos ?? 0} activos`} />
        <StatCard label="Estaciones" value={s?.estaciones ?? 0} icon={IconChart} color="amber" hint="aprovisionadas" />
      </div>

      {/* Ranking de estaciones por oyentes */}
      <div className="card p-5">
        <h2 className="font-semibold mb-4">Ranking de radios por oyentes</h2>
        {ranking.length ? (
          <div className="space-y-3">
            {ranking.map((r, i) => (
              <div key={r.cliente_id} className="flex items-center gap-3">
                <span className="w-5 text-sm text-gray-400 tabular-nums">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium truncate flex items-center gap-2">
                      {r.nombre}
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
        ) : (
          <p className="text-sm text-gray-400 py-6 text-center">Sin estaciones con oyentes todavía. El ranking se llena con el tráfico real.</p>
        )}
      </div>

      {/* Resumen negocio */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="text-xs text-gray-400 uppercase tracking-wide">Clientes activos</div>
          <div className="text-2xl font-bold mt-1">{s?.clientes_activos ?? 0}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs text-gray-400 uppercase tracking-wide">Suspendidos</div>
          <div className="text-2xl font-bold mt-1">{(s?.total_clientes ?? 0) - (s?.clientes_activos ?? 0)}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs text-gray-400 uppercase tracking-wide">Radios al aire</div>
          <div className="text-2xl font-bold mt-1">{s?.al_aire ?? 0}</div>
        </div>
      </div>
    </div>
  );
}
