import { useState } from 'react';
import { apiFetch } from '../../api';
import { useAuth } from '../../auth';
import { IconSettings } from '../../icons';

export default function AdminConfiguracion() {
  const { user } = useAuth();
  const [form, setForm] = useState({ actual: '', nueva: '', repetir: '' });
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function cambiar(e) {
    e.preventDefault();
    setMsg(null);
    if (form.nueva.length < 8) return setMsg({ type: 'err', text: 'La nueva contraseña debe tener al menos 8 caracteres.' });
    if (form.nueva !== form.repetir) return setMsg({ type: 'err', text: 'La nueva contraseña y su repetición no coinciden.' });
    setSaving(true);
    try {
      await apiFetch('/admin/password', { method: 'POST', body: JSON.stringify({ actual: form.actual, nueva: form.nueva }) });
      setMsg({ type: 'ok', text: '✅ Contraseña actualizada.' });
      setForm({ actual: '', nueva: '', repetir: '' });
    } catch (err) { setMsg({ type: 'err', text: err.message }); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-lg font-bold flex items-center gap-2"><IconSettings width={20} height={20} /> Configuración</h1>

      {/* Cuenta del super admin */}
      <div className="card p-5">
        <h2 className="font-semibold mb-1">Cuenta de super admin</h2>
        <p className="text-sm text-gray-400 mb-4">{user?.email || 'Administrador'}</p>
        <form onSubmit={cambiar} className="space-y-3">
          <div>
            <label className="label">Contraseña actual</label>
            <input type="password" className="input" value={form.actual} onChange={set('actual')} autoComplete="current-password" required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Nueva contraseña</label>
              <input type="password" className="input" value={form.nueva} onChange={set('nueva')} autoComplete="new-password" required />
            </div>
            <div>
              <label className="label">Repetir nueva</label>
              <input type="password" className="input" value={form.repetir} onChange={set('repetir')} autoComplete="new-password" required />
            </div>
          </div>
          {msg && <div className={`text-sm rounded-xl px-3 py-2 ${msg.type === 'ok' ? 'text-brand-700 bg-brand-50 dark:bg-brand-500/10 dark:text-brand-400' : 'text-red-600 bg-red-50 dark:bg-red-500/10'}`}>{msg.text}</div>}
          <button className="btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Cambiar contraseña'}</button>
        </form>
      </div>

      {/* Opciones futuras */}
      <div className="card p-5 opacity-70">
        <h2 className="font-semibold mb-1 flex items-center gap-2">
          Marca y preferencias
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400">pronto</span>
        </h2>
        <p className="text-sm text-gray-400">Nombre comercial, logo, colores y datos de contacto que verán los clientes. Se activará más adelante.</p>
      </div>
    </div>
  );
}
