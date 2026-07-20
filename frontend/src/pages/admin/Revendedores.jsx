import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../api';
import { useAuth } from '../../auth';
import Modal from '../../components/Modal';
import AreaChart from '../../components/charts/AreaChart';
import { IconPlus, IconTrash, IconEnter, IconPower, IconRefresh, IconUsers, IconChevronDown, IconChart } from '../../icons';

export default function AdminRevendedores() {
  const { impersonateReseller } = useAuth();
  const navigate = useNavigate();

  const [resellers, setResellers] = useState([]);
  const [paquetes, setPaquetes] = useState([]);   // planes de revendedor
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [abierto, setAbierto] = useState(null);   // revendedor con el detalle desplegado

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ nombre_empresa: '', username: '', email: '', password: '', cupo_radios: 5, max_oyentes_total: 500, espacio_total_mb: 10240, plan_reseller_id: '' });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function cargar() {
    setLoading(true);
    try { const { resellers } = await apiFetch('/admin/resellers'); setResellers(resellers); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    cargar();
    apiFetch('/admin/planes-reseller').then(({ planes }) => setPaquetes(planes.filter((p) => p.activo))).catch(() => {});
  }, []);

  /** Al elegir un paquete, sus límites llenan el formulario (y quedan editables). */
  function elegirPaquete(id) {
    const p = paquetes.find((x) => String(x.id) === String(id));
    setForm((f) => ({
      ...f,
      plan_reseller_id: id,
      ...(p ? { cupo_radios: p.cupo_radios, max_oyentes_total: p.max_oyentes_total, espacio_total_mb: p.espacio_total_mb } : {}),
    }));
  }

  function abrirCrear() { setEditId(null); setForm({ nombre_empresa: '', username: '', email: '', password: '', cupo_radios: 5, max_oyentes_total: 500, espacio_total_mb: 10240, plan_reseller_id: '' }); setError(null); setOpen(true); }
  function abrirEditar(r) { setEditId(r.id); setForm({ nombre_empresa: r.nombre_empresa, cupo_radios: r.cupo_radios, max_oyentes_total: r.max_oyentes_total, espacio_total_mb: r.espacio_total_mb, plan_reseller_id: '' }); setError(null); setOpen(true); }

  async function guardar(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const payload = {
        nombre_empresa: form.nombre_empresa,
        cupo_radios: Number(form.cupo_radios),
        max_oyentes_total: Number(form.max_oyentes_total),
        espacio_total_mb: Number(form.espacio_total_mb),
        ...(form.plan_reseller_id ? { plan_reseller_id: Number(form.plan_reseller_id) } : {}),
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
                <th className="py-2.5 px-3 font-medium">Radios</th>
                <th className="py-2.5 px-3 font-medium">Oyentes</th>
                <th className="py-2.5 px-3 font-medium">Espacio</th>
                <th className="py-2.5 px-3 font-medium">Banda (mes)</th>
                <th className="py-2.5 px-3 font-medium">Estado</th>
                <th className="py-2.5 pl-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="py-8 text-center text-gray-400">Cargando…</td></tr>
              ) : resellers.length === 0 ? (
                <tr><td colSpan="7" className="py-8 text-center text-gray-400">Sin revendedores todavía</td></tr>
              ) : (
                resellers.map((r) => {
                  const u = r.uso || {};
                  const expandido = abierto === r.id;
                  return (
                  <Fragment key={r.id}>
                  <tr className="border-b border-gray-50 dark:border-gray-800/60 last:border-0">
                    <td className="py-3 pr-3">
                      <button onClick={() => setAbierto(expandido ? null : r.id)} className="flex items-center gap-2 text-left hover:text-brand-600 transition">
                        <IconChevronDown width={14} height={14} className={`shrink-0 transition-transform ${expandido ? 'rotate-180' : '-rotate-90'}`} />
                        <span>
                          <span className="font-medium block">
                            {r.nombre_empresa}
                            {r.plan && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400 align-middle">{r.plan}</span>}
                          </span>
                          <span className="text-xs text-gray-400"><span className="font-mono">{r.username}</span>{r.email ? ` · ${r.email}` : ''}</span>
                        </span>
                      </button>
                    </td>
                    <td className="py-3 px-3"><Barra usado={u.radios ?? r.radios_usadas} total={u.cupo_radios ?? r.cupo_radios} /></td>
                    <td className="py-3 px-3">
                      <Barra usado={u.oyentes_asignados} total={u.max_oyentes_total} />
                      {u.oyentes_en_vivo > 0 && (
                        <div className="text-[11px] text-brand-600 dark:text-brand-400 mt-0.5 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" /> {u.oyentes_en_vivo} en vivo
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3"><Barra usado={u.espacio_mb} total={u.espacio_total_mb} sufijo=" MB" /></td>
                    <td className="py-3 px-3 tabular-nums">{u.banda_mes || '—'}</td>
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
                  {expandido && (
                    <tr className="border-b border-gray-50 dark:border-gray-800/60">
                      <td colSpan="7" className="p-0"><Detalle reseller={r} /></td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })
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
          <div>
            <label className="label">Paquete de revendedor</label>
            <select className="input" value={form.plan_reseller_id || ''} onChange={(e) => elegirPaquete(e.target.value)}>
              <option value="">A medida (sin paquete)</option>
              {paquetes.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre} · {p.cupo_radios} radios · {p.max_oyentes_total} oyentes · {(p.espacio_total_mb / 1024).toFixed(1)} GB</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              {paquetes.length === 0
                ? 'Aún no tienes paquetes. Créalos en Planes → Paquetes de revendedor para poder venderlos por API.'
                : 'Al elegir uno se llenan los límites de abajo (los puedes ajustar a mano).'}
            </p>
          </div>
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

/** Barra de capacidad: usado / total con color según qué tan lleno está. */
function Barra({ usado = 0, total = 0, sufijo = '' }) {
  const pct = total > 0 ? Math.min(100, (usado / total) * 100) : 0;
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-brand-500';
  const fmt = (n) => (sufijo === ' MB' && n >= 1024 ? (n / 1024).toFixed(1) + ' GB' : n + sufijo);
  return (
    <div className="min-w-[92px]">
      <div className="text-sm tabular-nums">{fmt(usado)}<span className="text-gray-400">/{fmt(total)}</span></div>
      <div className="w-24 h-1.5 mt-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: pct + '%' }} />
      </div>
    </div>
  );
}

/** Detalle expandible: banda de los últimos 30 días + sus radios. */
function Detalle({ reseller }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vivo = true;
    apiFetch(`/admin/resellers/${reseller.id}/uso`)
      .then((d) => vivo && setData(d))
      .catch((e) => vivo && setError(e.message));
    return () => { vivo = false; };
  }, [reseller.id]);

  if (error) return <div className="p-5 text-sm text-red-600">{error}</div>;
  if (!data) return <div className="p-5 text-sm text-gray-400">Cargando detalle…</div>;

  const serie = data.serie.map((d) => ({
    label: new Date(d.fecha).toLocaleDateString('es', { day: '2-digit', month: 'short' }),
    valor: d.gb,
  }));

  return (
    <div className="bg-gray-50/70 dark:bg-gray-950/40 p-5 space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Mini label="Banda del mes" value={data.banda_mes} />
        <Mini label="Últimos 30 días" value={data.banda_30d} />
        <Mini label="Oyentes ahora" value={data.oyentes_totales} />
        <Mini label="Radios al aire" value={`${data.al_aire}/${data.radios.length}`} />
              </div>

      <div className="card p-4">
        <div className="flex items-center gap-2 mb-2 text-sm font-medium">
          <IconChart width={16} height={16} className="text-brand-600" /> Consumo de banda · últimos 30 días (GB/día)
        </div>
        <AreaChart data={serie} unidad=" GB" height={180} />
      </div>

      <div className="card p-4">
        <div className="text-sm font-medium mb-3">Sus radios ({data.radios.length})</div>
        {data.radios.length === 0 ? (
          <p className="text-sm text-gray-400">Todavía no ha creado ninguna radio.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100 dark:border-gray-800">
                  <th className="py-2 pr-3 font-medium">Radio</th>
                  <th className="py-2 px-3 font-medium">Plan</th>
                  <th className="py-2 px-3 font-medium">Oyentes</th>
                  <th className="py-2 px-3 font-medium">Banda (mes)</th>
                  <th className="py-2 pl-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.radios.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 dark:border-gray-800/60 last:border-0">
                    <td className="py-2 pr-3 font-medium">{c.nombre_empresa}</td>
                    <td className="py-2 px-3 capitalize text-gray-500">{c.plan}</td>
                    <td className="py-2 px-3 tabular-nums">{c.oyentes}</td>
                    <td className="py-2 px-3 tabular-nums">{c.banda_mes}</td>
                    <td className="py-2 pl-3">
                      {!c.activo
                        ? <span className="text-xs text-gray-400">Suspendida</span>
                        : c.online
                          ? <span className="text-xs text-brand-600 dark:text-brand-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-brand-500" /> Al aire</span>
                          : <span className="text-xs text-gray-400">Fuera del aire</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Mini({ label, value }) {
  return (
    <div className="card p-3">
      <div className="text-[11px] text-gray-400">{label}</div>
      <div className="font-semibold mt-0.5 truncate">{value}</div>
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
