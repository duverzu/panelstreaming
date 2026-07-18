import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../api';
import { useAuth } from '../../auth';
import { IconPlay, IconStop, IconPower, IconEnter, IconTrash, IconPlus, IconRefresh } from '../../icons';

const ESTADO_BADGE = {
  online: { txt: 'Al aire', cls: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400', dot: 'bg-brand-500 animate-pulse' },
  offline: { txt: 'Fuera de aire', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400', dot: 'bg-gray-400' },
  suspendido: { txt: 'Suspendido', cls: 'bg-red-50 text-red-600 dark:bg-red-500/10', dot: 'bg-red-500' },
  'sin-estacion': { txt: 'Sin estación', cls: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10', dot: 'bg-amber-500' },
  error: { txt: 'Error', cls: 'bg-red-50 text-red-600 dark:bg-red-500/10', dot: 'bg-red-500' },
};

export default function AdminClientes() {
  const { impersonate } = useAuth();
  const navigate = useNavigate();

  const [clientes, setClientes] = useState([]);
  const [planes, setPlanes] = useState([]);
  const [estados, setEstados] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // id en proceso

  const [form, setForm] = useState({ nombre_empresa: '', email: '', password: '', plan_id: '' });
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  async function cargar() {
    setLoading(true);
    try {
      const [c, p] = await Promise.all([apiFetch('/admin/clientes'), apiFetch('/admin/planes')]);
      setClientes(c.clientes);
      setPlanes(p.planes);
      setForm((f) => ({ ...f, plan_id: f.plan_id || p.planes[0]?.id || '' }));
      apiFetch('/admin/clientes/estados').then((e) => setEstados(e.estados)).catch(() => {});
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { cargar(); }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function crear(e) {
    e.preventDefault();
    setSaving(true); setMsg(null);
    try {
      await apiFetch('/admin/clientes/crear', { method: 'POST', body: JSON.stringify(form) });
      setMsg({ type: 'ok', text: '✅ Cliente y estación creados' });
      setForm({ nombre_empresa: '', email: '', password: '', plan_id: planes[0]?.id || '' });
      cargar();
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setSaving(false);
    }
  }

  async function accion(c, path, confirmMsg) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(c.id);
    try {
      await apiFetch(`/admin/clientes/${c.id}/${path}`, { method: 'POST' });
      await cargar();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function borrar(c) {
    if (!confirm(`¿Eliminar "${c.nombre_empresa}" y su estación? No se puede deshacer.`)) return;
    setBusy(c.id);
    try {
      await apiFetch('/admin/clientes/' + c.id, { method: 'DELETE' });
      await cargar();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function entrar(c) {
    try { await impersonate(c.id); navigate('/cliente', { replace: true }); }
    catch (e) { alert(e.message); }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* Tabla de clientes */}
      <div className="xl:col-span-2 card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Clientes <span className="text-gray-400 font-normal">({clientes.length})</span></h2>
          <button onClick={cargar} className="btn-ghost !py-2 !px-3 text-xs"><IconRefresh width={15} height={15} /> Actualizar</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="py-2.5 pr-3 font-medium">Empresa</th>
                <th className="py-2.5 px-3 font-medium">Plan</th>
                <th className="py-2.5 px-3 font-medium">Estado</th>
                <th className="py-2.5 pl-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="4" className="py-8 text-center text-gray-400">Cargando…</td></tr>
              ) : clientes.length === 0 ? (
                <tr><td colSpan="4" className="py-8 text-center text-gray-400">Sin clientes todavía</td></tr>
              ) : (
                clientes.map((c) => {
                  const est = ESTADO_BADGE[estados[c.id]] || ESTADO_BADGE.offline;
                  const suspendido = estados[c.id] === 'suspendido' || !c.activo;
                  return (
                    <tr key={c.id} className="border-b border-gray-50 dark:border-gray-800/60 last:border-0">
                      <td className="py-3 pr-3">
                        <div className="font-medium">{c.nombre_empresa}</div>
                        <div className="text-xs text-gray-400">{c.email}</div>
                      </td>
                      <td className="py-3 px-3 capitalize">{c.plan}</td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full ${est.cls}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${est.dot}`} /> {est.txt}
                        </span>
                      </td>
                      <td className="py-3 pl-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {busy === c.id ? (
                            <span className="text-xs text-gray-400 px-2">…</span>
                          ) : (
                            <>
                              <IconBtn title="Iniciar / al aire" onClick={() => accion(c, 'iniciar')} hover="brand"><IconPlay width={14} height={14} /></IconBtn>
                              <IconBtn title="Parar transmisión" onClick={() => accion(c, 'parar')} hover="amber"><IconStop width={13} height={13} /></IconBtn>
                              {suspendido ? (
                                <IconBtn title="Reactivar" onClick={() => accion(c, 'reactivar')} hover="brand"><IconPower width={14} height={14} /></IconBtn>
                              ) : (
                                <IconBtn title="Suspender" onClick={() => accion(c, 'suspender', `¿Suspender a "${c.nombre_empresa}"? Se apaga su radio y no podrá entrar.`)} hover="red"><IconPower width={14} height={14} /></IconBtn>
                              )}
                              <IconBtn title="Entrar al panel" onClick={() => entrar(c)} hover="brand"><IconEnter width={14} height={14} /></IconBtn>
                              <IconBtn title="Eliminar" onClick={() => borrar(c)} hover="red"><IconTrash width={14} height={14} /></IconBtn>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Crear cliente */}
      <div className="card p-5 h-fit">
        <h2 className="font-semibold mb-4">Nuevo cliente</h2>
        <form onSubmit={crear} className="space-y-3">
          <div>
            <label className="label">Nombre de la radio</label>
            <input className="input" value={form.nombre_empresa} onChange={set('nombre_empresa')} placeholder="Rock FM" required />
          </div>
          <div>
            <label className="label">Email de acceso</label>
            <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="dueno@radio.com" required />
          </div>
          <div>
            <label className="label">Contraseña temporal</label>
            <input className="input" value={form.password} onChange={set('password')} placeholder="temporal123" required />
          </div>
          <div>
            <label className="label">Plan</label>
            <select className="input" value={form.plan_id} onChange={set('plan_id')} required>
              {planes.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre} · {p.max_bitrate || '∞'} kbps · {p.max_oyentes} oyentes</option>
              ))}
            </select>
          </div>
          {msg && (
            <div className={`text-sm rounded-xl px-3 py-2 ${msg.type === 'ok'
              ? 'text-brand-700 bg-brand-50 dark:bg-brand-500/10 dark:text-brand-400'
              : 'text-red-600 bg-red-50 dark:bg-red-500/10'}`}>
              {msg.text}
            </div>
          )}
          <button className="btn-primary w-full" disabled={saving}>
            <IconPlus width={16} height={16} /> {saving ? 'Creando…' : 'Crear cliente'}
          </button>
        </form>
      </div>
    </div>
  );
}

function IconBtn({ children, title, onClick, hover }) {
  const h = {
    brand: 'hover:border-brand-500 hover:text-brand-600',
    red: 'hover:border-red-400 hover:text-red-500',
    amber: 'hover:border-amber-400 hover:text-amber-500',
  }[hover] || 'hover:border-brand-500';
  return (
    <button onClick={onClick} title={title}
      className={`w-8 h-8 grid place-items-center rounded-lg border border-gray-200 dark:border-gray-800 transition ${h}`}>
      {children}
    </button>
  );
}
