import { useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import DonutChart from '../../components/charts/DonutChart';
import ServerStats from '../../components/ServerStats';
import GuardianBanda from '../../components/GuardianBanda';
import Player from '../../components/Player';
import { IconRadio } from '../../icons';

/** GB legible: 850 GB, 2.4 TB… */
function tam(gb) {
  const n = Number(gb) || 0;
  if (n >= 1024) return (n / 1024).toFixed(n >= 10240 ? 0 : 1) + ' TB';
  return Math.round(n) + ' GB';
}

/** Celda de métrica dentro de un panel de servicio (sin card anidada). */
function Metric({ label, value, hint, destacado }) {
  return (
    <div className={`rounded-xl px-3 py-3 ${destacado ? 'bg-brand-50 dark:bg-brand-500/10' : 'bg-gray-50 dark:bg-gray-950'}`}>
      <div className="text-[11px] text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-gray-400 mt-0.5">{hint}</div>}
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [banda, setBanda] = useState([]);
  const [monitorId, setMonitorId] = useState('');

  useEffect(() => {
    const load = () => {
      apiFetch('/admin/estadisticas').then(setStats).catch(() => {});
      apiFetch('/admin/clientes').then((c) => setClientes(c.clientes)).catch(() => {});
      apiFetch('/admin/banda').then((d) => setBanda(d.servidores || [])).catch(() => {});
    };
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  // ── Separar por servicio ──
  const audio = clientes.filter((c) => (c.tipo || 'audio') !== 'video');
  const video = clientes.filter((c) => c.tipo === 'video');
  const activos = (arr) => arr.filter((c) => c.activo).length;

  const oyentes = stats?.oyentes_totales ?? 0;
  const alAire = stats?.al_aire ?? 0;
  const ranking = stats?.ranking || [];
  const maxOy = Math.max(1, ...ranking.map((r) => r.oyentes));

  const nodosAudio = banda.filter((s) => (s.tipo || 'audio') !== 'video');
  const nodosVideo = banda.filter((s) => s.tipo === 'video');
  const transferAudio = nodosAudio.reduce((a, s) => a + (s.consumido_gb || 0), 0);
  const transferVideo = nodosVideo.reduce((a, s) => a + (s.consumido_gb || 0), 0);

  const conStream = audio.filter((c) => c.url_streaming);
  const monitor = conStream.find((c) => String(c.id) === String(monitorId)) || conStream[0];

  return (
    <div className="space-y-6">
      {/* ═══ 1) GUARDIÁN DE BANDA — lo primero: salud de todos los nodos ═══ */}
      <GuardianBanda />

      {/* ═══ 2) RESUMEN POR SERVICIO — audio y video, separaditos ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ─── AUDIO ─── */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">🎙️ Streaming Audio</h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400">
              {nodosAudio.length} nodo{nodosAudio.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Oyentes en vivo" value={oyentes} hint="todas las radios" destacado />
            <Metric label="Radios al aire" value={alAire} hint={`de ${audio.length} radios`} />
            <Metric label="Clientes de audio" value={audio.length} hint={`${activos(audio)} activos`} />
            <Metric label="Transferencia" value={tam(transferAudio)} hint="este mes" />
          </div>
        </div>

        {/* ─── VIDEO ─── */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">🎬 Streaming Video</h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-fuchsia-50 dark:bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400">
              {nodosVideo.length} nodo{nodosVideo.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Viewers en vivo" value="—" hint="próximamente" />
            <Metric label="Canales" value={video.length} hint={`${activos(video)} activos`} />
            <Metric label="Clientes de video" value={video.length} hint={`${activos(video)} activos`} />
            <Metric label="Transferencia" value={tam(transferVideo)} hint="este mes" />
          </div>
        </div>
      </div>

      {/* ═══ 3) DETALLE AUDIO: dona de estado + ranking ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="font-semibold mb-4">Estado de las radios</h2>
          <DonutChart centro="Radios" data={[
            { label: 'Al aire', valor: alAire, color: '#10b981' },
            { label: 'Fuera de aire', valor: Math.max(0, activos(audio) - alAire), color: '#94a3b8' },
            { label: 'Suspendidas', valor: Math.max(0, audio.length - activos(audio)), color: '#ef4444' },
          ]} />
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-4">Top radios por oyentes</h2>
          {ranking.length ? (
            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
              {ranking.slice(0, 8).map((r, i) => (
                <div key={r.cliente_id} className="flex items-center gap-3">
                  <span className="w-5 text-sm text-gray-400 tabular-nums">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium truncate flex items-center gap-2">{r.nombre}
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
          ) : <p className="text-sm text-gray-400 py-6 text-center">Sin oyentes todavía.</p>}
        </div>
      </div>

      {/* ═══ 4) INFRAESTRUCTURA: VPS + monitor de radio ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ServerStats />
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2"><IconRadio width={18} height={18} /> Monitor de radio</h2>
            {conStream.length > 0 && (
              <select className="input !w-auto !py-1.5 text-sm" value={monitor?.id || ''} onChange={(e) => setMonitorId(e.target.value)}>
                {conStream.map((c) => <option key={c.id} value={c.id}>{c.nombre_empresa}</option>)}
              </select>
            )}
          </div>
          {monitor ? <Player src={monitor.url_streaming} title={monitor.nombre_empresa} subtitle="Monitoreando" />
            : <p className="text-sm text-gray-400">Ninguna estación con stream disponible aún.</p>}
        </div>
      </div>
    </div>
  );
}
