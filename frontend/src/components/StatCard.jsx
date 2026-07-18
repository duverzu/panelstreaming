export default function StatCard({ label, value, hint, icon: Icon, color = 'brand' }) {
  const tints = {
    brand: 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400',
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400',
  };
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</span>
        {Icon && (
          <span className={`w-9 h-9 grid place-items-center rounded-xl ${tints[color]}`}>
            <Icon width={18} height={18} />
          </span>
        )}
      </div>
      <div className="mt-3 text-3xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-400">{hint}</div>}
    </div>
  );
}
