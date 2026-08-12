import { useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import Modal from '../../components/Modal';
import { IconPlaylist, IconMusic, IconTrash, IconPlus } from '../../icons';

/** Icono de lápiz (renombrar), inline. */
function IconLapiz({ width = 14, height = 14, className = '' }) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

const DIAS = [
  { n: 1, l: 'Lun' }, { n: 2, l: 'Mar' }, { n: 3, l: 'Mié' }, { n: 4, l: 'Jue' },
  { n: 5, l: 'Vie' }, { n: 6, l: 'Sáb' }, { n: 7, l: 'Dom' },
];

const TIPOS = [
  { id: 'general', titulo: 'Música general', desc: 'Rotación normal', icon: '🎵' },
  { id: 'jingle', titulo: 'Jingle / Spot', desc: 'Cada X canciones', icon: '📢' },
  { id: 'programa', titulo: 'Programa', desc: 'Días y horas fijas', icon: '🗓️' },
];

const BADGE = {
  general: { txt: 'Música', cls: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400' },
  jingle: { txt: 'Jingle/Spot', cls: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400' },
  programa: { txt: 'Programado', cls: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
  sistema: { txt: 'Automática', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
};

const VACIO = { nombre: '', tipo: 'general', orden: 'aleatorio', cada_canciones: 4, dias: [1, 2, 3, 4, 5], hora_inicio: '09:00', hora_fin: '11:00' };

export default function ClientePlaylists() {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null); // null = crear
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [f, setF] = useState(VACIO);
  const [media, setMedia] = useState([]);
  const [expandida, setExpandida] = useState(null);   // playlist id abierta (ver canciones)
  const [addTo, setAddTo] = useState(null);           // playlist a la que se agregan canciones
  const [addSel, setAddSel] = useState([]);           // ids seleccionados para agregar
  const [busyMedia, setBusyMedia] = useState(false);
  const [renombrar, setRenombrar] = useState(null);   // canción a renombrar
  const [renForm, setRenForm] = useState({ titulo: '', artista: '' });

  async function cargar() {
    setLoading(true);
    try {
      const [{ playlists }, m] = await Promise.all([apiFetch('/cliente/playlists'), apiFetch('/cliente/media')]);
      setPlaylists(playlists);
      setMedia(m.media || []);
    } finally {
      setLoading(false);
    }
  }

  const cancionesDe = (plId) => media.filter((m) => (m.playlists || []).some((p) => p.id === plId));
  async function quitarCancion(plId, mediaId) {
    setBusyMedia(true);
    try { await apiFetch('/cliente/media/playlists-lote', { method: 'PUT', body: JSON.stringify({ media_ids: [mediaId], playlist_id: plId, accion: 'quitar' }) }); await cargar(); }
    catch (e) { alert(e.message); } finally { setBusyMedia(false); }
  }
  async function agregarCanciones() {
    if (!addSel.length) { setAddTo(null); return; }
    setBusyMedia(true);
    try { await apiFetch('/cliente/media/playlists-lote', { method: 'PUT', body: JSON.stringify({ media_ids: addSel, playlist_id: addTo, accion: 'agregar' }) }); setAddTo(null); setAddSel([]); await cargar(); }
    catch (e) { alert(e.message); } finally { setBusyMedia(false); }
  }
  function abrirRenombrar(m) { setRenombrar(m); setRenForm({ titulo: m.titulo || '', artista: m.artista || '' }); }
  async function guardarNombre() {
    setBusyMedia(true);
    try { await apiFetch(`/cliente/media/${renombrar.id}/nombre`, { method: 'PUT', body: JSON.stringify(renForm) }); setRenombrar(null); await cargar(); }
    catch (e) { alert(e.message); } finally { setBusyMedia(false); }
  }
  useEffect(() => { cargar(); }, []);

  function abrirCrear() {
    setEditId(null); setF(VACIO); setError(null); setOpen(true);
  }
  function abrirEditar(p) {
    setEditId(p.id);
    setF({
      nombre: p.nombre, tipo: p.tipo, orden: p.orden || 'aleatorio',
      cada_canciones: p.cada_canciones || 4,
      dias: p.dias?.length ? p.dias : [1, 2, 3, 4, 5],
      hora_inicio: p.hora_inicio || '09:00', hora_fin: p.hora_fin || '11:00',
    });
    setError(null); setOpen(true);
  }

  function toggleDia(n) {
    setF((s) => ({ ...s, dias: s.dias.includes(n) ? s.dias.filter((d) => d !== n) : [...s.dias, n] }));
  }

  async function guardar(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      if (editId) await apiFetch('/cliente/playlists/' + editId, { method: 'PUT', body: JSON.stringify(f) });
      else await apiFetch('/cliente/playlists', { method: 'POST', body: JSON.stringify(f) });
      setOpen(false);
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

  // Las playlists que crea el panel para el "da la hora" y las cuñas viven en la
  // misma lista de la radio, pero no son del cliente: si las ve mezcladas con las
  // suyas, no sabe cuáles puede tocar (y borrar una le apaga la función).
  // Las internas (la de pruebas del panel) no se muestran en absoluto.
  const mias = playlists.filter((p) => !p.sistema);
  const automaticas = playlists.filter((p) => p.sistema && p.sistema_clase !== 'interna');

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2">
            <IconPlaylist width={18} height={18} /> Mis playlists <span className="text-gray-400 font-normal">({mias.length})</span>
          </h2>
          <button onClick={abrirCrear} className="btn-primary !py-2 !px-3 text-xs">
            <IconPlus width={15} height={15} /> Crear playlist
          </button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-gray-400">Cargando…</p>
        ) : mias.length === 0 ? (
          <p className="py-8 text-center text-gray-400">Aún no tienes playlists. ¡Crea la primera!</p>
        ) : (
          <div className="space-y-2.5">
            {mias.map((p) => {
              const b = BADGE[p.tipo];
              const n = cancionesDe(p.id).length;
              const abierta = expandida === p.id;
              return (
                <div key={p.id} className="rounded-xl border border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-3 p-3">
                    <div className="w-9 h-9 shrink-0 rounded-lg bg-gray-100 dark:bg-gray-800 grid place-items-center text-gray-400">
                      <IconMusic width={16} height={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{p.nombre}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${b.cls}`}>{b.txt}</span>
                        <span className="text-[10px] text-gray-400">{p.orden === 'orden' ? '↕ en orden' : '🔀 aleatorio'}</span>
                      </div>
                      <div className="text-xs text-gray-400 truncate">
                        {p.tipo === 'jingle' && `Cada ${p.cada_canciones} canciones`}
                        {p.tipo === 'programa' && p.horario[0] && `${nombreDias(p.horario[0].dias)} · ${p.horario[0].inicio}–${p.horario[0].fin}`}
                        {p.tipo === 'general' && 'Rotación general del AutoDJ'}
                      </div>
                    </div>
                    <button onClick={() => setExpandida(abierta ? null : p.id)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition ${abierta ? 'border-brand-500 text-brand-600' : 'border-gray-200 dark:border-gray-800 hover:border-brand-500 hover:text-brand-600'}`}>
                      {abierta ? '▲ Ocultar' : `📂 Ver canciones (${n})`}
                    </button>
                    <button onClick={() => abrirEditar(p)} className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-brand-500 hover:text-brand-600 transition">Editar</button>
                    <button onClick={() => toggleActiva(p)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition ${p.activa ? 'border-brand-500 text-brand-600' : 'border-gray-200 dark:border-gray-800 text-gray-400'}`}>
                      {p.activa ? 'Activa' : 'Pausada'}
                    </button>
                    <button onClick={() => eliminar(p)} title="Eliminar"
                      className="w-8 h-8 shrink-0 grid place-items-center rounded-lg border border-gray-200 dark:border-gray-800 hover:border-red-400 hover:text-red-500 transition">
                      <IconTrash width={15} height={15} />
                    </button>
                  </div>

                  {abierta && (
                    <div className="border-t border-gray-100 dark:border-gray-800 p-3 bg-gray-50/60 dark:bg-gray-950/30 rounded-b-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-400">{n} canción(es) dentro</span>
                        <button onClick={() => { setAddTo(p.id); setAddSel([]); }} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">＋ Agregar canciones</button>
                      </div>
                      {n === 0 ? (
                        <p className="text-xs text-gray-400 py-2 text-center">Esta playlist está vacía. Agrega canciones de tu música.</p>
                      ) : (
                        <div className="space-y-1 max-h-64 overflow-y-auto">
                          {cancionesDe(p.id).map((m) => (
                            <div key={m.id} className="flex items-center gap-2 text-sm py-1">
                              <IconMusic width={13} height={13} className="text-gray-300 shrink-0" />
                              <span className="flex-1 min-w-0 truncate">{m.titulo}{m.artista ? <span className="text-gray-400"> · {m.artista}</span> : ''}</span>
                              <span className="text-[11px] text-gray-400 shrink-0">{m.duracion}</span>
                              <button onClick={() => abrirRenombrar(m)} disabled={busyMedia} title="Renombrar canción"
                                className="w-7 h-7 shrink-0 grid place-items-center rounded-lg border border-gray-200 dark:border-gray-800 hover:border-brand-500 hover:text-brand-600 disabled:opacity-40 transition">
                                <IconLapiz width={12} height={12} />
                              </button>
                              <button onClick={() => quitarCancion(p.id, m.id)} disabled={busyMedia} title="Quitar de esta playlist"
                                className="w-7 h-7 shrink-0 grid place-items-center rounded-lg border border-gray-200 dark:border-gray-800 hover:border-red-400 hover:text-red-500 disabled:opacity-40 transition">
                                <IconTrash width={12} height={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Playlists que mantiene el panel: se muestran para que el cliente sepa
          qué está sonando en su radio, pero en gris y sin controles — no son
          suyas y tocarlas romperia el "da la hora" o las cuñas. */}
      {!loading && automaticas.length > 0 && (
        <div className="card p-5 bg-gray-50/50 dark:bg-gray-950/20">
          <div className="mb-1 flex items-center gap-2">
            <h2 className="font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-2">
              ⚙️ Generadas por el panel <span className="font-normal text-gray-400">({automaticas.length})</span>
            </h2>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            Estas las crea y actualiza el panel solo. No hace falta que las toques: se
            configuran desde <strong>Da la hora</strong> y <strong>Cuñas</strong>.
          </p>

          <div className="space-y-2">
            {automaticas.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
                <div className="w-8 h-8 shrink-0 rounded-lg bg-gray-100 dark:bg-gray-800 grid place-items-center text-gray-400 text-sm">
                  {p.sistema_clase === 'hora' ? '⏰' : '📣'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500 dark:text-gray-400 truncate">{p.nombre}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${BADGE.sistema.cls}`}>{BADGE.sistema.txt}</span>
                    {!p.activa && <span className="text-[10px] text-amber-500">pausada</span>}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {p.cuando || (p.sistema_clase === 'hora' ? 'Anuncio de la hora' : 'Cuña programada')}
                  </div>
                </div>
                {p.sistema_donde && (
                  <span className="text-[11px] text-gray-400 shrink-0 hidden sm:inline">
                    se configura en «{p.sistema_donde}»
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal crear/editar */}
      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Editar playlist' : 'Crear playlist'}>
        <form onSubmit={guardar} className="space-y-4">
          <div>
            <label className="label">Nombre</label>
            <input className="input" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej: Éxitos, Spots, Mañanas" required />
          </div>

          <div>
            <label className="label">Tipo</label>
            <div className="grid grid-cols-3 gap-2">
              {TIPOS.map((t) => (
                <button type="button" key={t.id} onClick={() => setF({ ...f, tipo: t.id })}
                  className={`text-left p-2.5 rounded-xl border transition ${f.tipo === t.id ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10' : 'border-gray-200 dark:border-gray-800 hover:border-gray-300'}`}>
                  <div className="text-base">{t.icon}</div>
                  <div className="text-xs font-medium mt-0.5">{t.titulo}</div>
                  <div className="text-[10px] text-gray-400">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Orden de reproducción</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setF({ ...f, orden: 'aleatorio' })}
                className={`p-2.5 rounded-xl border text-sm transition ${f.orden === 'aleatorio' ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400' : 'border-gray-200 dark:border-gray-800 text-gray-500'}`}>🔀 Aleatorio</button>
              <button type="button" onClick={() => setF({ ...f, orden: 'orden' })}
                className={`p-2.5 rounded-xl border text-sm transition ${f.orden === 'orden' ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400' : 'border-gray-200 dark:border-gray-800 text-gray-500'}`}>↕ En orden</button>
            </div>
          </div>

          {f.tipo === 'jingle' && (
            <div>
              <label className="label">Sonar cada cuántas canciones</label>
              <input className="input" type="number" min="1" value={f.cada_canciones} onChange={(e) => setF({ ...f, cada_canciones: Number(e.target.value) })} />
            </div>
          )}

          {f.tipo === 'programa' && (
            <>
              <div>
                <label className="label">Días</label>
                <div className="flex flex-wrap gap-1.5">
                  {DIAS.map((d) => (
                    <button type="button" key={d.n} onClick={() => toggleDia(d.n)}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition ${f.dias.includes(d.n) ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400' : 'border-gray-200 dark:border-gray-800 text-gray-500'}`}>
                      {d.l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Hora inicio</label><input className="input" type="time" value={f.hora_inicio} onChange={(e) => setF({ ...f, hora_inicio: e.target.value })} /></div>
                <div><label className="label">Hora fin</label><input className="input" type="time" value={f.hora_fin} onChange={(e) => setF({ ...f, hora_fin: e.target.value })} /></div>
              </div>
            </>
          )}

          {error && <div className="text-sm rounded-xl px-3 py-2 text-red-600 bg-red-50 dark:bg-red-500/10">{error}</div>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost flex-1">Cancelar</button>
            <button className="btn-primary flex-1" disabled={saving}>{saving ? 'Guardando…' : editId ? 'Guardar cambios' : 'Crear playlist'}</button>
          </div>
        </form>
      </Modal>

      {/* Modal AGREGAR canciones a una playlist */}
      <Modal open={addTo !== null} onClose={() => setAddTo(null)} title="Agregar canciones a la playlist">
        <div className="space-y-3">
          {(() => {
            const disponibles = media.filter((m) => !(m.playlists || []).some((p) => p.id === addTo));
            if (!disponibles.length) return <p className="text-sm text-gray-400 py-4 text-center">Todas tus canciones ya están en esta playlist.</p>;
            return (
              <>
                <p className="text-xs text-gray-400">Marca las canciones que quieres agregar ({addSel.length} seleccionada{addSel.length === 1 ? '' : 's'}).</p>
                <div className="max-h-72 overflow-y-auto space-y-0.5 border border-gray-100 dark:border-gray-800 rounded-xl p-2">
                  {disponibles.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 text-sm py-1 px-1 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer">
                      <input type="checkbox" checked={addSel.includes(m.id)}
                        onChange={(e) => setAddSel((s) => e.target.checked ? [...s, m.id] : s.filter((x) => x !== m.id))} />
                      <span className="flex-1 min-w-0 truncate">{m.titulo}{m.artista ? <span className="text-gray-400"> · {m.artista}</span> : ''}</span>
                    </label>
                  ))}
                </div>
              </>
            );
          })()}
          <div className="flex gap-2 pt-1">
            <button onClick={() => setAddTo(null)} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={agregarCanciones} disabled={busyMedia || !addSel.length} className="btn-primary flex-1">
              {busyMedia ? 'Agregando…' : `Agregar${addSel.length ? ` (${addSel.length})` : ''}`}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal RENOMBRAR canción */}
      <Modal open={renombrar !== null} onClose={() => setRenombrar(null)} title="Renombrar canción">
        <div className="space-y-3">
          <div>
            <label className="label">Título</label>
            <input className="input" value={renForm.titulo} onChange={(e) => setRenForm({ ...renForm, titulo: e.target.value })} placeholder="Nombre de la canción" />
          </div>
          <div>
            <label className="label">Artista</label>
            <input className="input" value={renForm.artista} onChange={(e) => setRenForm({ ...renForm, artista: e.target.value })} placeholder="Opcional" />
          </div>
          <p className="text-[11px] text-gray-400">Cambia cómo se ve en tu música y en el reproductor. El cambio aplica en todas tus playlists.</p>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setRenombrar(null)} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={guardarNombre} disabled={busyMedia || !renForm.titulo.trim()} className="btn-primary flex-1">{busyMedia ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
