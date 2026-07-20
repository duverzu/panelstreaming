import { useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import { IconRadio, IconMic, IconSettings } from '../../icons';

const TIMEZONES = [
  'UTC', 'America/Bogota', 'America/Mexico_City', 'America/Lima', 'America/Argentina/Buenos_Aires',
  'America/Santiago', 'America/Caracas', 'America/New_York', 'Europe/Madrid',
];

export default function ClienteConfiguracion() {
  const [c, setC] = useState(null);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  // cuenta
  const [pass, setPass] = useState({ actual: '', nueva: '' });
  const [passMsg, setPassMsg] = useState(null);
  // dj
  const [djMsg, setDjMsg] = useState(null);

  useEffect(() => {
    apiFetch('/cliente/configuracion').then((d) => setC(d.config)).catch(() => {});
  }, []);

  async function guardarRadio(e) {
    e.preventDefault();
    setSaving(true); setMsg(null);
    try {
      await apiFetch('/cliente/configuracion', { method: 'PUT', body: JSON.stringify(c) });
      setMsg({ type: 'ok', text: '✅ Guardado' });
    } catch (err) {
      setMsg({ type: 'err', text: err.message });
    } finally { setSaving(false); }
  }

  async function cambiarPass(e) {
    e.preventDefault();
    setPassMsg(null);
    try {
      await apiFetch('/cliente/cuenta/password', { method: 'PUT', body: JSON.stringify(pass) });
      setPassMsg({ type: 'ok', text: '✅ Contraseña actualizada' });
      setPass({ actual: '', nueva: '' });
    } catch (err) {
      setPassMsg({ type: 'err', text: err.message });
    }
  }

  async function regenerarDj() {
    if (!confirm('¿Generar una nueva contraseña de DJ? La anterior dejará de funcionar.')) return;
    setDjMsg(null);
    try {
      const r = await apiFetch('/cliente/dj/regenerar', { method: 'POST' });
      setDjMsg({ type: 'ok', text: `✅ Nueva contraseña: ${r.password}` });
    } catch (err) {
      setDjMsg({ type: 'err', text: err.message });
    }
  }

  if (!c) return <p className="py-10 text-center text-gray-400">Cargando…</p>;

  const set = (k) => (e) => setC({ ...c, [k]: e.target.value });
  const M = ({ m }) => m ? <div className={`text-sm rounded-xl px-3 py-2 ${m.type === 'ok' ? 'text-brand-700 bg-brand-50 dark:bg-brand-500/10 dark:text-brand-400' : 'text-red-600 bg-red-50 dark:bg-red-500/10'}`}>{m.text}</div> : null;

  return (
    <div className="max-w-2xl space-y-6">
      {/* Mi radio */}
      {!c.sin_estacion && (
        <form onSubmit={guardarRadio} className="card p-5 space-y-4">
          <h2 className="font-semibold flex items-center gap-2"><IconRadio width={18} height={18} /> Mi radio</h2>
          <div>
            <label className="label">Nombre de la radio</label>
            <input className="input" value={c.nombre || ''} onChange={set('nombre')} />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea className="input" rows="2" value={c.descripcion || ''} onChange={set('descripcion')} placeholder="Cuéntale a tus oyentes de qué va tu radio" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Género</label>
              <input className="input" value={c.genero || ''} onChange={set('genero')} placeholder="Pop, Rock, Salsa…" />
            </div>
            <div>
              <label className="label">Sitio web</label>
              <input className="input" value={c.sitio_web || ''} onChange={set('sitio_web')} placeholder="https://…" />
            </div>
            <div>
              <label className="label">Zona horaria</label>
              <select className="input" value={c.timezone || 'UTC'} onChange={set('timezone')}>
                {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex items-end gap-4 pb-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={!!c.pagina_publica} onChange={(e) => setC({ ...c, pagina_publica: e.target.checked })} />
                Página pública
              </label>
            </div>
          </div>
          {c.url_publica && (
            <p className="text-xs text-gray-400">Página pública: <a href={c.url_publica} target="_blank" rel="noreferrer" className="text-brand-600 underline break-all">{c.url_publica}</a></p>
          )}
          <M m={msg} />
          <button className="btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </form>
      )}

      {/* DJ en vivo */}
      {!c.sin_estacion && (
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold flex items-center gap-2"><IconMic width={18} height={18} /> DJ en vivo</h2>
          <p className="text-sm text-gray-400">Genera una nueva contraseña para conectar tu software de transmisión.</p>
          <M m={djMsg} />
          <button onClick={regenerarDj} className="btn-ghost">Regenerar contraseña de DJ</button>
        </div>
      )}

      {/* Cuenta */}
      <form onSubmit={cambiarPass} className="card p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><IconSettings width={18} height={18} /> Cuenta</h2>
        <div className="text-sm text-gray-400">Usuario: <b className="text-gray-700 dark:text-gray-200 font-mono">{c.username}</b> · Email: <b className="text-gray-700 dark:text-gray-200">{c.email}</b> · Plan: <b className="text-gray-700 dark:text-gray-200 capitalize">{c.plan}</b></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Contraseña actual</label>
            <input className="input" type="password" value={pass.actual} onChange={(e) => setPass({ ...pass, actual: e.target.value })} required />
          </div>
          <div>
            <label className="label">Nueva contraseña</label>
            <input className="input" type="password" value={pass.nueva} onChange={(e) => setPass({ ...pass, nueva: e.target.value })} required />
          </div>
        </div>
        <M m={passMsg} />
        <button className="btn-primary">Cambiar contraseña</button>
      </form>
    </div>
  );
}
