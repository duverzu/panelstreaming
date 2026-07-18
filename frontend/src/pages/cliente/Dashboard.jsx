import { useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import StatCard from '../../components/StatCard';
import { IconMic, IconChart, IconRadio } from '../../icons';

export default function ClienteDashboard() {
  const [perfil, setPerfil] = useState(null);
  const [estacion, setEstacion] = useState(null);
  const [nowplaying, setNowplaying] = useState(null);
  const [npError, setNpError] = useState(null);

  useEffect(() => {
    apiFetch('/cliente/perfil').then((d) => setPerfil(d.perfil)).catch(() => {});
    apiFetch('/cliente/mi-estacion').then((d) => setEstacion(d.estacion)).catch(() => {});
    apiFetch('/cliente/nowplaying')
      .then((d) => setNowplaying(d.nowplaying))
      .catch((e) => setNpError(e.message));
  }, []);

  const cancion = nowplaying?.now_playing?.song;

  return (
    <div className="space-y-6">
      {/* Bienvenida */}
      <div className="card p-6 bg-gradient-to-br from-brand-600 to-brand-500 border-0 text-white">
        <h2 className="text-xl font-bold">Hola, {perfil?.nombre_empresa || 'tu radio'} 👋</h2>
        <p className="text-brand-50/90 text-sm mt-1">
          Plan {perfil?.plan || '—'} · Bienvenido a tu panel de streaming
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Oyentes ahora" value={nowplaying?.listeners?.current ?? 0} icon={IconMic} color="brand" hint="en vivo" />
        <StatCard label="Pico de hoy" value="–" icon={IconChart} color="violet" hint="próximamente" />
        <StatCard label="Estado" value={estacion?.azuracast_station_id ? 'OK' : '—'} icon={IconRadio} color="blue"
          hint={estacion?.azuracast_station_id ? 'estación activa' : 'sin estación'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sonando ahora */}
        <div className="card p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2"><IconMic width={18} height={18} /> Sonando ahora</h2>
          {cancion ? (
            <div>
              <div className="text-lg font-semibold">{cancion.title || 'Sin título'}</div>
              <div className="text-gray-500">{cancion.artist || 'Artista desconocido'}</div>
            </div>
          ) : (
            <div className="text-sm text-gray-400">
              {npError
                ? 'La estación no está transmitiendo en este momento.'
                : 'Cargando información en vivo…'}
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
          ) : (
            <div className="text-sm text-gray-400">Cargando…</div>
          )}
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
