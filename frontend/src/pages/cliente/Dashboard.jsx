import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../api';
import StatTile from '../../components/charts/StatTile';
import AreaChart from '../../components/charts/AreaChart';
import DonutChart from '../../components/charts/DonutChart';
import Player from '../../components/Player';
import { IconMic, IconChart, IconRadio, IconUsers, IconServer, IconMusic } from '../../icons';

/** MB legibles: 512 → "512 MB", 5120 → "5.0 GB" */
function mb(n) {
  const v = Number(n) || 0;
  return v >= 1024 ? (v / 1024).toFixed(1) + ' GB' : v + ' MB';
}

function label(x) {
  if (typeof x === 'number') { const d = new Date(x > 1e12 ? x : x * 1000); return isNaN(d) ? String(x) : d.getHours() + 'h'; }
  return String(x).slice(0, 5);
}

export default function ClienteDashboard() {
  const [perfil, setPerfil] = useState(null);
  const [estacion, setEstacion] = useState(null);
  const [nowplaying, setNowplaying] = useState(null);
  const [npError, setNpError] = useState(null);
  const [stats, setStats] = useState(null);
  const [saltando, setSaltando] = useState(false);
  const [consumo, setConsumo] = useState(null);
  const [estado, setEstado] = useState(null);   // 'sonando ahora' ya resuelto

  function cargarNP() {
    apiFetch('/cliente/nowplaying')
      .then((d) => { setNowplaying(d.nowplaying); setEstado(d.estado || null); })
      .catch((e) => setNpError(e.message));
  }

  useEffect(() => {
    apiFetch('/cliente/perfil').then((d) => setPerfil(d.perfil)).catch(() => {});
    apiFetch('/cliente/mi-estacion').then((d) => setEstacion(d.estacion)).catch(() => {});
    apiFetch('/cliente/estadisticas').then(setStats).catch(() => {});
    apiFetch('/cliente/consumo').then(setConsumo).catch(() => {});
    cargarNP();
  }, []);

  async function saltar() {
    setSaltando(true);
    try { await apiFetch('/cliente/saltar', { method: 'POST' }); setTimeout(cargarNP, 2000); }
    catch (e) { alert(e.message); } finally { setSaltando(false); }
  }

  const enVivo = Boolean(estado?.is_live);
  const sinTitulosEnVivo = Boolean(estado?.sin_metadata_en_vivo);
  const banda = (consumo?.banda?.serie || []).map((d) => ({
    label: new Date(d.fecha).toLocaleDateString('es', { day: '2-digit', month: 'short' }),
    valor: d.gb,
  }));
  const disco = consumo?.disco;
  const libreMb = Math.max(0, (disco?.total_mb || 0) - (disco?.usado_mb || 0));
  const porHora = (stats?.por_hora || []).map((p) => ({ label: label(p.x), valor: p.y }));

  return (
    <div className="space-y-6">
      {/* Bienvenida */}
      <div className="rounded-2xl p-6 bg-gradient-to-br from-brand-600 to-emerald-600 text-white shadow-sm">
        <h2 className="text-xl font-bold">Hola, {perfil?.nombre_empresa || 'tu radio'} 👋</h2>
        <p className="text-brand-50/90 text-sm mt-1">Plan {perfil?.plan || '—'} · Bienvenido a tu panel de streaming</p>
      </div>

      {/* Player */}
      {estacion?.url_streaming && <Player src={estacion.url_streaming} title={estacion.nombre} subtitle="Tu radio en vivo" />}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Oyentes ahora" value={stats?.oyentes_ahora ?? 0} icon={IconMic} color="brand" gradient hint="en vivo" />
        <StatTile label="Pico de audiencia" value={stats?.pico ?? 0} icon={IconChart} color="violet" hint="máx. del mes" />
        <StatTile label="En vivo" value={enVivo ? 'DJ' : 'AutoDJ'} icon={IconUsers} color="blue" hint={enVivo ? (estado?.streamer || 'transmitiendo') : 'automático'} />
        <StatTile label="Estado" value={estacion?.azuracast_station_id ? 'OK' : '—'} icon={IconRadio} color="amber" hint={estacion?.azuracast_station_id ? 'activa' : 'sin estación'} />
      </div>

      {/* Consumo: transferencia y disco */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Transferencia */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="font-semibold flex items-center gap-2"><IconChart width={18} height={18} /> Transferencia</h2>
              <p className="text-xs text-gray-400 mt-0.5">Datos enviados a tus oyentes · últimos 30 días</p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-2xl font-bold tabular-nums">{consumo?.banda?.mes || '—'}</div>
              <div className="text-xs text-gray-400">este mes</div>
            </div>
          </div>
          {consumo?.banda?.hay_datos ? (
            <AreaChart data={banda} color="#6366f1" unidad=" GB" height={190} />
          ) : (
            <div className="grid place-items-center text-center text-sm text-gray-400 px-4" style={{ height: 190 }}>
              <div>
                <div className="text-2xl mb-2">📊</div>
                Aún no hay medición.<br />
                <span className="text-xs">Se registra automáticamente mientras tu radio tenga oyentes.</span>
              </div>
            </div>
          )}
        </div>

        {/* Disco */}
        <div className="card p-5">
          <h2 className="font-semibold flex items-center gap-2 mb-1"><IconServer width={18} height={18} /> Almacenamiento</h2>
          <p className="text-xs text-gray-400 mb-3">Espacio de tu música</p>

          <div className="grid place-items-center">
            <DonutChart
              size={150} thickness={20}
              centro={`${disco?.porcentaje ?? 0}%`}
              data={[
                { label: 'Usado', valor: disco?.usado_mb || 0, color: (disco?.porcentaje ?? 0) >= 90 ? '#ef4444' : (disco?.porcentaje ?? 0) >= 70 ? '#f59e0b' : '#10b981' },
                { label: 'Libre', valor: libreMb, color: '#e5e7eb' },
              ]}
            />
          </div>

          <div className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Usado</span><b className="tabular-nums">{mb(disco?.usado_mb)}</b></div>
            <div className="flex justify-between"><span className="text-gray-400">Total del plan</span><b className="tabular-nums">{mb(disco?.total_mb)}</b></div>
            <div className="flex justify-between"><span className="text-gray-400 flex items-center gap-1"><IconMusic width={13} height={13} /> Canciones</span><b className="tabular-nums">{disco?.archivos ?? 0}</b></div>
          </div>

          {(disco?.porcentaje ?? 0) >= 90 && (
            <div className="mt-3 text-xs rounded-xl px-3 py-2 text-red-600 bg-red-50 dark:bg-red-500/10">
              Casi sin espacio. Borra canciones que no uses o pide una ampliación.
            </div>
          )}
        </div>
      </div>

      {/* Audiencia por hora */}
      <div className="card p-5">
        <h2 className="font-semibold mb-4">Audiencia por hora del día</h2>
        <AreaChart data={porHora} color="#10b981" unidad=" oyentes" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sonando ahora */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2"><IconMic width={18} height={18} /> Sonando ahora</h2>
            {!enVivo && (
              <button onClick={saltar} disabled={saltando} className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-brand-500 hover:text-brand-600 transition disabled:opacity-50">
                {saltando ? 'Saltando…' : '⏭ Saltar canción'}
              </button>
            )}
          </div>
          {estado?.is_online ? (
            <div>
              {/* De dónde viene el audio ahora mismo */}
              <div className="flex items-center gap-2 mb-1.5">
                {enVivo ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> EN VIVO
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">
                    AUTODJ
                  </span>
                )}
                {enVivo && estado?.streamer && <span className="text-xs text-gray-400">{estado.streamer}</span>}
              </div>
              <div className="text-lg font-semibold">{estado?.titulo || 'Sin título'}</div>
              <div className="text-gray-500">{estado?.artista || (enVivo ? '' : 'Artista desconocido')}</div>
            </div>
          ) : (
            <div className="text-sm text-gray-400">{npError || estado ? 'La estación no está transmitiendo en este momento.' : 'Cargando información en vivo…'}</div>
          )}

          {/* El DJ está al aire pero su programa no envía el nombre de la canción */}
          {sinTitulosEnVivo && (
            <div className="mt-4 text-xs rounded-xl px-3 py-2.5 text-amber-700 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400">
              <b>Estás en vivo, pero sin enviar el nombre de la canción.</b><br />
              Tus oyentes ven el reproductor sin el título. Se activa en tu programa de transmisión
              (BUTT, Mixxx, Sam Broadcaster…). Te explicamos cómo en{' '}
              <Link to="/cliente/aprende" className="underline underline-offset-2 font-medium">Aprende</Link>.
            </div>
          )}
        </div>

        {/* Mi estación */}
        <div className="card p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2"><IconRadio width={18} height={18} /> Mi estación</h2>
          {estacion ? (
            <div className="space-y-2 text-sm">
              <Row label="Nombre" value={estacion.nombre} />
              <Row label="Plan" value={estacion.plan} />
              <Row label="URL de streaming" value={estacion.url_streaming || '—'} mono />
            </div>
          ) : <div className="text-sm text-gray-400">Cargando…</div>}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-gray-50 dark:border-gray-800/60 last:border-0">
      <span className="text-gray-400">{label}</span>
      <span className={`text-right ${mono ? 'font-mono text-xs break-all' : 'font-medium'}`}>{value}</span>
    </div>
  );
}
