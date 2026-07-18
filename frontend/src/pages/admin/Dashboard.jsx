import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../api';
import { useAuth } from '../../auth';
import StatCard from '../../components/StatCard';
import ServerStats from '../../components/ServerStats';
import Player from '../../components/Player';
import { IconUsers, IconRadio, IconChart, IconPlus, IconTrash, IconEnter, IconRefresh } from '../../icons';

export default function AdminDashboard() {
  const { impersonate } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Formulario nuevo cliente
  const [form, setForm] = useState({ nombre_empresa: '', email: '', password: '', plan: 'basico' });
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  async function cargar() {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([apiFetch('/admin/estadisticas'), apiFetch('/admin/clientes')]);
      setStats(s);
      setClientes(c.clientes);
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  async function crear(e) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await apiFetch('/admin/clientes/crear', { method: 'POST', body: JSON.stringify(form) });
      setMsg({ type: 'ok', text: '✅ Cliente creado' });
      setForm({ nombre_empresa: '', email: '', password: '', plan: 'basico' });
      cargar();
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setSaving(false);
    }
  }

  async function eliminar(c) {
    if (!confirm(`¿Eliminar el cliente "${c.nombre_empresa}"? No se puede deshacer.`)) return;
    try {
      await apiFetch('/admin/clientes/' + c.id, { method: 'DELETE' });
      cargar();
    } catch (e) {
      alert(e.message);
    }
  }

  async function entrarPanel(c) {
    try {
      await impersonate(c.id);
      navigate('/cliente', { replace: true });
    } catch (e) {
      alert(e.message);
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Estación seleccionada para monitorear (escuchar) desde el admin
  const [monitorId, setMonitorId] = useState('');
  const conStream = clientes.filter((c) => c.url_streaming);
  const monitor = conStream.find((c) => String(c.id) === String(monitorId)) || conStream[0];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Clientes" value={stats?.total_clientes ?? '–'} icon={IconUsers} color="brand"
          hint={`${stats?.clientes_activos ?? 0} activos`} />
        <StatCard label="Estaciones" value={stats?.estaciones ?? '–'} icon={IconRadio} color="blue"
          hint="en AzuraCast" />
        <StatCard label="Oyentes" value={stats?.oyentes_totales ?? 0} icon={IconChart} color="violet"
          hint="en vivo" />
      </div>

      {/* Monitoreo: VPS + player para escuchar cualquier estación */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ServerStats />
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2"><IconRadio width={18} height={18} /> Monitor de radio</h2>
            {conStream.length > 0 && (
              <select
                className="input !w-auto !py-1.5 text-sm"
                value={monitor?.id || ''}
                onChange={(e) => setMonitorId(e.target.value)}
              >
                {conStream.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre_empresa}</option>
                ))}
              </select>
            )}
          </div>
          {monitor ? (
            <Player src={monitor.url_streaming} title={monitor.nombre_empresa} subtitle="Monitoreando" />
          ) : (
            <p className="text-sm text-gray-400">Ninguna estación con stream disponible aún.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tabla clientes */}
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Clientes</h2>
            <button onClick={cargar} className="btn-ghost !py-2 !px-3 text-xs">
              <IconRefresh width={15} height={15} /> Actualizar
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100 dark:border-gray-800">
                  <th className="py-2.5 pr-3 font-medium">Empresa</th>
                  <th className="py-2.5 px-3 font-medium">Email</th>
                  <th className="py-2.5 px-3 font-medium">Plan</th>
                  <th className="py-2.5 px-3 font-medium">Estado</th>
                  <th className="py-2.5 pl-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="5" className="py-8 text-center text-gray-400">Cargando…</td></tr>
                ) : clientes.length === 0 ? (
                  <tr><td colSpan="5" className="py-8 text-center text-gray-400">Sin clientes todavía</td></tr>
                ) : (
                  clientes.map((c) => (
                    <tr key={c.id} className="border-b border-gray-50 dark:border-gray-800/60 last:border-0">
                      <td className="py-3 pr-3 font-medium">{c.nombre_empresa}</td>
                      <td className="py-3 px-3 text-gray-500">{c.email}</td>
                      <td className="py-3 px-3 capitalize">{c.plan}</td>
                      <td className="py-3 px-3">
                        {c.activo
                          ? <span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">Activo</span>
                          : <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 dark:bg-red-500/10">Inactivo</span>}
                      </td>
                      <td className="py-3 pl-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => entrarPanel(c)} title="Entrar al panel del cliente"
                            className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 dark:border-gray-800 hover:border-brand-500 hover:text-brand-600 transition">
                            <IconEnter width={15} height={15} />
                          </button>
                          <button onClick={() => eliminar(c)} title="Eliminar"
                            className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 dark:border-gray-800 hover:border-red-400 hover:text-red-500 transition">
                            <IconTrash width={15} height={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
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
              <select className="input" value={form.plan} onChange={set('plan')}>
                <option value="basico">Básico</option>
                <option value="profesional">Profesional</option>
                <option value="premium">Premium</option>
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
    </div>
  );
}
