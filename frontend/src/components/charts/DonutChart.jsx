import { useState } from 'react';

/**
 * DonutChart (SVG, sin librerías). Segmentos con separación de 2px, centro con
 * total, leyenda con valores, y hover que resalta el segmento.
 * props: data = [{ label, valor, color }], size, thickness, centro (texto)
 */
export default function DonutChart({ data = [], size = 168, thickness = 22, centro = 'Total' }) {
  const [hover, setHover] = useState(null);
  const total = data.reduce((a, d) => a + d.valor, 0);
  const R = (size - thickness) / 2;
  const C = 2 * Math.PI * R;
  const gap = total > 0 ? 6 : 0; // separación (en unidades de circunferencia) entre segmentos

  let acumulado = 0;
  const segmentos = data.map((d) => {
    const frac = total > 0 ? d.valor / total : 0;
    const largo = Math.max(0, frac * C - gap);
    const seg = { ...d, dash: largo, offset: -acumulado };
    acumulado += frac * C;
    return seg;
  });

  const activo = hover != null ? data[hover] : null;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={R} fill="none" strokeWidth={thickness} className="stroke-gray-100 dark:stroke-gray-800" />
          {segmentos.map((s, i) => (
            <circle key={i} cx={size / 2} cy={size / 2} r={R} fill="none"
              stroke={s.color} strokeWidth={thickness}
              strokeDasharray={`${s.dash} ${C - s.dash}`} strokeDashoffset={s.offset}
              strokeLinecap="round"
              className="transition-opacity cursor-pointer"
              style={{ opacity: hover == null || hover === i ? 1 : 0.35 }}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          ))}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-2xl font-bold tabular-nums">{activo ? activo.valor : total}</div>
            <div className="text-[11px] text-gray-400">{activo ? activo.label : centro}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 w-full space-y-2">
        {data.map((d, i) => (
          <div key={i} className={`flex items-center gap-2.5 text-sm rounded-lg px-2 py-1 transition ${hover === i ? 'bg-gray-50 dark:bg-gray-800/60' : ''}`}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="flex-1 text-gray-600 dark:text-gray-300 truncate">{d.label}</span>
            <span className="font-semibold tabular-nums">{d.valor}</span>
            <span className="text-xs text-gray-400 w-10 text-right">{total > 0 ? Math.round((d.valor / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
