import { useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import { IconSliders } from '../../icons';

const CROSSFADE = [
  { id: 'normal', titulo: 'Normal', desc: 'Mezcla suave entre canciones' },
  { id: 'smart', titulo: 'Inteligente', desc: 'Ajusta la mezcla según el volumen' },
  { id: 'none', titulo: 'Sin mezcla', desc: 'Corte seco (una termina, empieza otra)' },
];

export default function ClienteAutoDJ() {
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    apiFetch('/cliente/autodj').then((d) => setF(d.autodj)).catch(() => setF(null));
  }, []);

  async function guardar(e) {
    e.preventDefault();
    setSaving(true); setMsg(null);
    try {
      await apiFetch('/cliente/autodj', { method: 'PUT', body: JSON.stringify(f) });
      setMsg({ type: 'ok', text: '✅ AutoDJ actualizado' });
    } catch (err) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  if (f === null) return <p className="py-10 text-center text-gray-400">Cargando…</p>;

  return (
    <form onSubmit={guardar} className="max-w-2xl space-y-6">
      <div className="card p-5 space-y-5">
        <h2 className="font-semibold flex items-center gap-2"><IconSliders width={18} height={18} /> Transiciones (crossfade)</h2>

        <div>
          <label className="label">Tipo de mezcla entre canciones</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {CROSSFADE.map((c) => (
              <button type="button" key={c.id} onClick={() => setF({ ...f, crossfade_tipo: c.id })}
                className={`text-left p-3 rounded-xl border transition ${f.crossfade_tipo === c.id ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10' : 'border-gray-200 dark:border-gray-800 hover:border-gray-300'}`}>
                <div className="text-sm font-medium">{c.titulo}</div>
                <div className="text-[11px] text-gray-400">{c.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Duración de la mezcla (segundos)</label>
            <input className="input" type="number" min="0" max="30" step="0.5"
              value={f.crossfade_seg} onChange={(e) => setF({ ...f, crossfade_seg: Number(e.target.value) })}
              disabled={f.crossfade_tipo === 'none'} />
          </div>
          <div>
            <label className="label">Evitar repetir canción (minutos)</label>
            <input className="input" type="number" min="0" max="240"
              value={f.evitar_repetir_min} onChange={(e) => setF({ ...f, evitar_repetir_min: Number(e.target.value) })} />
          </div>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <h2 className="font-semibold">Cola de reproducción</h2>
        <div>
          <label className="label">Canciones preparadas por adelantado</label>
          <input className="input max-w-[200px]" type="number" min="1" max="15"
            value={f.cola} onChange={(e) => setF({ ...f, cola: Number(e.target.value) })} />
          <p className="text-xs text-gray-400 mt-1.5">AzuraCast prepara esta cantidad de canciones por adelantado en la cola.</p>
        </div>
      </div>

      {msg && (
        <div className={`text-sm rounded-xl px-3 py-2 ${msg.type === 'ok' ? 'text-brand-700 bg-brand-50 dark:bg-brand-500/10 dark:text-brand-400' : 'text-red-600 bg-red-50 dark:bg-red-500/10'}`}>{msg.text}</div>
      )}
      <button className="btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
    </form>
  );
}
