import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { IconServer } from '../icons';

function Barra({ label, pct, detail }) {
  const color = pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-brand-500';
  return (
    <div>
      <div className="flex justify-between items-baseline text-sm mb-1.5">
        <span className="text-gray-500 dark:text-gray-400">{label}</span>
        <span className="font-semibold tabular-nums">{detail}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: pct + '%' }} />
      </div>
    </div>
  );
}

export default function ServerStats() {
  const [s, setS] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      apiFetch('/admin/servidor')
        .then((d) => alive && (setS(d), setError(false)))
        .catch(() => alive && setError(true));
    load();
    const id = setInterval(load, 5000); // auto-refresh cada 5s
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold flex items-center gap-2">
          <IconServer width={18} height={18} /> Servidor (VPS)
        </h2>
        <span className="flex items-center gap-1.5 text-xs text-gray-400">
          <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" /> en vivo
        </span>
      </div>

      {error ? (
        <p className="text-sm text-gray-400">No se pudo leer el estado del servidor.</p>
      ) : !s ? (
        <p className="text-sm text-gray-400">Cargando métricas…</p>
      ) : (
        <div className="space-y-4">
          <Barra label={`CPU · ${s.cpu.cores || ''} cores`} pct={s.cpu.usado_pct} detail={`${s.cpu.usado_pct}%`} />
          <Barra label={`Memoria · ${s.memoria.total}`} pct={s.memoria.usado_pct} detail={`${s.memoria.usado_pct}%`} />
          <Barra label={`Disco · ${s.disco.total}`} pct={s.disco.usado_pct} detail={`${s.disco.usado} usado`} />
          {Array.isArray(s.cpu.load) && s.cpu.load.length === 3 && (
            <div className="text-xs text-gray-400 pt-1">
              Carga: {s.cpu.load.map((n) => Number(n).toFixed(2)).join(' · ')} (1/5/15 min)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
