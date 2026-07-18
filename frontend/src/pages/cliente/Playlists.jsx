import { useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import Modal from '../../components/Modal';
import { IconPlaylist, IconMusic, IconTrash, IconPlus } from '../../icons';

const DIAS = [
  { n: 1, l: 'Lun' }, { n: 2, l: 'Mar' }, { n: 3, l: 'Mié' }, { n: 4, l: 'Jue' },
  { n: 5, l: 'Vie' }, { n: 6, l: 'Sáb' }, { n: 7, l: 'Dom' },
];

const TIPOS = [
  { id: 'general', titulo: 'Música general', desc: 'Rotación normal del AutoDJ', icon: '🎵' },
  { id: 'jingle', titulo: 'Jingle / Spot', desc: 'Suena cada X canciones', icon: '📢' },
  { id: 'programa', titulo: 'Programa por horario', desc: 'Suena en días y horas específicas', icon: '🗓️' },
];

const BADGE = {
  general: { txt: 'Música', cls: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400' },
  jingle: { txt: 'Jingle/Spot', cls: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400' },
  programa: { txt: 'Programado', cls: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
};

export default function ClientePlaylists() {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [f, setF] = useState({ nombre: '', tipo: 'general', cada_canciones: 4, dias: [1, 2, 3, 4, 5], hora_inicio: '09:00', hora_fin: '11:00' });

  async function cargar() {
    setLoading(true);
    try {
      const { playlists } = await apiFetch('/cliente/playlists');
      setPlaylists(playlists);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { cargar(); }, []);

  function toggleDia(n) {
    setF((s) => ({ ...s, dias: s.dias.includes(n) ? s.dias.filter((d) => d !== n) : [...s.dias, n] }));
  }

  async function crear(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await apiFetch('/cliente/playlists', { method: 'POST', body: JSON.stringify(f) });
      setOpen(false);
      setF({ nombre: '', tipo: 'general', cada_canciones: 4, dias: [1, 2, 3, 4, 5], hora_inicio: '09:00', hora_fin: '11:00' });
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActiva(p) {
    try { await apiFetch('/cliente/playlists/' + p.id, { method: 'PUT', body: JSON.stringify({ activa: !p.activa }) }); cargar(); }
    catch (e) { alert(e.message); }
  }

  async function eliminar(p) {
    if (!confirm(`¿Eliminar la playlist "${p.nombre}"?`)) return;
    try { await apiFetch('/cliente/playlists/' + p.id, { method: 'DELETE' }); cargar(); }
    catch (e) { alert(e.message); }
  }

  const nombreDias = (arr) => arr.map((n) => DIAS.find((d) => d.n === n)?.l).join(' ');

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2">
            <IconPlaylist width={18} height={18} /> Mis playlists <span className="text-gray-400 font-normal">({playlists.length})</span>
          </h2>
          <button onClick={() => { setError(null); setOpen(true); }} className="btn-primary !py-2 !px-3 text-xs">
            <IconPlus width={15} height={15} /> Crear playlist
          </button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-gray-400">Cargando…</p>
        ) : playlists.length === 0 ? (
          <p className="py-8 text-center text-gray-400">Aún no tienes playlists. ¡Crea la primera!</p>
        ) : (
          <div className="space-y-2.5">
            {playlists.map((p) => {
              const b = BADGE[p.tipo];
              return (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                  <div className="w-9 h-9 shrink-0 rounded-lg bg-gray-100 dark:bg-gray-800 grid place-items-center text-gray-400">
                    <IconMusic width={16} height={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{p.nombre}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${b.cls}`}>{b.txt}</span>
                    </div>
                    <div className="text-xs text-gray-400 truncate">
                      {p.tipo === 'jingle' && `Cada ${p.cada_canciones} canciones`}
                      {p.tipo === 'programa' && p.horario[0] && `${nombreDias(p.horario[0].dias)} · ${p.horario[0].inicio}–${p.horario[0].fin}`}
                      {p.tipo === 'general' && 'Rotación general del AutoDJ'}
                    </div>
                  </div>
                  <button onClick={() => toggleActiva(p)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition ${p.activa
                      ? 'border-brand-500 text-brand-600'
                      : 'border-gray-200 dark:border-gray-800 text-gray-400'}`}>
                    {p.activa ? 'Activa' : 'Pausada'}
                  </button>
                  <button onClick={() => eliminar(p)} title="Eliminar"
                    className="w-8 h-8 shrink-0 grid place-items-center rounded-lg border border-gray-200 dark:border-gray-800 hover:border-red-400 hover:text-red-500 transition">
                    <IconTrash width={15} height={15} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal crear playlist */}
      <Modal open={open} onClose={() => setOpen(false)} title="Crear playlist">
        <form onSubmit={crear} className="space-y-4">
          <div>
            <label className="label">Nombre</label>
            <input className="input" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej: Éxitos, Spots, Mañanas" required />
          </div>

          <div>
            <label className="label">Tipo</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {TIPOS.map((t) => (
                <button type="button" key={t.id} onClick={() => setF({ ...f, tipo: t.id })}
                  className={`text-left p-3 rounded-xl border transition ${f.tipo === t.id
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300'}`}>
                  <div className="text-lg">{t.icon}</div>
                  <div className="text-sm font-medium mt-1">{t.titulo}</div>
                  <div className="text-[11px] text-gray-400">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {f.tipo === 'jingle' && (
            <div>
              <label className="label">Sonar cada cuántas canciones</label>
              <input className="input" type="number" min="1" value={f.cada_canciones}
                onChange={(e) => setF({ ...f, cada_canciones: Number(e.target.value) })} />
            </div>
          )}

          {f.tipo === 'programa' && (
            <>
              <div>
                <label className="label">Días</label>
                <div className="flex flex-wrap gap-1.5">
                  {DIAS.map((d) => (
                    <button type="button" key={d.n} onClick={() => toggleDia(d.n)}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition ${f.dias.includes(d.n)
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400'
                        : 'border-gray-200 dark:border-gray-800 text-gray-500'}`}>
                      {d.l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Hora inicio</label>
                  <input className="input" type="time" value={f.hora_inicio} onChange={(e) => setF({ ...f, hora_inicio: e.target.value })} />
                </div>
                <div>
                  <label className="label">Hora fin</label>
                  <input className="input" type="time" value={f.hora_fin} onChange={(e) => setF({ ...f, hora_fin: e.target.value })} />
                </div>
              </div>
            </>
          )}

          {error && <div className="text-sm rounded-xl px-3 py-2 text-red-600 bg-red-50 dark:bg-red-500/10">{error}</div>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost flex-1">Cancelar</button>
            <button className="btn-primary flex-1" disabled={saving}>{saving ? 'Creando…' : 'Crear playlist'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
