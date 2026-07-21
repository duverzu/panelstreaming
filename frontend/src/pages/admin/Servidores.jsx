import { useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import Modal from '../../components/Modal';
import { IconPlus, IconTrash, IconServer, IconRefresh } from '../../icons';

export default function AdminServidores() {
  const [servidores, setServidores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ nombre: '', url: '', url_publica: '', api_key: '', capacidad_radios: 100, banda_mensual_gb: 0, tipo: 'audio' });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function cargar() {
    setLoading(true);
    try { const { servidores } = await apiFetch('/admin/servidores'); setServidores(servidores); }
    finally { setLoading(false); }
  }
  useEffect(() => { cargar(); }, []);

  function abrirCrear() { setEditId(null); setForm({ nombre: '', url: '', url_publica: '', api_key: '', capacidad_radios: 100, banda_mensual_gb: 0, tipo: 'audio' }); setError(null); setOpen(true); }
  function abrirEditar(s) { setEditId(s.id); setForm({ nombre: s.nombre, url: s.url, url_publica: s.url_publica || '', tipo: s.tipo || 'audio', api_key: '', capacidad_radios: s.capacidad_radios, banda_mensual_gb: s.banda_mensual_gb || 0 }); setError(null); setOpen(true); }

  async function guardar(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const payload = { nombre: form.nombre, url: form.url, url_publica: form.url_publica, tipo: form.tipo, capacidad_radios: Number(form.capacidad_radios), banda_mensual_gb: Number(form.banda_mensual_gb) };
      if (form.api_key) payload.api_key = form.api_key;
      if (editId) await apiFetch('/admin/servidores/' + editId, { method: 'PUT', body: JSON.stringify(payload) });
      else await apiFetch('/admin/servidores', { method: 'POST', body: JSON.stringify(payload) });
      setOpen(false); cargar();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function toggle(s) {
    try { await apiFetch('/admin/servidores/' + s.id, { method: 'PUT', body: JSON.stringify({ activo: !s.activo }) }); cargar(); }
    catch (e) { alert(e.message); }
  }
  async function eliminar(s) {
    if (!confirm(`¿Eliminar el servidor "${s.nombre}"? Sus radios quedarán apuntando al servidor por defecto.`)) return;
    try { await apiFetch('/admin/servidores/' + s.id, { method: 'DELETE' }); cargar(); }
    catch (e) { alert(e.message); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2"><IconServer width={18} height={18} /> Servidores AzuraCast <span className="text-gray-400 font-normal">({servidores.length})</span></h2>
        <div className="flex items-center gap-2">
          <button onClick={cargar} className="btn-ghost !py-2 !px-3 text-xs"><IconRefresh width={15} height={15} /> Actualizar</button>
          <button onClick={abrirCrear} className="btn-primary !py-2 !px-3 text-xs"><IconPlus width={15} height={15} /> Agregar servidor</button>
        </div>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-gray-400">Cargando…</div>
      ) : servidores.length === 0 ? (
        <div className="card p-8 text-center text-gray-400">Aún no hay servidores. Las radios usan el servidor por defecto del sistema.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {servidores.map((s) => {
            const pct = Math.min(100, Math.round((s.radios / (s.capacidad_radios || 1)) * 100));
            return (
              <div key={s.id} className="card p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold flex items-center gap-2">
                      {s.nombre}
                      {s.activo
                        ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">Activo</span>
                        : <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400">Pausado</span>}
                    </div>
                    <div className="text-xs text-gray-400 break-all">
                      <span className="mr-1.5">{s.tipo === 'video' ? '🎬 Video' : '🎵 Audio'}</span>· {s.url}
                    </div>
                    {s.url_publica && <div className="text-xs text-brand-600 dark:text-brand-400 break-all">🌐 público: {s.url_publica}</div>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => abrirEditar(s)} className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-brand-500 hover:text-brand-600 transition">Editar</button>
                    <button onClick={() => toggle(s)} className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-amber-400 hover:text-amber-500 transition">{s.activo ? 'Pausar' : 'Activar'}</button>
                    <button onClick={() => eliminar(s)} title="Eliminar" className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 dark:border-gray-800 hover:border-red-400 hover:text-red-500 transition"><IconTrash width={15} height={15} /></button>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-gray-500 dark:text-gray-400">Radios</span>
                    <span className="font-semibold tabular-nums">{s.radios} / {s.capacidad_radios}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    <div className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-brand-500'}`} style={{ width: pct + '%' }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-400">Las radios nuevas se crean automáticamente en el servidor activo con más espacio libre.</p>

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Editar servidor' : 'Agregar servidor'}>
        <form onSubmit={guardar} className="space-y-3">
          <div><label className="label">Nombre</label><input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nodo 2" required /></div>
          <div>
            <label className="label">Tipo de servicio</label>
            <select className="input" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              <option value="audio">🎵 Audio — radios</option>
              <option value="video">🎬 Video — streaming de video</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">Las cuentas se crean en el servidor que corresponde a su plan.</p>
          </div>
          <div><label className="label">URL de AzuraCast</label><input className="input" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://server3.streaminghd.co" required />
            <p className="text-xs text-gray-400 mt-1">Solo la usa el panel para hablar con la API. No se le muestra al cliente.</p></div>
          <div>
            <label className="label">URL pública (marca blanca)</label>
            <input className="input" value={form.url_publica} onChange={(e) => setForm({ ...form, url_publica: e.target.value })} placeholder="https://stream.streaminghd.co" />
            <p className="text-xs text-gray-400 mt-1">La que ve el cliente para escuchar y conectar su encoder. Déjala vacía para usar la de arriba. Al cambiarla se reescriben las URLs de las radios existentes.</p>
          </div>
          <div>
            <label className="label">API Key {editId && <span className="text-gray-400">(dejar vacío para no cambiar)</span>}</label>
            <input className="input" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} placeholder="xxxx:yyyy" required={!editId} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Capacidad (radios)</label><input className="input" type="number" min="1" value={form.capacidad_radios} onChange={(e) => setForm({ ...form, capacidad_radios: e.target.value })} /></div>
            <div><label className="label">Banda mensual (GB)</label><input className="input" type="number" min="0" value={form.banda_mensual_gb} onChange={(e) => setForm({ ...form, banda_mensual_gb: e.target.value })} placeholder="Ej: 32000 = 32 TB" /></div>
          </div>
          <p className="text-xs text-gray-400 -mt-1">Banda mensual = el tope de tu VPS en Hostinger (para las alertas del Guardián).</p>
          {error && <div className="text-sm rounded-xl px-3 py-2 text-red-600 bg-red-50 dark:bg-red-500/10">{error}</div>}
          <p className="text-xs text-gray-400">Al guardar se verifica que el servidor responda con esa API key.</p>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost flex-1">Cancelar</button>
            <button className="btn-primary flex-1" disabled={saving}>{saving ? 'Verificando…' : editId ? 'Guardar' : 'Agregar'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
