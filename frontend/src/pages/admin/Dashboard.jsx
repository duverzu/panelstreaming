import { useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import { useAmbito } from '../../ambito';
import DonutChart from '../../components/charts/DonutChart';
import ServerStats from '../../components/ServerStats';
import GuardianBanda from '../../components/GuardianBanda';

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

/** "hace 3 días", "hoy"… en vez de una fecha que hay que interpretar. */
function haceCuanto(iso) {
  if (!iso) return '';
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.round(dias / 30);
  return meses <= 1 ? 'hace 1 mes' : `hace ${meses} meses`;
}

/** Últimas altas: qué se ha dado de alta y cuándo. */
function Recientes({ clientes, esTodo, esVideo, esAudio }) {
  const visibles = clientes
    .filter((c) => (esTodo ? true : esVideo ? c.tipo === 'video' : (c.tipo || 'audio') !== 'video'))
    .filter((c) => c.created_at)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 8);

  const titulo = esTodo ? 'Últimas altas' : esVideo ? 'Últimos canales creados' : 'Últimas radios creadas';

  return (
    <div className="card p-5">
      <h2 className="font-semibold mb-4">{titulo}</h2>
      {visibles.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">Todavía no hay altas registradas.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          {visibles.map((c) => {
            const esV = c.tipo === 'video';
            return (
              <div key={c.id} className="flex items-center gap-3 py-2 border-b border-gray-50 dark:border-gray-800/60 last:border-0">
                <span className={`w-1 h-8 rounded-full shrink-0 ${esV ? 'bg-fuchsia-500' : 'bg-brand-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.nombre_empresa}</div>
                  <div className="text-[11px] text-gray-400 truncate">
                    {esV ? '🎬 Canal' : '🎙️ Radio'} · {c.plan}
                  </div>
                </div>
                <span className="text-[11px] text-gray-400 shrink-0">{haceCuanto(c.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [banda, setBanda] = useState([]);
  const [videoViewers, setVideoViewers] = useState(null);

  useEffect(() => {
    const load = () => {
      apiFetch('/admin/estadisticas').then(setStats).catch(() => {});
      apiFetch('/admin/clientes').then((c) => setClientes(c.clientes)).catch(() => {});
      apiFetch('/admin/banda').then((d) => setBanda(d.servidores || [])).catch(() => {});
      apiFetch('/admin/video/viewers').then(setVideoViewers).catch(() => {});
    };
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  // El modo de la cabecera decide qué mitad del negocio se muestra.
  const { esTodo, esAudio, esVideo } = useAmbito();

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

  return (
    <div className="space-y-6">
      {/* ═══ 1) GUARDIÁN DE BANDA — lo primero: salud de todos los nodos ═══ */}
      <GuardianBanda />


      {/* ═══ 2) RESUMEN: audio · video · VPS, uno al lado del otro ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* ─── AUDIO ─── */}
        {!esVideo && (
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
        )}

        {/* ─── VIDEO ─── */}
        {!esAudio && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">🎬 Streaming Video</h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-fuchsia-50 dark:bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400">
              {nodosVideo.length} nodo{nodosVideo.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Viewers en vivo" value={videoViewers?.total ?? 0} hint="todos los canales" destacado />
            {/* `/admin/video/viewers` no trae "al aire": lo que sí se puede
                contar es cuántos canales tienen a alguien viéndolos ahora. */}
            <Metric
              label="Canales con audiencia"
              value={(videoViewers?.canales || []).filter((c) => c.viewers > 0).length}
              hint={`de ${video.length} canales`}
            />
            <Metric label="Clientes de video" value={video.length} hint={`${activos(video)} activos`} />
            <Metric label="Transferencia" value={tam(transferVideo)} hint="este mes" />
          </div>
        </div>
        )}

        {/* ─── VPS ─── */}
        <ServerStats />
      </div>

      {/* ═══ 3) DETALLE AUDIO: dona de estado + ranking ═══ */}
      {!esVideo && (
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
      )}

      {/* ═══ 4) ALTAS RECIENTES ═══ */}
      <Recientes clientes={clientes} esTodo={esTodo} esVideo={esVideo} esAudio={esAudio} />

    </div>
  );
}
