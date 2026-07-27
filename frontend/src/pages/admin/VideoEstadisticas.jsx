import { useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import StatTile from '../../components/charts/StatTile';
import { IconMic, IconPlaylist, IconChart } from '../../icons';

function tam(gb) {
  const n = Number(gb) || 0;
  if (n >= 1024) return (n / 1024).toFixed(n >= 10240 ? 0 : 1) + ' TB';
  return Math.round(n) + ' GB';
}

export default function AdminVideoEstadisticas() {
  const [vw, setVw] = useState(null);
  const [banda, setBanda] = useState([]);

  useEffect(() => {
    const load = () => {
      apiFetch('/admin/video/viewers').then(setVw).catch(() => {});
      apiFetch('/admin/banda').then((d) => setBanda((d.servidores || []).filter((s) => s.tipo === 'video'))).catch(() => {});
    };
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  const canales = vw?.canales || [];
  const total = vw?.total ?? 0;
  const alAire = canales.filter((c) => c.viewers > 0).length;
  const transferVideo = banda.reduce((a, s) => a + (s.consumido_gb || 0), 0);
  const maxV = Math.max(1, ...canales.map((c) => c.viewers));

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold flex items-center gap-2">🎬 Estadísticas de video</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile label="Viewers en vivo" value={total} icon={IconMic} color="brand" gradient hint="todos los canales" />
        <StatTile label="Canales con audiencia" value={alAire} icon={IconPlaylist} color="violet" hint={`de ${canales.length} canales`} />
        <StatTile label="Transferencia" value={tam(transferVideo)} icon={IconChart} color="amber" hint="este mes" />
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Espectadores por canal</h2>
          <span className="text-xs text-gray-400">en vivo · se actualiza solo</span>
        </div>
        {canales.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Aún no hay canales de video.</p>
        ) : (
          <div className="space-y-3">
            {canales.map((c) => (
              <div key={c.cliente_id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium truncate flex items-center gap-2">
                      {c.nombre}
                      <span className={`w-1.5 h-1.5 rounded-full ${c.viewers > 0 ? 'bg-brand-500 animate-pulse' : 'bg-gray-300 dark:bg-gray-700'}`} />
                      {!c.activo && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 dark:bg-red-500/10">suspendido</span>}
                    </span>
                    <span className="text-sm tabular-nums">{c.viewers}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${(c.viewers / maxV) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-400 mt-4">Se cuenta por IPs únicas que están recibiendo el video (HLS) en el último minuto. Es una estimación de espectadores concurrentes, como en tu panel anterior.</p>
      </div>
    </div>
  );
}
