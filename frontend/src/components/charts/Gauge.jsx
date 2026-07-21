/**
 * Gauge — medidor semicircular (tipo tablero de auto) para UNA razón contra un
 * límite: cuánta banda llevas del tope del mes.
 *
 * Dos datos en el mismo dibujo:
 *   · el arco relleno   = lo consumido HOY
 *   · la aguja punteada = dónde terminarás el mes al ritmo actual
 *
 * El color es de ESTADO (no de serie) y nunca va solo: siempre lo acompaña una
 * etiqueta con texto, para quien no distingue colores.
 *
 * props: valor, maximo, proyeccion (misma unidad), formato(v) -> string, estado
 */

// Paleta de estado (validada en claro y oscuro)
const COLOR = {
  ok: '#0ca30c',
  atencion: '#fab219',
  riesgo: '#ec835a',
  critico: '#d03b3b',
};

const R = 70;          // radio del arco
const GROSOR = 16;
const W = 200, H = 118;
const CX = W / 2, CY = 96;

/** Punto del arco para una fracción 0..1 (de izquierda a derecha). */
function punto(frac, radio = R) {
  const ang = Math.PI * (1 - Math.min(1, Math.max(0, frac)));
  return [CX + radio * Math.cos(ang), CY - radio * Math.sin(ang)];
}

function arco(desde, hasta, radio = R) {
  const [x1, y1] = punto(desde, radio);
  const [x2, y2] = punto(hasta, radio);
  const largo = hasta - desde > 0.5 ? 1 : 0;
  return `M ${x1} ${y1} A ${radio} ${radio} 0 ${largo} 1 ${x2} ${y2}`;
}

export default function Gauge({
  valor = 0, maximo = 0, proyeccion = null,
  formato = (v) => String(v), estado = 'ok', etiqueta = '',
}) {
  const frac = maximo > 0 ? Math.min(1, valor / maximo) : 0;
  const fracProy = maximo > 0 && proyeccion != null ? Math.min(1, proyeccion / maximo) : null;
  const color = COLOR[estado] || COLOR.ok;
  const pct = maximo > 0 ? Math.round((valor / maximo) * 100) : 0;

  const [px, py] = fracProy != null ? punto(fracProy, R + GROSOR / 2 + 3) : [0, 0];
  const [pxi, pyi] = fracProy != null ? punto(fracProy, R - GROSOR / 2 - 3) : [0, 0];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 240, display: 'block', margin: '0 auto' }}>
        {/* Pista: el 100% del tope */}
        <path d={arco(0, 1)} fill="none" strokeWidth={GROSOR} strokeLinecap="round"
          className="stroke-gray-100 dark:stroke-gray-800" />

        {/* Consumido */}
        {frac > 0 && (
          <path d={arco(0, frac)} fill="none" stroke={color} strokeWidth={GROSOR} strokeLinecap="round" />
        )}

        {/* Aguja de proyección a fin de mes */}
        {fracProy != null && (
          <g>
            <line x1={pxi} y1={pyi} x2={px} y2={py}
              className="stroke-gray-900 dark:stroke-gray-100" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx={px} cy={py} r="3" className="fill-gray-900 dark:fill-gray-100" />
          </g>
        )}

        {/* Extremos de la escala */}
        <text x="6" y={CY + 14} className="fill-gray-400" style={{ fontSize: 9 }}>0</text>
        <text x={W - 6} y={CY + 14} textAnchor="end" className="fill-gray-400" style={{ fontSize: 9 }}>
          {formato(maximo)}
        </text>
      </svg>

      {/* Cifra principal, dentro del arco */}
      <div className="absolute inset-x-0" style={{ top: '46%' }}>
        <div className="text-center">
          <div className="text-2xl font-bold tabular-nums leading-none">{pct}%</div>
          <div className="text-[11px] text-gray-400 mt-1">{formato(valor)}</div>
        </div>
      </div>

      {etiqueta && <div className="text-center text-xs text-gray-400 mt-1">{etiqueta}</div>}
    </div>
  );
}

export { COLOR as COLOR_ESTADO };
