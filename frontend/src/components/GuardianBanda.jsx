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
  riesgo:     { icono: '▲', texto: 'En riesgo',         clase: 'text-amber-800 bg-amber-100 dark:bg-amber-500/20 dark:text-amber-300' },
  critico:    { icono: '■', texto: 'Crítico',           clase: 'text-red-700 bg-red-50 dark:bg-red-500/10 dark:text-red-400' },
  'sin-tope': { icono: '–', texto: 'Sin tope definido', clase: 'text-gray-500 bg-gray-100 dark:bg-gray-800 dark:text-gray-400' },
};

/** Una cifra con su nombre. El número manda; el apunte va debajo, callado. */
function Dato({ etiqueta, valor, apunte }) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-950 px-3 py-2">
      <div className="text-[11px] text-gray-400 leading-tight">{etiqueta}</div>
      <div className="text-lg font-semibold leading-tight mt-0.5">{valor}</div>
      {apunte && <div className="text-[11px] text-gray-400 leading-tight">{apunte}</div>}
    </div>
  );
}

/** Cuántas cuentas caben en el nodo. La banda dice cuánto TRÁFICO queda; esto,
 *  cuántas CUENTAS. Un nodo puede ir sobrado de una cosa y al límite de la
 *  otra, y son decisiones distintas. */
function Ocupacion({ etiqueta, usados, total, pct, esVideo }) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-950 px-3 py-2">
      <div className="flex justify-between items-baseline">
        <span className="text-[11px] text-gray-400">{etiqueta}</span>
        <span className="text-sm font-semibold tabular-nums">{usados} <span className="text-gray-400 font-normal">/ {total}</span></span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-200/70 dark:bg-gray-800 overflow-hidden mt-1.5">
        <div
          className={`h-full rounded-full ${pct >= 100 ? 'bg-red-600' : pct > 80 ? 'bg-amber-600' : esVideo ? 'bg-fuchsia-500' : 'bg-brand-500'}`}
          style={{ width: pct + '%' }}
        />
      </div>
    </div>
  );
}

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

      {/* La rejilla sigue al número de nodos. Con dos, tres columnas dejaban
          un hueco y estrechaban las tarjetas justo cuando sobra sitio: la
          información de al lado del medidor necesita ancho para caber. */}
      <div className={`grid grid-cols-1 gap-5 ${servidores.length <= 2 ? 'lg:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
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
                  {/* Medidor y cifras EN LA MISMA FILA. Apilados, la tarjeta se
                      volvía una columna larga y había que bajar la vista para
                      saber si el número del medidor era bueno o malo. */}
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="shrink-0 w-full sm:w-[210px]">
                      <Gauge
                        valor={s.consumido_gb}
                        maximo={s.tope_gb}
                        proyeccion={s.proyeccion_gb}
                        estado={s.estado}
                        formato={tam}
                      />
                    </div>

                    {/* La lectura que importa: cómo termina el mes */}
                    <div className="flex-1 w-full space-y-2.5">
                      <Dato etiqueta="Ritmo actual" valor={`${tam(s.promedio_diario_gb)}/día`} />
                      <Dato
                        etiqueta="Terminarás el mes en"
                        valor={tam(s.proyeccion_gb)}
                        apunte={`${s.proyeccion_pct}% del tope`}
                      />
                      {pctOcup != null && (
                        <Ocupacion
                          etiqueta={esVideo ? 'Canales alojados' : 'Radios alojadas'}
                          usados={s.radios} total={s.capacidad} pct={pctOcup} esVideo={esVideo}
                        />
                      )}
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

              {/* Sin tope no hay medidor, pero la ocupación sí se puede ver. */}
              {!conTope && pctOcup != null && (
                <Ocupacion
                  etiqueta={esVideo ? 'Canales alojados' : 'Radios alojadas'}
                  usados={s.radios} total={s.capacidad} pct={pctOcup} esVideo={esVideo}
                />
              )}

              <div className="text-[11px] text-gray-400 mt-4 mb-1">
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
