import { useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import { IconPlus, IconTrash, IconInvoice } from '../../icons';

const VACIO = { nombre: '', precio_mensual: 0, max_bitrate: 128, max_oyentes: 100, espacio_mb: 1024, max_mounts: 1, permite_dj: true };

export default function AdminPlanes() {
  const [planes, setPlanes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(VACIO);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  async function cargar() {
    setLoading(true);
    try {
      const { planes } = await apiFetch('/admin/planes');
      setPlanes(planes);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { cargar(); }, []);

  const set = (k, num) => (e) =>
    setForm((f) => ({ ...f, [k]: num ? Number(e.target.value) : e.target.value }));

  async function crear(e) {
    e.preventDefault();
    setSaving(true); setMsg(null);
    try {
      await apiFetch('/admin/planes', { method: 'POST', body: JSON.stringify(form) });
      setMsg({ type: 'ok', text: '✅ Plan creado' });
      setForm(VACIO);
      cargar();
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setSaving(false);
    }
  }

  async function eliminar(p) {
    if (!confirm(`¿Eliminar el plan "${p.nombre}"?`)) return;
    try { await apiFetch('/admin/planes/' + p.id, { method: 'DELETE' }); cargar(); }
    catch (e) { alert(e.message); }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Lista de planes */}
      <div className="lg:col-span-2 space-y-4">
        {loading ? (
          <div className="card p-8 text-center text-gray-400">Cargando…</div>
        ) : planes.length === 0 ? (
          <div className="card p-8 text-center text-gray-400">Sin planes todavía</div>
        ) : (
          planes.map((p) => (
            <div key={p.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-9 h-9 grid place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                      <IconInvoice width={18} height={18} />
                    </span>
                    <div>
                      <div className="font-semibold">{p.nombre}</div>
                      <div className="text-sm text-gray-400">${p.precio_mensual.toFixed(2)} / mes</div>
                    </div>
                  </div>
                </div>
                <button onClick={() => eliminar(p)} title="Eliminar"
                  className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 dark:border-gray-800 hover:border-red-400 hover:text-red-500 transition">
                  <IconTrash width={15} height={15} />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
                <Dato label="Bitrate" value={p.max_bitrate ? `${p.max_bitrate} kbps` : 'Ilimitado'} />
                <Dato label="Oyentes" value={p.max_oyentes} />
                <Dato label="Espacio" value={`${(p.espacio_mb / 1024).toFixed(1)} GB`} />
                <Dato label="DJ en vivo" value={p.permite_dj ? 'Sí' : 'No'} />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Crear plan */}
      <div className="card p-5 h-fit">
        <h2 className="font-semibold mb-4">Nuevo plan</h2>
        <form onSubmit={crear} className="space-y-3">
          <div>
            <label className="label">Nombre</label>
            <input className="input" value={form.nombre} onChange={set('nombre')} placeholder="Ej: Empresarial" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Precio/mes ($)</label>
              <input className="input" type="number" step="0.01" value={form.precio_mensual} onChange={set('precio_mensual', true)} />
            </div>
            <div>
              <label className="label">Bitrate (kbps)</label>
              <input className="input" type="number" value={form.max_bitrate} onChange={set('max_bitrate', true)} />
            </div>
            <div>
              <label className="label">Máx. oyentes</label>
              <input className="input" type="number" value={form.max_oyentes} onChange={set('max_oyentes', true)} />
            </div>
            <div>
              <label className="label">Espacio (MB)</label>
              <input className="input" type="number" value={form.espacio_mb} onChange={set('espacio_mb', true)} />
            </div>
            <div>
              <label className="label">Máx. mounts</label>
              <input className="input" type="number" value={form.max_mounts} onChange={set('max_mounts', true)} />
            </div>
            <div>
              <label className="label">DJ en vivo</label>
              <select className="input" value={form.permite_dj ? '1' : '0'} onChange={(e) => setForm((f) => ({ ...f, permite_dj: e.target.value === '1' }))}>
                <option value="1">Sí</option>
                <option value="0">No</option>
              </select>
            </div>
          </div>

          {msg && (
            <div className={`text-sm rounded-xl px-3 py-2 ${msg.type === 'ok'
              ? 'text-brand-700 bg-brand-50 dark:bg-brand-500/10 dark:text-brand-400'
              : 'text-red-600 bg-red-50 dark:bg-red-500/10'}`}>
              {msg.text}
            </div>
          )}
          <button className="btn-primary w-full" disabled={saving}>
            <IconPlus width={16} height={16} /> {saving ? 'Creando…' : 'Crear plan'}
          </button>
        </form>
      </div>
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
