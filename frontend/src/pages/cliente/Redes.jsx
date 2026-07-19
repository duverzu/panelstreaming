import { useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import Modal from '../../components/Modal';
import { IconShare, IconTrash, IconPlus } from '../../icons';

const REDES = {
  discord: { nombre: 'Discord', icon: '💬', campos: [{ k: 'webhook_url', label: 'URL del Webhook', ph: 'https://discord.com/api/webhooks/…' }],
    ayuda: 'En Discord: Ajustes del canal → Integraciones → Webhooks → Nuevo webhook → Copiar URL.' },
  telegram: { nombre: 'Telegram', icon: '✈️', campos: [
      { k: 'bot_token', label: 'Token del Bot', ph: '123456:ABC-DEF…' },
      { k: 'chat_id', label: 'ID del chat / canal', ph: '@micanal o -100123…' }],
    ayuda: 'Crea un bot con @BotFather, agrégalo a tu canal como admin, y usa el token + el @ del canal.' },
};

export default function ClienteRedes() {
  const [redes, setRedes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState('discord');
  const [config, setConfig] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function cargar() {
    setLoading(true);
    try {
      const { redes } = await apiFetch('/cliente/redes');
      setRedes(redes);
    } finally { setLoading(false); }
  }
  useEffect(() => { cargar(); }, []);

  function abrir(t) { setTipo(t); setConfig({}); setError(null); setOpen(true); }

  async function conectar(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await apiFetch('/cliente/redes', { method: 'POST', body: JSON.stringify({ tipo, config }) });
      setOpen(false);
      cargar();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function toggle(r) {
    try { await apiFetch('/cliente/redes/' + r.id, { method: 'PUT', body: JSON.stringify({ activa: !r.activa }) }); cargar(); }
    catch (e) { alert(e.message); }
  }
  async function eliminar(r) {
    if (!confirm(`¿Desconectar ${REDES[r.tipo]?.nombre || r.tipo}?`)) return;
    try { await apiFetch('/cliente/redes/' + r.id, { method: 'DELETE' }); cargar(); }
    catch (e) { alert(e.message); }
  }

  const def = REDES[tipo];

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="card p-5">
        <p className="text-sm text-gray-500 mb-4">
          Conecta tus redes y cada vez que cambie la canción se publicará automáticamente
          <b> "🎵 Ahora suena: Canción – Artista"</b>.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(REDES).map(([t, r]) => (
            <button key={t} onClick={() => abrir(t)}
              className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-brand-500 transition text-left">
              <span className="text-2xl">{r.icon}</span>
              <div>
                <div className="font-medium text-sm">Conectar {r.nombre}</div>
                <div className="text-xs text-gray-400">Auto-post al cambiar canción</div>
              </div>
              <IconPlus width={16} height={16} className="ml-auto text-gray-400" />
            </button>
          ))}
        </div>
      </div>

      {/* Conectadas */}
      <div className="card p-5">
        <h2 className="font-semibold mb-4 flex items-center gap-2"><IconShare width={18} height={18} /> Redes conectadas</h2>
        {loading ? (
          <p className="py-6 text-center text-gray-400">Cargando…</p>
        ) : redes.length === 0 ? (
          <p className="py-6 text-center text-gray-400">Aún no has conectado ninguna red.</p>
        ) : (
          <div className="space-y-2">
            {redes.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                <span className="text-xl">{REDES[r.tipo]?.icon || '🔗'}</span>
                <span className="flex-1 font-medium text-sm">{REDES[r.tipo]?.nombre || r.tipo}</span>
                <button onClick={() => toggle(r)}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition ${r.activa ? 'border-brand-500 text-brand-600' : 'border-gray-200 dark:border-gray-800 text-gray-400'}`}>
                  {r.activa ? 'Activa' : 'Pausada'}
                </button>
                <button onClick={() => eliminar(r)} title="Desconectar"
                  className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 dark:border-gray-800 hover:border-red-400 hover:text-red-500 transition">
                  <IconTrash width={15} height={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={`Conectar ${def?.nombre}`}>
        <form onSubmit={conectar} className="space-y-3">
          {def?.campos.map((c) => (
            <div key={c.k}>
              <label className="label">{c.label}</label>
              <input className="input" value={config[c.k] || ''} placeholder={c.ph}
                onChange={(e) => setConfig({ ...config, [c.k]: e.target.value })} required />
            </div>
          ))}
          <p className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-950 rounded-xl p-3">{def?.ayuda}</p>
          {error && <div className="text-sm rounded-xl px-3 py-2 text-red-600 bg-red-50 dark:bg-red-500/10">{error}</div>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost flex-1">Cancelar</button>
            <button className="btn-primary flex-1" disabled={saving}>{saving ? 'Conectando…' : 'Conectar'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
