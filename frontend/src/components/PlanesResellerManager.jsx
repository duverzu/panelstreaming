import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import Modal from './Modal';
import { IconPlus, IconTrash, IconUsers } from '../icons';

const VACIO = { nombre: '', cupo_radios: 10, max_oyentes_total: 1000, espacio_total_mb: 20480, activo: true };

/**
 * Paquetes de MAYORISTA: lo que puede vender un revendedor.
 * Distinto de los planes de radio (esos son la plantilla de UNA estación).
 */
export default function PlanesResellerManager() {
  const [planes, setPlanes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function cargar() {
    setLoading(true);
    try { const { planes } = await apiFetch('/admin/planes-reseller'); setPlanes(planes); }
    finally { setLoading(false); }
  }
  useEffect(() => { cargar(); }, []);

  function abrirCrear() { setEditId(null); setForm(VACIO); setError(null); setOpen(true); }
  function abrirEditar(p) {
    setEditId(p.id);
    setForm({ nombre: p.nombre, cupo_radios: p.cupo_radios, max_oyentes_total: p.max_oyentes_total, espacio_total_mb: p.espacio_total_mb, activo: p.activo });
    setError(null); setOpen(true);
  }
  const set = (k, num) => (e) => setForm((f) => ({ ...f, [k]: num ? Number(e.target.value) : e.target.value }));

  async function guardar(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      if (editId) await apiFetch(`/admin/planes-reseller/${editId}`, { method: 'PUT', body: JSON.stringify(form) });
      else await apiFetch('/admin/planes-reseller', { method: 'POST', body: JSON.stringify(form) });
      setOpen(false); cargar();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }
  async function eliminar(p) {
    if (!confirm(`¿Eliminar el paquete "${p.nombre}"? Los revendedores que ya lo tienen conservan sus límites.`)) return;
    try { await apiFetch(`/admin/planes-reseller/${p.id}`, { method: 'DELETE' }); cargar(); }
    catch (e) { alert(e.message); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Paquetes de revendedor <span className="text-gray-400 font-normal">({planes.length})</span></h2>
          <p className="text-xs text-gray-400 mt-0.5">Cuánto puede vender un mayorista. Se venden como servicio desde tu facturación.</p>
        </div>
        <button onClick={abrirCrear} className="btn-primary !py-2 !px-3 text-xs shrink-0"><IconPlus width={15} height={15} /> Crear paquete</button>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-gray-400">Cargando…</div>
      ) : planes.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-3xl mb-2">🏪</div>
          <p className="text-gray-500">Sin paquetes de revendedor todavía. Crea uno (ej: <b>Revendedor 10</b>) y podrás venderlo por API.</p>
          <button onClick={abrirCrear} className="btn-primary mt-4 inline-flex"><IconPlus width={16} height={16} /> Crear paquete</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {planes.map((p) => (
            <div key={p.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-9 h-9 grid place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"><IconUsers width={18} height={18} /></span>
                  <div>
                    <div className="font-semibold flex items-center gap-2">
                      {p.nombre}
                      {!p.activo && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400">Inactivo</span>}
                    </div>
                    <div className="text-sm text-gray-400">Paquete de mayorista</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => abrirEditar(p)} className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-brand-500 hover:text-brand-600 transition">Editar</button>
                  <button onClick={() => eliminar(p)} title="Eliminar" className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 dark:border-gray-800 hover:border-red-400 hover:text-red-500 transition"><IconTrash width={15} height={15} /></button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
                <Dato label="Radios" value={p.cupo_radios} />
                <Dato label="Oyentes totales" value={p.max_oyentes_total} />
                <Dato label="Espacio total" value={`${(p.espacio_total_mb / 1024).toFixed(1)} GB`} />
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Editar paquete' : 'Crear paquete de revendedor'}>
        <form onSubmit={guardar} className="space-y-3">
          <div><label className="label">Nombre</label><input className="input" value={form.nombre} onChange={set('nombre')} placeholder="Ej: Revendedor 10" required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Cupo de radios</label><input className="input" type="number" min="1" value={form.cupo_radios} onChange={set('cupo_radios', true)} /></div>
            <div><label className="label">Oyentes totales</label><input className="input" type="number" min="1" value={form.max_oyentes_total} onChange={set('max_oyentes_total', true)} /></div>
            <div><label className="label">Espacio total (MB)</label><input className="input" type="number" min="1" value={form.espacio_total_mb} onChange={set('espacio_total_mb', true)} /></div>
            <div><label className="label">Estado</label>
              <select className="input" value={form.activo ? '1' : '0'} onChange={(e) => setForm((f) => ({ ...f, activo: e.target.value === '1' }))}>
                <option value="1">Activo — se puede vender</option>
                <option value="0">Inactivo — oculto</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-400">Son límites de toda su cuenta: repartirá esos oyentes y ese espacio entre las radios que cree con sus propios planes.</p>
          {error && <div className="text-sm rounded-xl px-3 py-2 text-red-600 bg-red-50 dark:bg-red-500/10">{error}</div>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost flex-1">Cancelar</button>
            <button className="btn-primary flex-1" disabled={saving}>{saving ? 'Guardando…' : editId ? 'Guardar cambios' : 'Crear paquete'}</button>
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
