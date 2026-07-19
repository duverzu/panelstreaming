import { useRef, useState, useId } from 'react';

/**
 * AreaChart (SVG). Línea de 2px + relleno degradado, grid tenue, hover con
 * crosshair y tooltip. props: data = [{ label, valor }], color, height, unidad
 */
export default function AreaChart({ data = [], color = '#10b981', height = 200, unidad = '' }) {
  const ref = useRef(null);
  const [hi, setHi] = useState(null);
  const gid = useId().replace(/:/g, '');

  const W = 640;
  const H = height;
  const padX = 8, padY = 16;
  const conDatos = data.some((d) => d.valor > 0);

  if (!data.length || !conDatos) {
    return <div className="grid place-items-center text-sm text-gray-400" style={{ height }}>Sin datos aún</div>;
  }

  const max = Math.max(1, ...data.map((d) => d.valor));
  const x = (i) => padX + (i / Math.max(1, data.length - 1)) * (W - padX * 2);
  const y = (v) => padY + (1 - v / max) * (H - padY * 2);

  const pts = data.map((d, i) => [x(i), y(d.valor)]);
  const linePath = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const areaPath = `${linePath} L ${x(data.length - 1)} ${H - padY} L ${x(0)} ${H - padY} Z`;

  function onMove(e) {
    const rect = ref.current.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * W;
    let idx = Math.round(((rel - padX) / (W - padX * 2)) * (data.length - 1));
    idx = Math.max(0, Math.min(data.length - 1, idx));
    setHi(idx);
  }

  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" height={height} preserveAspectRatio="none"
        onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
        <defs>
          <linearGradient id={`ar${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* grid tenue */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={padX} x2={W - padX} y1={padY + f * (H - padY * 2)} y2={padY + f * (H - padY * 2)}
            className="stroke-gray-100 dark:stroke-gray-800" strokeWidth="1" />
        ))}
        <path d={areaPath} fill={`url(#ar${gid})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hi != null && (
          <>
            <line x1={x(hi)} x2={x(hi)} y1={padY} y2={H - padY} stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
            <circle cx={x(hi)} cy={y(data[hi].valor)} r="4" fill={color} stroke="white" strokeWidth="2" />
          </>
        )}
      </svg>
      {hi != null && (
        <div className="absolute -top-1 px-2 py-1 rounded-lg bg-gray-900 text-white text-xs pointer-events-none whitespace-nowrap"
          style={{ left: `calc(${(x(hi) / W) * 100}% )`, transform: 'translate(-50%,-100%)' }}>
          {data[hi].label}: <b>{data[hi].valor}{unidad}</b>
        </div>
      )}
      <div className="flex justify-between mt-1 text-[10px] text-gray-400">
        {data.filter((_, i) => i % Math.ceil(data.length / 7) === 0).map((d, i) => <span key={i}>{d.label}</span>)}
      </div>
    </div>
  );
}
