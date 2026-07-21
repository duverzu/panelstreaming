import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import Modal from './Modal';
import { IconPlus, IconTrash, IconInvoice } from '../icons';

// Valores de partida sensatos para cada tipo de servicio
const VACIO_AUDIO = { nombre: '', tipo: 'audio', max_bitrate: 128, max_oyentes: 100, espacio_mb: 1024, max_mounts: 1, permite_dj: true, max_resolucion: '720p', permite_restream: false };
const VACIO_VIDEO = { nombre: '', tipo: 'video', max_bitrate: 2500, max_oyentes: 50, espacio_mb: 51200, max_mounts: 1, permite_dj: true, max_resolucion: '720p', permite_restream: false };

const RESOLUCIONES = [
  { v: '480p',  label: '480p — SD (ahorra banda)' },
  { v: '720p',  label: '720p — HD (lo más usado)' },
  { v: '1080p', label: '1080p — Full HD' },
  { v: 'original', label: 'Sin límite — la que envíe el cliente' },
];

/**
 * Gestor de planes reutilizable.
 * props: base = '/admin' | '/reseller' ; esRevendedor (los planes globales son de solo lectura)
 */
export default function PlanesManager({ base = '/admin', esRevendedor = false }) {
  const [planes, setPlanes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const editable = (p) => (esRevendedor ? p.reseller_id != null : true);

  async function cargar() {
    setLoading(true);
    try { const { planes } = await apiFetch(`${base}/planes`); setPlanes(planes); }
    finally { setLoading(false); }
  }
  useEffect(() => { cargar(); }, [base]);

  function abrirCrear() { setEditId(null); setForm(VACIO_AUDIO); setError(null); setOpen(true); }

  /** Al cambiar el tipo se reajustan los valores por defecto, no los límites de audio. */
  function cambiarTipo(e) {
    const tipo = e.target.value;
    const base = tipo === 'video' ? VACIO_VIDEO : VACIO_AUDIO;
    setForm((f) => ({ ...base, nombre: f.nombre }));
  }
  function abrirEditar(p) {
    setEditId(p.id);
    setForm({
      nombre: p.nombre, tipo: p.tipo || 'audio', max_bitrate: p.max_bitrate, max_oyentes: p.max_oyentes,
      espacio_mb: p.espacio_mb, max_mounts: p.max_mounts, permite_dj: p.permite_dj,
      max_resolucion: p.max_resolucion || '720p', permite_restream: p.permite_restream || false,
    });
    setError(null); setOpen(true);
  }
  const set = (k, num) => (e) => setForm((f) => ({ ...f, [k]: num ? Number(e.target.value) : e.target.value }));

  async function guardar(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      if (editId) await apiFetch(`${base}/planes/${editId}`, { method: 'PUT', body: JSON.stringify(form) });
      else await apiFetch(`${base}/planes`, { method: 'POST', body: JSON.stringify(form) });
      setOpen(false); cargar();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }
  async function eliminar(p) {
    if (!confirm(`¿Eliminar el plan "${p.nombre}"?`)) return;
    try { await apiFetch(`${base}/planes/${p.id}`, { method: 'DELETE' }); cargar(); }
    catch (e) { alert(e.message); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Planes <span className="text-gray-400 font-normal">({planes.length})</span></h2>
        <button onClick={abrirCrear} className="btn-primary !py-2 !px-3 text-xs"><IconPlus width={15} height={15} /> Crear plan</button>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-gray-400">Cargando…</div>
      ) : planes.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-3xl mb-2">📋</div>
          <p className="text-gray-500">{esRevendedor ? 'Aún no tienes planes. Crea tu primer plan para poder crear radios.' : 'Sin planes todavía'}</p>
          <button onClick={abrirCrear} className="btn-primary mt-4 inline-flex"><IconPlus width={16} height={16} /> Crear plan</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {planes.map((p) => (
            <div key={p.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-9 h-9 grid place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"><IconInvoice width={18} height={18} /></span>
                  <div>
                    <div className="font-semibold flex items-center gap-2">
                      {p.nombre}
                      {esRevendedor && !editable(p) && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400">Global</span>}
                    </div>
                    <div className="text-sm text-gray-400">{p.tipo === 'video' ? 'Plantilla de video' : 'Plantilla de radio'}</div>
                  </div>
                </div>
                {editable(p) && (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => abrirEditar(p)} className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-brand-500 hover:text-brand-600 transition">Editar</button>
                    <button onClick={() => eliminar(p)} title="Eliminar" className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 dark:border-gray-800 hover:border-red-400 hover:text-red-500 transition"><IconTrash width={15} height={15} /></button>
                  </div>
                )}
              </div>
              {p.tipo === 'video' ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
                  <Dato label="Resolución" value={p.max_resolucion === 'original' ? 'Sin límite' : p.max_resolucion} />
                  <Dato label="Espectadores" value={p.max_oyentes} />
                  <Dato label="Almacenamiento" value={`${(p.espacio_mb / 1024).toFixed(0)} GB`} />
                  <Dato label="Redes" value={p.permite_restream ? 'Sí' : 'No'} />
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
                  <Dato label="Bitrate" value={p.max_bitrate ? `${p.max_bitrate} kbps` : 'Ilimitado'} />
                  <Dato label="Oyentes" value={p.max_oyentes} />
                  <Dato label="Espacio" value={`${(p.espacio_mb / 1024).toFixed(1)} GB`} />
                  <Dato label="DJ en vivo" value={p.permite_dj ? 'Sí' : 'No'} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Editar plan' : 'Crear plan'}>
        <form onSubmit={guardar} className="space-y-3">
          <div><label className="label">Nombre</label><input className="input" value={form.nombre} onChange={set('nombre')} placeholder="Ej: Empresarial" required /></div>
          <div>
            <label className="label">Tipo de servicio</label>
            <select className="input" value={form.tipo} onChange={cambiarTipo}>
              <option value="audio">🎵 Audio — radio online</option>
              <option value="video">🎬 Video — streaming de video</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">Decide en qué servidor se crea la cuenta y qué ve el cliente en su panel.</p>
          </div>
          {form.tipo === 'video' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Resolución máxima</label>
                <select className="input" value={form.max_resolucion} onChange={set('max_resolucion')}>
                  {RESOLUCIONES.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Calidad (kbps)</label>
                <input className="input" type="number" value={form.max_bitrate} onChange={set('max_bitrate', true)} />
                <p className="text-xs text-gray-400 mt-1">2500 para 720p, 5000 para 1080p</p>
              </div>
              <div>
                <label className="label">Máx. espectadores</label>
                <input className="input" type="number" value={form.max_oyentes} onChange={set('max_oyentes', true)} />
              </div>
              <div className="col-span-2">
                <label className="label">Almacenamiento (MB)</label>
                <input className="input" type="number" value={form.espacio_mb} onChange={set('espacio_mb', true)} />
                <p className="text-xs text-gray-400 mt-1">{(form.espacio_mb / 1024).toFixed(1)} GB para sus videos</p>
              </div>
              <div className="col-span-2">
                <label className="label">Transmisión en vivo</label>
                <select className="input" value={form.permite_dj ? '1' : '0'} onChange={(e) => setForm((f) => ({ ...f, permite_dj: e.target.value === '1' }))}>
                  <option value="1">Sí — puede salir en vivo desde su encoder</option>
                  <option value="0">No — solo emisión 24/7 de sus videos</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Retransmitir a redes</label>
                <select className="input" value={form.permite_restream ? '1' : '0'} onChange={(e) => setForm((f) => ({ ...f, permite_restream: e.target.value === '1' }))}>
                  <option value="0">No incluido</option>
                  <option value="1">Sí — puede reenviar a YouTube, Facebook, Twitch…</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">Cada red a la que reenvía consume banda adicional del servidor.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Bitrate (kbps)</label><input className="input" type="number" value={form.max_bitrate} onChange={set('max_bitrate', true)} /></div>
              <div><label className="label">Máx. oyentes</label><input className="input" type="number" value={form.max_oyentes} onChange={set('max_oyentes', true)} /></div>
              <div><label className="label">Espacio (MB)</label><input className="input" type="number" value={form.espacio_mb} onChange={set('espacio_mb', true)} /></div>
              <div><label className="label">Máx. mounts</label><input className="input" type="number" value={form.max_mounts} onChange={set('max_mounts', true)} /></div>
              <div className="col-span-2"><label className="label">DJ en vivo</label>
                <select className="input" value={form.permite_dj ? '1' : '0'} onChange={(e) => setForm((f) => ({ ...f, permite_dj: e.target.value === '1' }))}>
                  <option value="1">Sí — permite transmisión en vivo</option>
                  <option value="0">No — solo AutoDJ</option>
                </select>
              </div>
            </div>
          )}
          {error && <div className="text-sm rounded-xl px-3 py-2 text-red-600 bg-red-50 dark:bg-red-500/10">{error}</div>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost flex-1">Cancelar</button>
            <button className="btn-primary flex-1" disabled={saving}>{saving ? 'Guardando…' : editId ? 'Guardar cambios' : 'Crear plan'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Dato({ label, value }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-950 rounded-xl px-3 py-2">
      <div className="text-[11px] text-gray-400">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
