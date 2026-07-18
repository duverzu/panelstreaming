import { useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import StatCard from '../../components/StatCard';
import BarChart from '../../components/BarChart';
import { IconMic, IconChart, IconUsers } from '../../icons';

/** timestamp/hora -> etiqueta corta */
function label(x) {
  if (typeof x === 'number') {
    const d = new Date(x > 1e12 ? x : x * 1000);
    if (isNaN(d)) return String(x);
    return d.getHours() + 'h';
  }
  return String(x).slice(0, 5);
}

export default function ClienteEstadisticas() {
  const [s, setS] = useState(null);
  const [oyentes, setOyentes] = useState([]);
  const [loading, setLoading] = useState(true);

  async function cargar() {
    try {
      const [est, oy] = await Promise.all([
        apiFetch('/cliente/estadisticas'),
        apiFetch('/cliente/oyentes').catch(() => ({ oyentes: [] })),
      ]);
      setS(est);
      setOyentes(oy.oyentes || []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    cargar();
    const id = setInterval(cargar, 15000); // refresca cada 15s
    return () => clearInterval(id);
  }, []);

  if (loading) return <p className="py-10 text-center text-gray-400">Cargando estadísticas…</p>;

  const porHora = (s?.por_hora || []).map((p) => ({ label: label(p.x), valor: p.y }));
  const porDia = (s?.por_dia || []).map((p) => ({ label: label(p.x), valor: p.y }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Oyentes ahora" value={s?.oyentes_ahora ?? 0} icon={IconMic} color="brand" hint="en vivo" />
        <StatCard label="Pico de audiencia" value={s?.pico ?? 0} icon={IconChart} color="violet" hint="máx. registrado" />
        <StatCard label="Oyentes en vivo" value={oyentes.length} icon={IconUsers} color="blue" hint="conectados ahora" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="font-semibold mb-4">Audiencia por hora del día</h2>
          <BarChart data={porHora} unidad=" oyentes" />
        </div>
        <div className="card p-5">
          <h2 className="font-semibold mb-4">Audiencia por día</h2>
          <BarChart data={porDia} unidad=" oyentes" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top canciones */}
        <div className="card p-5">
          <h2 className="font-semibold mb-4">Canciones más escuchadas</h2>
          {s?.top_canciones?.length ? (
            <div className="space-y-2">
              {s.top_canciones.map((c, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className="w-6 text-gray-400 tabular-nums">{i + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{c.titulo}</div>
                    <div className="text-xs text-gray-400 truncate">{c.artista}</div>
                  </div>
                  <span className="text-xs text-gray-400">{c.reproducciones} plays</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-6 text-center">Aún no hay datos de reproducción.</p>
          )}
        </div>

        {/* Oyentes en vivo */}
        <div className="card p-5">
          <h2 className="font-semibold mb-4">Oyentes conectados</h2>
          {oyentes.length ? (
            <div className="space-y-2">
              {oyentes.map((o, i) => (
                <div key={i} className="flex items-center justify-between text-sm border-b border-gray-50 dark:border-gray-800/60 last:border-0 py-1.5">
                  <span>🌎 {o.pais}</span>
                  <span className="text-gray-400">{o.dispositivo}</span>
                  <span className="text-xs text-gray-400">{Math.round(o.conectado_seg / 60)} min</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-6 text-center">Nadie escuchando en este momento.</p>
          )}
        </div>
      </div>
    </div>
  );
}
