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

/** Nombre a la izquierda, cifra a la derecha. Para datos que se leen de reojo. */
function Linea({ etiqueta, valor }) {
  return (
    <div className="flex justify-between items-baseline text-xs gap-2">
      <span className="text-gray-400 truncate">{etiqueta}</span>
      <span className="font-semibold shrink-0">{valor}</span>
    </div>
  );
}

/** Bytes a la unidad que se lee mejor. */
function peso(b) {
  const n = Number(b) || 0;
  if (n >= 1099511627776) return (n / 1099511627776).toFixed(1) + ' TB';
  if (n >= 1073741824) return (n / 1073741824).toFixed(n >= 10737418240 ? 0 : 1) + ' GB';
  return Math.round(n / 1048576) + ' MB';
}

/** Barra con umbral: verde tranquilo, ámbar mírame, rojo actúa. */
function Barra({ etiqueta, detalle, pct, aviso = 75, critico = 90 }) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const color = p >= critico ? 'bg-red-600' : p >= aviso ? 'bg-amber-600' : 'bg-brand-500';
  return (
    <div>
      <div className="flex justify-between items-baseline text-xs mb-1 gap-2">
        <span className="text-gray-400 truncate">{etiqueta}</span>
        <span className="font-semibold shrink-0">{detalle}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: p + '%' }} />
      </div>
    </div>
  );
}

/** Cómo está la máquina del nodo por dentro. Solo la reportan los nodos con
 *  agente propio; los demás enseñan lo que sí se sabe de ellos. */
function Maquina({ salud, ocupacion }) {
  const tiempo = (s) => {
    const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600);
    return d ? `${d} d ${h} h` : `${h} h`;
  };
  const svc = salud?.servicios || {};
  const caidos = Object.entries(svc).filter(([, ok]) => !ok).map(([k]) => k);

  return (
    <div className="space-y-3">
      {caidos.length > 0 && (
        <div className="text-xs rounded-xl bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 px-3 py-2">
          <b>{caidos.join(' y ')}</b> {caidos.length > 1 ? 'están caídos' : 'está caído'}
        </div>
      )}

      {salud?.responde ? (
        <>
          <Barra
            etiqueta={`Disco · ${peso(salud.disco?.total_bytes)}`}
            detalle={`quedan ${peso(salud.disco?.libre_bytes)}`}
            pct={salud.disco?.usado_pct} aviso={80} critico={92}
          />
          <Barra
            etiqueta={`CPU · ${salud.cpu?.nucleos || '?'} cores`}
            detalle={`${salud.cpu?.usado_pct ?? '—'}%`}
            pct={salud.cpu?.usado_pct} aviso={70} critico={85}
          />
          {salud.cpu?.robado_pct >= 5 && (
            <div className="text-[11px] text-amber-600 dark:text-amber-400 -mt-1.5">
              +{salud.cpu.robado_pct}% que se lleva el vecino (CPU robado)
            </div>
          )}
          <Barra
            etiqueta={`Memoria · ${peso(salud.memoria?.total_bytes)}`}
            detalle={`${peso(salud.memoria?.usado_bytes)} · ${salud.memoria?.usado_pct ?? '—'}%`}
            pct={salud.memoria?.usado_pct} aviso={80} critico={90}
          />
        </>
      ) : (
        <p className="text-xs text-gray-400">
          Este nodo no reporta el estado de su máquina. Se ve su tráfico, pero no su
          disco ni su CPU.
        </p>
      )}

      {ocupacion && (
        <Barra
          etiqueta={ocupacion.etiqueta}
          detalle={`${ocupacion.usados} / ${ocupacion.total}`}
          pct={ocupacion.pct} aviso={80} critico={100}
        />
      )}

      {/* Apilados, no en una fila: en la columna estrecha de la tarjeta los dos
          juntos se partían por la mitad y quedaba un "29 d / 4 h". */}
      {salud?.responde && (
        <div className="text-[11px] text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-800 space-y-0.5">
          <div>Encendido hace {tiempo(salud.uptime_s || 0)}</div>
          {Array.isArray(salud.cpu?.carga) && salud.cpu.carga.length === 3 && (
            <div>
              Carga {salud.cpu.carga.map((x) => Number(x).toFixed(2)).join(' · ')}
              <span className="text-gray-300 dark:text-gray-600"> sobre {salud.cpu.nucleos} cores</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function GuardianBanda() {
  const [servidores, setServidores] = useState([]);
  const [cargado, setCargado] = useState(false);
  // La salud de la máquina se pedía en otra tarjeta, más abajo. Es del MISMO
  // nodo: la banda dice cuánto tráfico le queda y esto si la máquina aguanta.
  // Separadas obligaban a cruzar dos sitios para responder una sola pregunta.
  const [salud, setSalud] = useState({});

  useEffect(() => {
    let alive = true;
    const load = () => {
      apiFetch('/admin/banda').then((d) => alive && (setServidores(d.servidores), setCargado(true))).catch(() => {});
      apiFetch('/admin/nodos-video/salud')
        .then((d) => alive && setSalud(Object.fromEntries((d.nodos || []).map((n) => [n.id, n]))))
        .catch(() => {});
    };
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
                  <div className="flex flex-col sm:flex-row items-center gap-5">
                    <div className="shrink-0 w-full sm:w-[220px]">
                      <Gauge
                        valor={s.consumido_gb}
                        maximo={s.tope_gb}
                        proyeccion={s.proyeccion_gb}
                        formato={tam}
                      />
                      <div className="mt-3 space-y-1.5">
                        <Linea etiqueta="Ritmo actual" valor={`${tam(s.promedio_diario_gb)}/día`} />
                        <Linea etiqueta="Fin de mes" valor={`${tam(s.proyeccion_gb)} · ${s.proyeccion_pct}%`} />
                      </div>
                    </div>

                    {/* La máquina por dentro, al lado del reloj */}
                    <div className="flex-1 w-full min-w-0">
                      <Maquina
                        salud={salud[s.id]}
                        ocupacion={pctOcup != null ? {
                          etiqueta: esVideo ? 'Canales alojados' : 'Radios alojadas',
                          usados: s.radios, total: s.capacidad, pct: pctOcup, esVideo,
                        } : null}
                      />
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
                <Barra
                  etiqueta={esVideo ? 'Canales alojados' : 'Radios alojadas'}
                  detalle={`${s.radios} / ${s.capacidad}`}
                  pct={pctOcup} aviso={80} critico={100}
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
