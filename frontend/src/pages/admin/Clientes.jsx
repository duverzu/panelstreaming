import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../api';
import { useAuth } from '../../auth';
import Modal from '../../components/Modal';
import { IconPlay, IconStop, IconPower, IconEnter, IconTrash, IconPlus, IconRefresh, IconMusic, IconSliders } from '../../icons';

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
  const [searchParams] = useSearchParams();
  const tipo = searchParams.get('tipo') === 'video' ? 'video' : 'audio';
  const esVideo = tipo === 'video';
  // Textos según el servicio (misma página para radios y canales de video)
  const T = esVideo
    ? { unidad: 'canal', crear: 'Crear canal', tituloModal: 'Crear nuevo canal', nombreLabel: 'Nombre del canal', ph: 'Mi Canal TV' }
    : { unidad: 'radio', crear: 'Crear radio', tituloModal: 'Crear nueva radio', nombreLabel: 'Nombre de la radio', ph: 'Rock FM' };

  const [clientes, setClientes] = useState([]);
  const [planes, setPlanes] = useState([]);
  const [estados, setEstados] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // id en proceso

  const [form, setForm] = useState({ nombre_empresa: '', username: '', email: '', password: '', plan_id: '' });
  const [userTocado, setUserTocado] = useState(false); // si el admin escribió el usuario a mano
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

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

  // "Rock FM 88.5" → "rockfm885" (mismo criterio que el backend)
  const slug = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 40);

  // El usuario se sugiere del nombre de la radio, pero el admin puede cambiarlo.
  const setNombre = (e) => {
    const nombre_empresa = e.target.value;
    setForm((f) => ({ ...f, nombre_empresa, username: userTocado ? f.username : slug(nombre_empresa) }));
  };
  const setUsername = (e) => { setUserTocado(true); setForm((f) => ({ ...f, username: slug(e.target.value) })); };

  async function crear(e) {
    e.preventDefault();
    setSaving(true); setMsg(null);
    try {
      const r = await apiFetch('/admin/clientes/crear', { method: 'POST', body: JSON.stringify(form) });
      setMsg({ type: 'ok', text: `✅ Radio creada. Acceso → usuario: ${r.credenciales?.usuario} · contraseña: ${r.credenciales?.password}` });
      setForm({ nombre_empresa: '', username: '', email: '', password: '', plan_id: planes.find((p) => (p.tipo || 'audio') === tipo)?.id || '' });
      setUserTocado(false);
      setModalOpen(false);
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

  async function agregarBiblioteca(c) {
    setBusy(c.id);
    try {
      const r = await apiFetch(`/admin/clientes/${c.id}/biblioteca`, { method: 'POST' });
      alert(r.message);
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function reaplicarPlan(c) {
    if (!confirm(`¿Re-aplicar los límites del plan "${c.plan}" a "${c.nombre_empresa}"?`)) return;
    setBusy(c.id);
    try {
      const r = await apiFetch(`/admin/clientes/${c.id}/reaplicar-plan`, { method: 'POST' });
      alert(r.message);
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  }

  // Solo los clientes y planes del servicio actual (audio | video)
  const lista = clientes.filter((c) => (c.tipo || 'audio') === tipo);
  const planesTipo = planes.filter((p) => (p.tipo || 'audio') === tipo);

  // Al cambiar de servicio o cargar planes, el plan por defecto es del tipo correcto
  useEffect(() => {
    setForm((f) => (planesTipo.some((p) => String(p.id) === String(f.plan_id))
      ? f : { ...f, plan_id: planesTipo[0]?.id || '' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, planes]);

  return (
    <div className="space-y-6">
      {/* Tabla de clientes */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Clientes de {T.unidad === 'radio' ? 'audio' : 'video'} <span className="text-gray-400 font-normal">({lista.length})</span></h2>
          <div className="flex items-center gap-2">
            <button onClick={cargar} className="btn-ghost !py-2 !px-3 text-xs"><IconRefresh width={15} height={15} /> Actualizar</button>
            <button onClick={() => { setMsg(null); setModalOpen(true); }} className="btn-primary !py-2 !px-3 text-xs">
              <IconPlus width={15} height={15} /> {T.crear}
            </button>
          </div>
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
              ) : lista.length === 0 ? (
                <tr><td colSpan="4" className="py-8 text-center text-gray-400">Sin clientes de {esVideo ? 'video' : 'audio'} todavía</td></tr>
              ) : (
                lista.map((c) => {
                  const est = ESTADO_BADGE[estados[c.id]] || ESTADO_BADGE.offline;
                  const suspendido = estados[c.id] === 'suspendido' || !c.activo;
                  return (
                    <tr key={c.id} className="border-b border-gray-50 dark:border-gray-800/60 last:border-0">
                      <td className="py-3 pr-3">
                        <div className="font-medium">{c.nombre_empresa}</div>
                        <div className="text-xs text-gray-400">
                          <span className="font-mono">{c.username}</span>{c.email ? ` · ${c.email}` : ''}
                        </div>
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
                              {!esVideo && (
                                <>
                                  <IconBtn title="Iniciar / al aire" onClick={() => accion(c, 'iniciar')} hover="brand"><IconPlay width={14} height={14} /></IconBtn>
                                  <IconBtn title="Parar transmisión" onClick={() => accion(c, 'parar')} hover="amber"><IconStop width={13} height={13} /></IconBtn>
                                  {suspendido ? (
                                    <IconBtn title="Reactivar" onClick={() => accion(c, 'reactivar')} hover="brand"><IconPower width={14} height={14} /></IconBtn>
                                  ) : (
                                    <IconBtn title="Suspender" onClick={() => accion(c, 'suspender', `¿Suspender a "${c.nombre_empresa}"? Se apaga su radio y no podrá entrar.`)} hover="red"><IconPower width={14} height={14} /></IconBtn>
                                  )}
                                  <IconBtn title="Re-aplicar límites del plan" onClick={() => reaplicarPlan(c)} hover="brand"><IconSliders width={14} height={14} /></IconBtn>
                                  <IconBtn title="Agregar música de cortesía" onClick={() => agregarBiblioteca(c)} hover="brand"><IconMusic width={14} height={14} /></IconBtn>
                                </>
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

      {/* Modal crear cliente/radio */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={T.tituloModal}>
        <form onSubmit={crear} className="space-y-3">
          {planesTipo.length === 0 && (
            <div className="text-sm rounded-xl px-3 py-2 text-amber-700 bg-amber-50 dark:bg-amber-500/10">
              No hay planes de {esVideo ? 'video' : 'audio'} todavía. Crea uno en <b>Planes</b> para poder dar de alta {esVideo ? 'canales' : 'radios'}.
            </div>
          )}
          <div>
            <label className="label">{T.nombreLabel}</label>
            <input className="input" value={form.nombre_empresa} onChange={setNombre} placeholder={T.ph} required />
          </div>
          <div>
            <label className="label">Usuario de acceso</label>
            <input className="input font-mono" value={form.username} onChange={setUsername} placeholder="rockfm" required />
            <p className="text-xs text-gray-400 mt-1">Con esto entra al panel. Debe ser único; el email puede repetirse (un mismo cliente puede tener varias radios).</p>
          </div>
          <div>
            <label className="label">Email de contacto del cliente</label>
            <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="dueno@radio.com" required />
          </div>
          <div>
            <label className="label">Contraseña temporal</label>
            <input className="input" value={form.password} onChange={set('password')} placeholder="temporal123" required />
          </div>
          <div>
            <label className="label">Plan</label>
            <select className="input" value={form.plan_id} onChange={set('plan_id')} required>
              {planesTipo.map((p) => (
                <option key={p.id} value={p.id}>
                  {esVideo
                    ? `${p.nombre} · ${p.max_resolucion || '720p'} · ${p.espacio_mb ? Math.round(p.espacio_mb / 1024) + ' GB' : ''}`
                    : `${p.nombre} · ${p.max_bitrate || '∞'} kbps · ${p.max_oyentes} oyentes`}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-gray-400">Se creará su estación en AzuraCast con los límites del plan y quedará al aire.</p>
          {msg && msg.type === 'err' && (
            <div className="text-sm rounded-xl px-3 py-2 text-red-600 bg-red-50 dark:bg-red-500/10">{msg.text}</div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-ghost flex-1">Cancelar</button>
            <button className="btn-primary flex-1" disabled={saving}>
              <IconPlus width={16} height={16} /> {saving ? 'Creando…' : 'Crear radio'}
            </button>
          </div>
        </form>
      </Modal>

      {msg && msg.type === 'ok' && (
        <div className="fixed bottom-5 right-5 z-50 text-sm rounded-xl px-4 py-3 shadow-lg text-white bg-brand-600">
          {msg.text}
        </div>
      )}
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
