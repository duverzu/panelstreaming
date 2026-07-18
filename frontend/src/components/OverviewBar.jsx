import { useEffect, useState } from 'react';
import { apiFetch } from '../api';

/** Barra de resumen tipo hosting: transferencia, disco, streams. */
export default function OverviewBar() {
  const [srv, setSrv] = useState(null);
  const [estaciones, setEstaciones] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      apiFetch('/admin/servidor').then((d) => alive && setSrv(d)).catch(() => {});
      apiFetch('/admin/estadisticas').then((d) => alive && setEstaciones(d.estaciones)).catch(() => {});
    };
    load();
    const id = setInterval(load, 10000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <div className="card p-0 overflow-hidden">
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 dark:divide-gray-800">
        <Tile icon="📡" label="Transferencia (ahora)" value={srv?.transferencia?.velocidad ?? '—'} />
        <Tile icon="💾" label="Uso de disco"
          value={srv ? `${srv.disco.usado} / ${srv.disco.total}` : '—'} pct={srv?.disco?.usado_pct} />
        <Tile icon="📻" label="Total de streams" value={estaciones ?? '—'} sufijo="(sin límite)" />
      </div>
    </div>
  );
}

function Tile({ icon, label, value, pct, sufijo }) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-1.5">
        <span>{icon}</span> {label}
      </div>
      <div className="text-lg font-bold tabular-nums">
        {value} {sufijo && <span className="text-xs font-normal text-gray-400">{sufijo}</span>}
      </div>
      {pct !== undefined && (
        <div className="mt-2 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div className={`h-full rounded-full ${pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-brand-500'}`} style={{ width: pct + '%' }} />
        </div>
      )}
    </div>
  );
}
