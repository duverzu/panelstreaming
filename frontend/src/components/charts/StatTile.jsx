/**
 * StatTile — tarjeta KPI. Variante sólida con acento de color o con gradiente.
 * props: label, value, hint, icon, color (brand|blue|violet|amber|rose), gradient
 */
const TINTS = {
  brand: { soft: 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400', grad: 'from-brand-500 to-emerald-600' },
  blue: { soft: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400', grad: 'from-blue-500 to-indigo-600' },
  violet: { soft: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400', grad: 'from-violet-500 to-purple-600' },
  amber: { soft: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400', grad: 'from-amber-500 to-orange-600' },
  rose: { soft: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400', grad: 'from-rose-500 to-pink-600' },
};

export default function StatTile({ label, value, hint, icon: Icon, color = 'brand', gradient = false }) {
  const t = TINTS[color] || TINTS.brand;

  if (gradient) {
    return (
      <div className={`rounded-2xl p-5 bg-gradient-to-br ${t.grad} text-white shadow-sm`}>
        <div className="flex items-start justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-white/80">{label}</span>
          {Icon && <span className="w-9 h-9 grid place-items-center rounded-xl bg-white/20"><Icon width={18} height={18} /></span>}
        </div>
        <div className="mt-3 text-3xl font-bold tabular-nums">{value}</div>
        {hint && <div className="mt-1 text-xs text-white/80">{hint}</div>}
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</span>
        {Icon && <span className={`w-9 h-9 grid place-items-center rounded-xl ${t.soft}`}><Icon width={18} height={18} /></span>}
      </div>
      <div className="mt-3 text-3xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-400">{hint}</div>}
    </div>
  );
}
