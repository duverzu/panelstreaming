import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import BarChart from './BarChart';
import Gauge from './charts/Gauge';

/** GB a la unidad que se lee mejor: 850 GB, 2.4 TB… */
function tam(gb) {
  const n = Number(gb) || 0;
  if (n >= 1024) return (n / 1024).toFixed(n >= 10240 ? 0 : 1) + ' TB';
  if (n >= 10) return Math.round(n) + ' GB';
  return n.toFixed(1) + ' GB';
}

/** Estado → cómo se llama y con qué icono (el color nunca va solo). */
const ESTADO = {
  ok:         { icono: '✓', texto: 'Con margen',        clase: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400' },
  atencion:   { icono: '!', texto: 'Vigilar',           clase: 'text-amber-700 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400' },
  riesgo:     { icono: '▲', texto: 'En riesgo',         clase: 'text-orange-700 bg-orange-50 dark:bg-orange-500/10 dark:text-orange-400' },
  critico:    { icono: '■', texto: 'Crítico',           clase: 'text-red-700 bg-red-50 dark:bg-red-500/10 dark:text-red-400' },
  'sin-tope': { icono: '–', texto: 'Sin tope definido', clase: 'text-gray-500 bg-gray-100 dark:bg-gray-800 dark:text-gray-400' },
};

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
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold flex items-center gap-2">
          🛡️ Guardián de banda
          <span className="text-xs font-normal text-gray-400">(consumo estimado del mes)</span>
        </h2>
      </div>

      {/* Una tarjeta por nodo, en fila. Antes iban dentro de una sola tarjeta
          en dos columnas, y el tercer nodo caía suelto en una fila aparte. */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {servidores.map((s) => {
          const e = ESTADO[s.estado] || ESTADO['sin-tope'];
          const conTope = Boolean(s.tope_gb);
          const datosChart = s.por_dia.map((d) => ({ label: String(d.dia), valor: d.gb }));
          const esVideo = s.tipo === 'video';
          const pctOcup = s.capacidad ? Math.min(100, Math.round((s.radios / s.capacidad) * 100)) : null;

          return (
            <div key={s.id} className="card p-5">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium flex items-center gap-1.5">
                  <span className="text-xs">{esVideo ? '🎬' : '🎙️'}</span>{s.nombre}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${e.clase}`}>
                  {e.icono} {e.texto}
                </span>
              </div>
              <div className="text-[11px] text-gray-400 mb-3">
                {esVideo ? 'Nodo de video' : 'Nodo de audio'}
                {!s.activo && <span className="ml-1.5 text-amber-500">· pausado</span>}
              </div>

              {conTope ? (
                <>
                  <Gauge
                    valor={s.consumido_gb}
                    maximo={s.tope_gb}
                    proyeccion={s.proyeccion_gb}
                    estado={s.estado}
                    formato={tam}
                  />

                  {/* La lectura que importa: cómo termina el mes */}
                  <div className="mt-2 grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-xl bg-gray-50 dark:bg-gray-950 px-2 py-2">
                      <div className="text-[10px] text-gray-400">Ritmo actual</div>
                      <div className="text-sm font-semibold tabular-nums">{tam(s.promedio_diario_gb)}/día</div>
                    </div>
                    <div className="rounded-xl bg-gray-50 dark:bg-gray-950 px-2 py-2">
                      <div className="text-[10px] text-gray-400">Terminarás el mes en</div>
                      <div className="text-sm font-semibold tabular-nums">
                        {tam(s.proyeccion_gb)} <span className="text-gray-400 font-normal">({s.proyeccion_pct}%)</span>
                      </div>
                    </div>
                  </div>

                  {s.dia_agotamiento ? (
                    <div className="mt-2 text-xs rounded-xl px-3 py-2 text-red-700 bg-red-50 dark:bg-red-500/10 dark:text-red-400">
                      <b>▲ Se agota el día {s.dia_agotamiento}</b> del mes a este ritmo, y quedan {s.dias_restantes} días.
                      Las radios se cortarían hasta el corte de mes.
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-gray-400 text-center">
                      La aguja marca dónde terminará el mes al ritmo de los últimos 7 días.
                    </p>
                  )}
                </>
              ) : (
                <div className="py-6 text-center">
                  <div className="text-2xl font-bold tabular-nums">{tam(s.consumido_gb)}</div>
                  <p className="text-xs text-gray-400 mt-2 px-4">
                    Define el tope mensual de este servidor en <b>Servidores</b> para ver el medidor,
                    la proyección y recibir avisos antes de agotarlo.
                  </p>
                </div>
              )}

              {/* Ocupación del nodo. La banda dice cuánto TRÁFICO queda; esto,
                  cuántas CUENTAS caben. Un nodo puede ir sobrado de una cosa y
                  al límite de la otra, y son decisiones distintas. */}
              {pctOcup != null && (
                <div className="mt-3">
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-gray-400">{esVideo ? 'Canales alojados' : 'Radios alojadas'}</span>
                    <span className="tabular-nums font-medium">{s.radios} / {s.capacidad}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${pctOcup >= 100 ? 'bg-red-500' : pctOcup > 80 ? 'bg-amber-500' : esVideo ? 'bg-fuchsia-500' : 'bg-brand-500'}`}
                      style={{ width: pctOcup + '%' }}
                    />
                  </div>
                </div>
              )}

              <div className="text-[11px] text-gray-400 mt-3 mb-1">
                Consumo por día (GB) <span className="text-gray-300 dark:text-gray-600">· quedan {s.dias_restantes} días de mes</span>
              </div>
              <BarChart data={datosChart} height={110} unidad=" GB" />
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Estimado con oyentes × bitrate: cuenta el audio enviado, no el tráfico del panel ni
        las actualizaciones del servidor. Deja margen al definir el tope.
      </p>
    </div>
  );
}
