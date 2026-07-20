import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../api';
import { useAuth } from '../../auth';
import Modal from '../../components/Modal';
import { IconPlus, IconTrash, IconEnter, IconPower, IconRefresh, IconUsers } from '../../icons';

export default function AdminRevendedores() {
  const { impersonateReseller } = useAuth();
  const navigate = useNavigate();

  const [resellers, setResellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ nombre_empresa: '', username: '', email: '', password: '', cupo_radios: 5, max_oyentes_total: 500, espacio_total_mb: 10240 });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function cargar() {
    setLoading(true);
    try { const { resellers } = await apiFetch('/admin/resellers'); setResellers(resellers); }
    finally { setLoading(false); }
  }
  useEffect(() => { cargar(); }, []);

  function abrirCrear() { setEditId(null); setForm({ nombre_empresa: '', username: '', email: '', password: '', cupo_radios: 5, max_oyentes_total: 500, espacio_total_mb: 10240 }); setError(null); setOpen(true); }
  function abrirEditar(r) { setEditId(r.id); setForm({ nombre_empresa: r.nombre_empresa, cupo_radios: r.cupo_radios, max_oyentes_total: r.max_oyentes_total, espacio_total_mb: r.espacio_total_mb }); setError(null); setOpen(true); }

  async function guardar(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const payload = {
        nombre_empresa: form.nombre_empresa,
        cupo_radios: Number(form.cupo_radios),
        max_oyentes_total: Number(form.max_oyentes_total),
        espacio_total_mb: Number(form.espacio_total_mb),
      };
      if (editId) await apiFetch('/admin/resellers/' + editId, { method: 'PUT', body: JSON.stringify(payload) });
      else await apiFetch('/admin/resellers/crear', { method: 'POST', body: JSON.stringify({ ...payload, username: form.username, email: form.email, password: form.password }) });
      setOpen(false);
      cargar();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function toggleActivo(r) {
    setBusy(r.id);
    try { await apiFetch('/admin/resellers/' + r.id, { method: 'PUT', body: JSON.stringify({ activo: !r.activo }) }); await cargar(); }
    catch (e) { alert(e.message); } finally { setBusy(null); }
  }
  async function eliminar(r) {
    if (!confirm(`¿Eliminar al revendedor "${r.nombre_empresa}"? Sus radios quedarán sin revendedor (no se borran).`)) return;
    setBusy(r.id);
    try { await apiFetch('/admin/resellers/' + r.id, { method: 'DELETE' }); await cargar(); }
    catch (e) { alert(e.message); } finally { setBusy(null); }
  }
  async function entrar(r) {
    try { await impersonateReseller(r.id); navigate('/reseller', { replace: true }); }
    catch (e) { alert(e.message); }
  }

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Revendedores <span className="text-gray-400 font-normal">({resellers.length})</span></h2>
          <div className="flex items-center gap-2">
            <button onClick={cargar} className="btn-ghost !py-2 !px-3 text-xs"><IconRefresh width={15} height={15} /> Actualizar</button>
            <button onClick={abrirCrear} className="btn-primary !py-2 !px-3 text-xs"><IconPlus width={15} height={15} /> Crear revendedor</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="py-2.5 pr-3 font-medium">Revendedor</th>
                <th className="py-2.5 px-3 font-medium">Cupo</th>
                <th className="py-2.5 px-3 font-medium">Estado</th>
                <th className="py-2.5 pl-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="4" className="py-8 text-center text-gray-400">Cargando…</td></tr>
              ) : resellers.length === 0 ? (
                <tr><td colSpan="4" className="py-8 text-center text-gray-400">Sin revendedores todavía</td></tr>
              ) : (
                resellers.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50 dark:border-gray-800/60 last:border-0">
                    <td className="py-3 pr-3"><div className="font-medium">{r.nombre_empresa}</div><div className="text-xs text-gray-400"><span className="font-mono">{r.username}</span>{r.email ? ` · ${r.email}` : ''}</div></td>
                    <td className="py-3 px-3">
                      <span className="text-sm">{r.radios_usadas}/{r.cupo_radios}</span>
                      <div className="w-24 h-1.5 mt-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                        <div className="h-full bg-brand-500" style={{ width: Math.min(100, (r.radios_usadas / (r.cupo_radios || 1)) * 100) + '%' }} />
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      {r.activo
                        ? <span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">Activo</span>
                        : <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 dark:bg-red-500/10">Suspendido</span>}
                    </td>
                    <td className="py-3 pl-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {busy === r.id ? <span className="text-xs text-gray-400 px-2">…</span> : (
                          <>
                            <button onClick={() => abrirEditar(r)} className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-brand-500 hover:text-brand-600 transition">Editar cupo</button>
                            <IB title={r.activo ? 'Suspender' : 'Reactivar'} onClick={() => toggleActivo(r)}><IconPower width={14} height={14} /></IB>
                            <IB title="Entrar al panel" onClick={() => entrar(r)}><IconEnter width={14} height={14} /></IB>
                            <IB title="Eliminar" onClick={() => eliminar(r)} red><IconTrash width={14} height={14} /></IB>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Editar revendedor' : 'Crear revendedor'}>
        <form onSubmit={guardar} className="space-y-3">
          <div><label className="label">Nombre / empresa</label><input className="input" value={form.nombre_empresa} onChange={(e) => setForm({ ...form, nombre_empresa: e.target.value })} placeholder="RadioMax" required /></div>
          {!editId && (
            <>
              <div><label className="label">Usuario de acceso</label><input className="input font-mono" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '') })} placeholder="radiomax" required /></div>
              <div><label className="label">Email de contacto</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="reseller@correo.com" required /></div>
              <div><label className="label">Contraseña</label><input className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="temporal123" required /></div>
            </>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className="label">Cupo de radios</label><input className="input" type="number" min="0" value={form.cupo_radios} onChange={(e) => setForm({ ...form, cupo_radios: e.target.value })} /></div>
            <div><label className="label">Oyentes totales</label><input className="input" type="number" min="0" value={form.max_oyentes_total} onChange={(e) => setForm({ ...form, max_oyentes_total: e.target.value })} /></div>
            <div><label className="label">Espacio total (MB)</label><input className="input" type="number" min="0" value={form.espacio_total_mb} onChange={(e) => setForm({ ...form, espacio_total_mb: e.target.value })} /></div>
          </div>
          <p className="text-xs text-gray-400">La suma de los planes de sus radios no puede exceder estos totales.</p>
          {error && <div className="text-sm rounded-xl px-3 py-2 text-red-600 bg-red-50 dark:bg-red-500/10">{error}</div>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost flex-1">Cancelar</button>
            <button className="btn-primary flex-1" disabled={saving}>{saving ? 'Guardando…' : editId ? 'Guardar' : 'Crear revendedor'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function IB({ children, title, onClick, red }) {
  return (
    <button onClick={onClick} title={title}
      className={`w-8 h-8 grid place-items-center rounded-lg border border-gray-200 dark:border-gray-800 transition ${red ? 'hover:border-red-400 hover:text-red-500' : 'hover:border-brand-500 hover:text-brand-600'}`}>
      {children}
    </button>
  );
}
