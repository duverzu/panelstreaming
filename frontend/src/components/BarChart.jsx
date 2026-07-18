/**
 * BarChart — barras verticales simples (sin librerías).
 * props: data = [{ label, valor }], height, unidad
 */
export default function BarChart({ data = [], height = 160, unidad = '' }) {
  if (!data.length) {
    return <div className="grid place-items-center text-sm text-gray-400" style={{ height }}>Sin datos aún</div>;
  }
  const max = Math.max(1, ...data.map((d) => d.valor));
  const conDatos = data.some((d) => d.valor > 0);

  if (!conDatos) {
    return <div className="grid place-items-center text-sm text-gray-400" style={{ height }}>Sin oyentes registrados todavía</div>;
  }

  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex-1 min-w-0 flex flex-col items-center justify-end group h-full">
          <div className="relative w-full flex items-end justify-center h-full">
            <div
              className="w-full max-w-[26px] rounded-t bg-brand-500/80 hover:bg-brand-500 transition-all"
              style={{ height: `${(d.valor / max) * 100}%` }}
              title={`${d.valor}${unidad}`}
            />
          </div>
          <span className="mt-1 text-[9px] text-gray-400 truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
