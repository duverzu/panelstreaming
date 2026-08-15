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
          {/* El espacio va destacado y arriba: es el dato que decide si caben
              más radios o hay que ampliar, y en una barra más se perdía. */}
          <div className={`rounded-xl px-3.5 py-3 ${
            s.disco.usado_pct >= 85 ? 'bg-red-50 dark:bg-red-500/10'
              : s.disco.usado_pct >= 70 ? 'bg-amber-50 dark:bg-amber-500/10'
              : 'bg-brand-50 dark:bg-brand-500/10'
          }`}>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">Espacio libre</div>
                <div className="text-2xl font-bold tabular-nums leading-tight">{s.disco.libre || '—'}</div>
              </div>
              <div className="text-right text-[11px] text-gray-500 dark:text-gray-400">
                <div>{s.disco.usado} usados</div>
                <div>de {s.disco.total} · {s.disco.usado_pct}%</div>
              </div>
            </div>
            <div className="h-1.5 mt-2 rounded-full bg-white/70 dark:bg-black/30 overflow-hidden">
              <div
                className={`h-full rounded-full ${s.disco.usado_pct >= 85 ? 'bg-red-500' : s.disco.usado_pct >= 70 ? 'bg-amber-500' : 'bg-brand-500'}`}
                style={{ width: s.disco.usado_pct + '%' }}
              />
            </div>
          </div>

          <Barra label={`CPU · ${s.cpu.cores || ''} cores`} pct={s.cpu.usado_pct} detail={`${s.cpu.usado_pct}%`} />
          {/* El steal no se arregla desde aquí: es el proveedor dando menos
              CPU del que vende. Se avisa solo cuando ya es bastante, porque un
              poco es normal en cualquier VPS compartido. */}
          {s.cpu.robado_pct >= 5 && (
            <div className="text-[11px] text-amber-600 dark:text-amber-400 -mt-1">
              +{s.cpu.robado_pct}% que se lleva el vecino (CPU robado por el proveedor)
            </div>
          )}
          {/* Se enseña cuánta memoria hay usada de verdad, no solo el
              porcentaje: "3.78 GB de 31.34 GB" tranquiliza mirándolo, un 13%
              a secas obliga a hacer la cuenta. */}
          <Barra label={`Memoria · ${s.memoria.total}`} pct={s.memoria.usado_pct}
            detail={`${s.memoria.usado || ''} · ${s.memoria.usado_pct}%`} />
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
