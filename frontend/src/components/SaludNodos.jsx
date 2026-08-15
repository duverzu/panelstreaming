import { useEffect, useState } from 'react';
import { apiFetch } from '../api';

/** Bytes a la unidad que se lee mejor. */
function peso(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1099511627776) return (n / 1099511627776).toFixed(1) + ' TB';
  if (n >= 1073741824) return (n / 1073741824).toFixed(n >= 10737418240 ? 0 : 1) + ' GB';
  if (n >= 1048576) return Math.round(n / 1048576) + ' MB';
  return Math.round(n / 1024) + ' KB';
}

function tiempo(s) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return d ? `${d} d ${h} h` : `${h} h`;
}

/** Barra con umbral: verde tranquilo, ámbar «mírame», rojo «actúa ya». */
function Barra({ label, pct, detail, aviso = 75, critico = 90 }) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const color = p >= critico ? 'bg-red-500' : p >= aviso ? 'bg-amber-500' : 'bg-brand-500';
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500 dark:text-gray-400">{label}</span>
        <span className="tabular-nums font-medium">{detail}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: p + '%' }} />
      </div>
    </div>
  );
}

/**
 * Salud de los nodos de video: lo que hasta ahora había que mirar por SSH.
 *
 * Se refresca sola cada 30 s. La idea es que si esta tarjeta está toda verde,
 * no hace falta entrar al servidor a comprobar nada.
 */
export default function SaludNodos() {
  const [nodos, setNodos] = useState(undefined);

  useEffect(() => {
    const cargar = () => apiFetch('/admin/nodos-video/salud')
      .then((d) => setNodos(d.nodos || []))
      .catch(() => setNodos([]));
    cargar();
    const t = setInterval(cargar, 30000);
    return () => clearInterval(t);
  }, []);

  if (nodos === undefined) return null;
  if (!nodos.length) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {nodos.map((n) => <Nodo key={n.id} n={n} />)}
    </div>
  );
}

function Nodo({ n }) {
  if (!n.responde) {
    return (
      <div className="card p-5 border-red-200 dark:border-red-500/30">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold flex items-center gap-2">🖥️ {n.nombre}</h2>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 dark:bg-red-500/10">sin respuesta</span>
        </div>
        <p className="text-xs text-gray-400">
          El nodo no contesta. Los canales pueden seguir al aire — quien sirve el video es nginx,
          no el agente — pero desde aquí no se puede ver ni tocar nada suyo.
        </p>
      </div>
    );
  }

  const svc = n.servicios || {};
  const caido = Object.entries(svc).filter(([, ok]) => !ok).map(([k]) => k);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold flex items-center gap-2">🖥️ {n.nombre}</h2>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400">
          {n.canales?.al_aire ?? 0} de {n.canales?.total ?? 0} al aire
        </span>
      </div>

      {/* Un servicio caído se dice primero y con todas las letras: es lo único
          de esta tarjeta que exige levantarse a hacer algo ahora mismo. */}
      {caido.length > 0 && (
        <div className="mb-4 text-xs rounded-xl bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 px-3 py-2">
          <b>{caido.join(' y ')}</b> {caido.length > 1 ? 'están caídos' : 'está caído'}. {svc.nginx === false
            ? 'Sin nginx no se ve ningún canal.'
            : 'Sin MediaMTX no entra ni sale nada por SRT.'}
        </div>
      )}

      <div className="space-y-3">
        <Barra
          label={`Disco · ${peso(n.disco?.total_bytes)}`}
          pct={n.disco?.usado_pct}
          detail={`quedan ${peso(n.disco?.libre_bytes)}`}
        />
        <Barra
          label={`CPU · ${n.cpu?.nucleos || '?'} cores`}
          pct={n.cpu?.usado_pct}
          detail={`${n.cpu?.usado_pct ?? '—'}%`}
        />
        {n.cpu?.robado_pct >= 5 && (
          <div className="text-[11px] text-amber-600 dark:text-amber-400 -mt-1">
            +{n.cpu.robado_pct}% que se lleva el vecino (CPU robado por el proveedor)
          </div>
        )}
        <Barra
          label={`Memoria · ${peso(n.memoria?.total_bytes)}`}
          pct={n.memoria?.usado_pct}
          detail={`${peso(n.memoria?.usado_bytes)} · ${n.memoria?.usado_pct ?? '—'}%`}
        />
      </div>

      <div className="flex justify-between text-[11px] text-gray-400 pt-3 mt-3 border-t border-gray-100 dark:border-gray-800">
        <span>Encendido hace {tiempo(n.uptime_s || 0)}</span>
        {Array.isArray(n.cpu?.carga) && n.cpu.carga.length === 3 && (
          <span>Carga {n.cpu.carga.map((x) => Number(x).toFixed(2)).join(' · ')}</span>
        )}
      </div>
    </div>
  );
}
