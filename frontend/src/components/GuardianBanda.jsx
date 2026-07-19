import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import BarChart from './BarChart';

export default function GuardianBanda() {
  const [servidores, setServidores] = useState([]);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => apiFetch('/admin/banda').then((d) => alive && (setServidores(d.servidores), setCargado(true))).catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!cargado || servidores.length === 0) return null;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold flex items-center gap-2">🛡️ Guardián de banda <span className="text-xs font-normal text-gray-400">(consumo estimado del mes)</span></h2>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {servidores.map((s) => {
          const pct = s.pct;
          const color = pct == null ? 'bg-gray-400' : pct >= 95 ? 'bg-red-500' : pct >= 85 ? 'bg-amber-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-brand-500';
          const alerta = pct != null && pct >= 70;
          const datosChart = s.por_dia.map((d) => ({ label: String(d.dia), valor: d.gb }));
          return (
            <div key={s.id} className="rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">{s.nombre}</span>
                {alerta && <span className={`text-[10px] px-2 py-0.5 rounded-full ${pct >= 95 ? 'bg-red-50 text-red-600 dark:bg-red-500/10' : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10'}`}>{pct >= 95 ? '¡Casi al tope!' : 'Ojo con la banda'}</span>}
              </div>
              <div className="flex items-baseline justify-between text-sm mb-1.5">
                <span className="text-gray-500 dark:text-gray-400">
                  {s.consumido_gb} GB {s.tope_gb ? `/ ${s.tope_gb} GB` : '(sin tope definido)'}
                </span>
                {pct != null && <span className="font-semibold">{pct}%</span>}
              </div>
              {pct != null && (
                <div className="h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden mb-3">
                  <div className={`h-full rounded-full ${color} transition-all`} style={{ width: pct + '%' }} />
                </div>
              )}
              <div className="text-[11px] text-gray-400 mb-1">Consumo por día (GB)</div>
              <BarChart data={datosChart} height={110} unidad=" GB" />
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 mt-3">
        Estimado con {`${''}`}oyentes × bitrate. Define el tope de cada servidor (el de Hostinger) en <b>Servidores</b> para ver el % y recibir alertas antes de agotarlo.
      </p>
    </div>
  );
}
