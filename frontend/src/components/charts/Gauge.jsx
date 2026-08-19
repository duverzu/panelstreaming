/**
 * Gauge — reloj de aguja para UNA razón contra un límite: cuánta banda llevas
 * del tope del mes.
 *
 * Tres datos en el mismo dibujo:
 *   · las ZONAS del arco = dónde están los umbrales (50% vigilar, 90% crítico)
 *   · la AGUJA           = dónde vas hoy
 *   · la MARCA del borde = dónde terminarás el mes al ritmo actual
 *
 * Las zonas no son un arcoíris decorativo: son exactamente los cortes con los
 * que el panel decide el estado, así que el color del tramo donde cae la aguja
 * y la etiqueta de estado dicen siempre lo mismo.
 *
 * El color nunca va solo — quien no distingue verde de ámbar lee la posición
 * de la aguja y la etiqueta de texto que acompaña a la tarjeta.
 *
 * props: valor, maximo, proyeccion (misma unidad), formato(v) -> string
 */

// Paleta de estado, validada en claro y en oscuro (scripts/validate_palette):
// banda de luminosidad, croma, suelo de visión normal y contraste, todo OK.
// Verde y ámbar seguirán chocando bajo daltonismo: eso no lo arregla ningún
// color, y es para lo que existe la etiqueta de texto.
const VERDE = '#0ca30c';
const AMBAR = '#d97706';
const ROJO = '#c62828';

// Los mismos cortes que usa el backend para decidir el estado.
const CORTE_VIGILAR = 0.5;
const CORTE_CRITICO = 0.9;

const W = 200, H = 124;
const CX = 100, CY = 104, R = 76, GROSOR = 12;
const ANG0 = 200, BARRIDO = 220;    // arranca abajo-izquierda y barre por arriba

const rad = (g) => (g * Math.PI) / 180;

/** Punto del arco para una fracción 0..1. */
function punto(frac, radio = R) {
  const f = Math.min(1, Math.max(0, frac));
  const a = rad(ANG0 - BARRIDO * f);
  return [CX + radio * Math.cos(a), CY - radio * Math.sin(a)];
}

function arco(desde, hasta, radio = R) {
  const [x1, y1] = punto(desde, radio);
  const [x2, y2] = punto(hasta, radio);
  const largo = (hasta - desde) * BARRIDO > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${radio} ${radio} 0 ${largo} 1 ${x2} ${y2}`;
}

export default function Gauge({ valor = 0, maximo = 0, proyeccion = null, formato = (v) => String(v) }) {
  if (!(maximo > 0)) return null;

  const frac = Math.min(1, valor / maximo);
  const fracProy = proyeccion != null ? Math.min(1, proyeccion / maximo) : null;
  const pct = Math.round((valor / maximo) * 100);

  const [nx, ny] = punto(frac, R - GROSOR / 2 - 9);
  const [pa, pb] = fracProy != null ? punto(fracProy, R - GROSOR / 2 - 4) : [0, 0];
  const [pc, pd] = fracProy != null ? punto(fracProy, R + GROSOR / 2 + 4) : [0, 0];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 220, display: 'block', margin: '0 auto' }}>
        <path d={arco(0, CORTE_VIGILAR)} fill="none" stroke={VERDE} strokeWidth={GROSOR} strokeLinecap="round" />
        <path d={arco(CORTE_VIGILAR, CORTE_CRITICO)} fill="none" stroke={AMBAR} strokeWidth={GROSOR} />
        <path d={arco(CORTE_CRITICO, 1)} fill="none" stroke={ROJO} strokeWidth={GROSOR} strokeLinecap="round" />

        {/* Separadores entre zonas, del color del fondo */}
        {[CORTE_VIGILAR, CORTE_CRITICO].map((t) => {
          const [ax, ay] = punto(t, R - GROSOR / 2);
          const [bx, by] = punto(t, R + GROSOR / 2);
          return <line key={t} x1={ax} y1={ay} x2={bx} y2={by}
            className="stroke-white dark:stroke-gray-900" strokeWidth="2" />;
        })}

        {/* Dónde terminará el mes. Cruza el arco con un contorno del color del
            fondo para no perderse sobre el tramo de color. */}
        {fracProy != null && (
          <>
            <line x1={pa} y1={pb} x2={pc} y2={pd} className="stroke-white dark:stroke-gray-900" strokeWidth="6" strokeLinecap="round" />
            <line x1={pa} y1={pb} x2={pc} y2={pd} className="stroke-gray-900 dark:stroke-gray-100" strokeWidth="2.5" strokeLinecap="round" />
          </>
        )}

        {/* La aguja: dónde vas hoy */}
        <line x1={CX} y1={CY} x2={nx} y2={ny} className="stroke-white dark:stroke-gray-900" strokeWidth="6.5" strokeLinecap="round" />
        <line x1={CX} y1={CY} x2={nx} y2={ny} className="stroke-gray-900 dark:stroke-gray-100" strokeWidth="3" strokeLinecap="round" />
        <circle cx={CX} cy={CY} r="6.5" className="fill-white dark:fill-gray-900 stroke-gray-900 dark:stroke-gray-100" strokeWidth="2.5" />
      </svg>

      <div className="text-center -mt-1">
        {/* Sin tabular-nums: ese ajuste da a cada dígito el ancho de un cero y a
            este tamaño un "30%" se ve suelto. Se reserva para columnas. */}
        <div className="text-2xl font-bold leading-none">{pct}%</div>
        <div className="text-[11px] text-gray-400 mt-1">{formato(valor)} de {formato(maximo)}</div>
      </div>
    </div>
  );
}
