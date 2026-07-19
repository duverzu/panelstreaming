import { useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import StatTile from '../../components/charts/StatTile';
import AreaChart from '../../components/charts/AreaChart';
import Player from '../../components/Player';
import { IconMic, IconChart, IconRadio, IconUsers } from '../../icons';

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

  function cargarNP() { apiFetch('/cliente/nowplaying').then((d) => setNowplaying(d.nowplaying)).catch((e) => setNpError(e.message)); }

  useEffect(() => {
    apiFetch('/cliente/perfil').then((d) => setPerfil(d.perfil)).catch(() => {});
    apiFetch('/cliente/mi-estacion').then((d) => setEstacion(d.estacion)).catch(() => {});
    apiFetch('/cliente/estadisticas').then(setStats).catch(() => {});
    cargarNP();
  }, []);

  async function saltar() {
    setSaltando(true);
    try { await apiFetch('/cliente/saltar', { method: 'POST' }); setTimeout(cargarNP, 2000); }
    catch (e) { alert(e.message); } finally { setSaltando(false); }
  }

  const cancion = nowplaying?.now_playing?.song;
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
        <StatTile label="En vivo" value={nowplaying?.live?.is_live ? 'DJ' : 'AutoDJ'} icon={IconUsers} color="blue" hint={nowplaying?.live?.is_live ? 'transmitiendo' : 'automático'} />
        <StatTile label="Estado" value={estacion?.azuracast_station_id ? 'OK' : '—'} icon={IconRadio} color="amber" hint={estacion?.azuracast_station_id ? 'activa' : 'sin estación'} />
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
            <button onClick={saltar} disabled={saltando} className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-brand-500 hover:text-brand-600 transition disabled:opacity-50">
              {saltando ? 'Saltando…' : '⏭ Saltar canción'}
            </button>
          </div>
          {cancion ? (
            <div><div className="text-lg font-semibold">{cancion.title || 'Sin título'}</div><div className="text-gray-500">{cancion.artist || 'Artista desconocido'}</div></div>
          ) : (
            <div className="text-sm text-gray-400">{npError ? 'La estación no está transmitiendo en este momento.' : 'Cargando información en vivo…'}</div>
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
