import { useEffect, useState } from 'react';
import { apiFetch } from '../../../api';
import { IconPlus, IconTrash, IconChevronDown } from '../../../icons';
import { useVideo } from './useVideo';

export default function VideoPlaylist() {
  const { data } = useVideo();                 // para la lista de videos disponibles
  const [info, setInfo] = useState(null);      // { listas, programacion, activa, emitiendo_ahora }
  const [sel, setSel] = useState(null);        // id de lista abierta
  const [nombre, setNombre] = useState('');

  function cargar() { apiFetch('/cliente/video/listas').then(setInfo).catch(() => {}); }
  useEffect(() => { cargar(); }, []);

  const videos = data?.videos?.map((v) => v.nombre) || [];

  async function crear() {
    if (!nombre.trim()) return;
    const l = await apiFetch('/cliente/video/listas', { method: 'POST', body: JSON.stringify({ nombre: nombre.trim() }) });
    setNombre(''); setSel(l.id); cargar();
  }
  async function borrar(id) {
    if (!confirm('¿Borrar esta lista? Los videos no se borran, solo la lista.')) return;
    await apiFetch('/cliente/video/listas/' + id, { method: 'DELETE' }); if (sel === id) setSel(null); cargar();
  }
  async function activar(id) { await apiFetch('/cliente/video/activa', { method: 'POST', body: JSON.stringify({ id }) }); cargar(); }
  async function toggleVideo(id, nombre, incluido) {
    const lista = info.listas[id];
    const nuevos = incluido ? lista.videos.filter((v) => v !== nombre) : [...lista.videos, nombre];
    await apiFetch('/cliente/video/listas/' + id, { method: 'PUT', body: JSON.stringify({ videos: nuevos }) });
    cargar();
  }
  async function moverVideo(id, i, dir) {
    const arr = [...info.listas[id].videos];
    const j = i + dir; if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    await apiFetch('/cliente/video/listas/' + id, { method: 'PUT', body: JSON.stringify({ videos: arr }) });
    cargar();
  }

  if (!info) return <p className="py-10 text-center text-gray-400">Cargando tus listas…</p>;
  const ids = Object.keys(info.listas);

  return (
    <div className="space-y-6">
      {/* Crear lista */}
      <div className="card p-5">
        <h2 className="font-semibold mb-1">Mis listas</h2>
        <p className="text-xs text-gray-400 mb-3">Agrupa tus videos en listas (ej: «Mañana», «Especiales») y elige cuál sale al aire. Luego puedes programarlas por horario abajo.</p>
        <div className="flex gap-2">
          <input className="input flex-1" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la lista" onKeyDown={(e) => e.key === 'Enter' && crear()} />
          <button onClick={crear} className="btn-primary shrink-0"><IconPlus width={16} height={16} /> Crear</button>
        </div>
      </div>

      {ids.length === 0 ? (
        <p className="text-sm text-gray-400 text-center">Aún no tienes listas. Crea una arriba y agrégale videos.</p>
      ) : ids.map((id) => {
        const l = info.listas[id];
        const abierta = sel === id;
        const alAire = info.emitiendo_ahora === id;
        return (
          <div key={id} className="card p-5">
            <div className="flex items-center justify-between">
              <button onClick={() => setSel(abierta ? null : id)} className="flex items-center gap-2 font-medium text-left">
                <IconChevronDown width={14} height={14} className={`transition-transform ${abierta ? '' : '-rotate-90'}`} />
                {l.nombre}
                <span className="text-xs text-gray-400 font-normal">({l.videos.length} videos)</span>
                {alAire && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">● AL AIRE</span>}
              </button>
              <div className="flex items-center gap-1.5">
                {!alAire && <button onClick={() => activar(id)} className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-brand-500 hover:text-brand-600 transition">Poner al aire</button>}
                <button onClick={() => borrar(id)} title="Borrar lista" className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 dark:border-gray-800 hover:border-red-400 hover:text-red-500 transition"><IconTrash width={14} height={14} /></button>
              </div>
            </div>

            {abierta && (
              <div className="mt-4 space-y-3">
                {/* Videos EN la lista, ordenables */}
                {l.videos.length > 0 && (
                  <div className="rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                    {l.videos.map((nombre, i) => (
                      <div key={nombre} className="flex items-center gap-2 px-3 py-2">
                        <span className="text-xs text-gray-400 w-5 text-right tabular-nums">{i + 1}</span>
                        <div className="flex flex-col">
                          <button onClick={() => moverVideo(id, i, -1)} disabled={i === 0} className="text-gray-400 hover:text-brand-600 disabled:opacity-30 leading-none"><IconChevronDown width={13} height={13} className="rotate-180" /></button>
                          <button onClick={() => moverVideo(id, i, 1)} disabled={i === l.videos.length - 1} className="text-gray-400 hover:text-brand-600 disabled:opacity-30 leading-none"><IconChevronDown width={13} height={13} /></button>
                        </div>
                        <span className="flex-1 text-sm truncate">{nombre}</span>
                        <button onClick={() => toggleVideo(id, nombre, true)} className="text-xs text-red-500 hover:underline">Quitar</button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Videos disponibles para agregar */}
                <div>
                  <div className="text-xs text-gray-400 mb-1.5">Agregar videos a esta lista:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {videos.filter((v) => !l.videos.includes(v)).map((v) => (
                      <button key={v} onClick={() => toggleVideo(id, v, false)} className="text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-brand-500 hover:text-brand-600 transition">
                        + {v.length > 28 ? v.slice(0, 26) + '…' : v}
                      </button>
                    ))}
                    {videos.filter((v) => !l.videos.includes(v)).length === 0 && <span className="text-xs text-gray-400">Todos tus videos ya están en esta lista.</span>}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Programación por horario */}
      {ids.length > 0 && <Programacion info={info} onSave={cargar} />}
    </div>
  );
}

function Programacion({ info, onSave }) {
  const [franjas, setFranjas] = useState(info.programacion || []);
  const [guardando, setGuardando] = useState(false);
  const ids = Object.keys(info.listas);

  function agregar() { setFranjas([...franjas, { desde: '06:00', hasta: '18:00', lista: ids[0] }]); }
  function quitar(i) { setFranjas(franjas.filter((_, k) => k !== i)); }
  function set(i, campo, val) { setFranjas(franjas.map((f, k) => (k === i ? { ...f, [campo]: val } : f))); }
  async function guardar() {
    setGuardando(true);
    try { await apiFetch('/cliente/video/programacion', { method: 'PUT', body: JSON.stringify({ programacion: franjas }) }); onSave(); }
    catch (e) { alert(e.message); } finally { setGuardando(false); }
  }

  return (
    <div className="card p-5">
      <h2 className="font-semibold mb-1">Programación por horario</h2>
      <p className="text-xs text-gray-400 mb-3">Opcional. Define qué lista se emite en cada franja; el canal cambia solo. Fuera de estas franjas, se emite la lista «al aire».</p>
      <div className="space-y-2">
        {franjas.map((f, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="time" className="input !w-auto" value={f.desde} onChange={(e) => set(i, 'desde', e.target.value)} />
            <span className="text-gray-400 text-sm">a</span>
            <input type="time" className="input !w-auto" value={f.hasta} onChange={(e) => set(i, 'hasta', e.target.value)} />
            <span className="text-gray-400 text-sm">→</span>
            <select className="input flex-1" value={f.lista} onChange={(e) => set(i, 'lista', e.target.value)}>
              {ids.map((id) => <option key={id} value={id}>{info.listas[id].nombre}</option>)}
            </select>
            <button onClick={() => quitar(i)} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 dark:border-gray-800 hover:border-red-400 hover:text-red-500 transition shrink-0"><IconTrash width={14} height={14} /></button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={agregar} className="btn-ghost text-sm"><IconPlus width={14} height={14} /> Franja</button>
        <button onClick={guardar} disabled={guardando} className="btn-primary text-sm ml-auto">{guardando ? 'Guardando…' : 'Guardar programación'}</button>
      </div>
    </div>
  );
}
