import { useState } from 'react';
import PlanesManager from '../../components/PlanesManager';
import PlanesResellerManager from '../../components/PlanesResellerManager';

const TABS = [
  { id: 'radio', label: '📻 Planes de radio', hint: 'Plantilla de UNA estación (bitrate, oyentes, espacio)' },
  { id: 'reseller', label: '🏪 Paquetes de revendedor', hint: 'Cupo total que puede vender un mayorista' },
];

export default function AdminPlanes() {
  const [tab, setTab] = useState('radio');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            title={t.hint}
            className={`text-sm px-3.5 py-2 rounded-xl border transition ${
              tab === t.id
                ? 'border-brand-500 text-brand-600 bg-brand-50 dark:bg-brand-500/10 dark:text-brand-400'
                : 'border-gray-200 dark:border-gray-800 text-gray-500 hover:border-brand-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'radio' ? <PlanesManager base="/admin" /> : <PlanesResellerManager />}
    </div>
  );
}
