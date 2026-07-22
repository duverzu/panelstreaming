import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PlanesManager from '../../components/PlanesManager';
import PlanesResellerManager from '../../components/PlanesResellerManager';

export default function AdminPlanes() {
  const [searchParams] = useSearchParams();
  const tipo = searchParams.get('tipo') === 'video' ? 'video' : 'audio';
  const esVideo = tipo === 'video';
  const [tab, setTab] = useState('planes');

  // En video solo hay planes de canal; en audio, además, paquetes de revendedor.
  const TABS = esVideo
    ? [{ id: 'planes', label: '🎬 Planes de video', hint: 'Plantilla de un canal (resolución, espacio, 24/7)' }]
    : [
        { id: 'planes', label: '📻 Planes de radio', hint: 'Plantilla de UNA estación (bitrate, oyentes, espacio)' },
        { id: 'reseller', label: '🏪 Paquetes de revendedor', hint: 'Cupo total que puede vender un mayorista' },
      ];

  const mostrarReseller = !esVideo && tab === 'reseller';

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

      {mostrarReseller ? <PlanesResellerManager /> : <PlanesManager base="/admin" filtroTipo={tipo} />}
    </div>
  );
}
