import { useEffect, useRef, useState } from 'react';
import { apiFetch, apiUpload } from '../../api';
import { IconPlus, IconTrash } from '../../icons';

const VACIA = { nombre: '', tipo: 'audio', horas: ['08:00'], activo: true };

export default function ClienteCunas() {
  const [lista, setLista] = useState(undefined);
  const [form, setForm] = useState(null);   // cuña en edición (o null)
  const [msg, setMsg] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const fileRef = useRef(null);

  const cargar = () => apiFetch('/cliente/cunas').then((d) => setLista(d.disponible ? d.cunas : null)).catch(() => setLista(null));
  useEffect(() => { cargar(); }, []);

  function nueva() { setForm({ ...VACIA }); setMsg(null); }
  function editar(c) { setForm({ ...c, texto: c.texto || '', horas: c.horas?.length ? c.horas : ['08:00'] }); setMsg(null); }

  async function guardar() {
    setOcupado(true); setMsg(null);
    try {
      const r = await apiFetch('/cliente/cunas', { method: 'POST', body: JSON.stringify({ ...form, tipo: 'audio' }) });
      // sube el audio si hay archivo pendiente
      const file = fileRef.current?.files?.[0];
      if (file) {
        const fd = new FormData(); fd.append('archivo', file);
        await apiUpload(`/cliente/cunas/${r.id}/audio`, fd);
      } else if (!form.lista) {
        setMsg({ ok: false, text: 'Sube un MP3 para la cuña.' }); setOcupado(false); return;
      }
      setMsg({ ok: true, text: 'Cuña guardada ✅' });
      setForm(null); cargar();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setOcupado(false); }
  }

  async function probar(c) {
    try { const r = await apiFetch(`/cliente/cunas/${c.id}/probar`, { method: 'POST' }); alert(r.message); }
    catch (e) { alert(e.message); }
  }
  async function borrar(c) {
    if (!confirm(`¿Eliminar la cuña "${c.nombre}"?`)) return;
    try { await apiFetch(`/cliente/cunas/${c.id}`, { method: 'DELETE' }); cargar(); } catch (e) { alert(e.message); }
  }

  const setHora = (i, v) => setForm((f) => ({ ...f, horas: f.horas.map((h, j) => (j === i ? v : h)) }));
  const addHora = () => setForm((f) => ({ ...f, horas: [...f.horas, '12:00'] }));
  const delHora = (i) => setForm((f) => ({ ...f, horas: f.horas.filter((_, j) => j !== i) }));

  if (lista === undefined) return <p className="py-10 text-center text-gray-400">Cargando…</p>;
  if (lista === null) return <div className="card p-8 text-center text-gray-400">Tu radio aún no está lista para cuñas.</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold">📣 Cuñas y anuncios programados</h2>
          {!form && <button onClick={nueva} className="btn-primary !py-2 !px-3 text-xs"><IconPlus width={15} height={15} /> Nueva cuña</button>}
        </div>
        <p className="text-xs text-gray-400">Mensajes propios que suenan a horas fijas: promos, ID de la emisora, avisos. Sube tu propio audio (tu locutor) en MP3.</p>
      </div>

      {/* Formulario */}
      {form && (
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold">{form.id ? 'Editar cuña' : 'Nueva cuña'}</h3>

          <div><label className="label">Nombre</label>
            <input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Promo del mediodía" /></div>

          <div><label className="label">Audio (MP3)</label>
            <input ref={fileRef} type="file" accept=".mp3,audio/mpeg" className="text-sm" />
            <p className="text-[11px] text-gray-400 mt-1">{form.lista ? 'Ya tiene un audio. Sube uno para reemplazarlo.' : 'Sube el MP3 con tu locutor.'}</p></div>

          <div>
            <label className="label">¿A qué horas suena?</label>
            <div className="space-y-2">
              {form.horas.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="time" className="input !w-auto text-sm" value={h} onChange={(e) => setHora(i, e.target.value)} />
                  {form.horas.length > 1 && <button onClick={() => delHora(i)} className="text-gray-400 hover:text-red-500" title="Quitar"><IconTrash width={15} height={15} /></button>}
                </div>
              ))}
              <button onClick={addHora} className="text-xs text-brand-600 dark:text-brand-400">＋ agregar hora</button>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} /> Activa
          </label>

          {msg && <div className={`text-sm rounded-xl px-3 py-2 ${msg.ok ? 'text-brand-700 bg-brand-50 dark:bg-brand-500/10 dark:text-brand-400' : 'text-red-600 bg-red-50 dark:bg-red-500/10'}`}>{msg.text}</div>}
          <div className="flex gap-2">
            <button onClick={() => setForm(null)} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={guardar} disabled={ocupado} className="btn-primary flex-1">{ocupado ? 'Guardando…' : 'Guardar cuña'}</button>
          </div>
        </div>
      )}

      {/* Lista */}
      {!form && (
        <div className="card p-5">
          {lista.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Aún no tienes cuñas. Crea la primera.</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {lista.map((c) => (
                <div key={c.id} className="flex items-center gap-3 py-3">
                  <span className={`w-2 h-2 rounded-full ${c.activo ? 'bg-brand-500' : 'bg-gray-300 dark:bg-gray-700'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.nombre}</div>
                    <div className="text-xs text-gray-400">{c.tipo === 'audio' ? '🎙️ audio' : '🗣️ voz'} · {(c.horas || []).join(', ') || 'sin horas'}{!c.lista ? ' · ⚠️ sin audio' : ''}</div>
                  </div>
                  <button onClick={() => probar(c)} disabled={!c.lista} className="btn-ghost !py-1.5 !px-2 text-xs disabled:opacity-40" title="Probar">🔊</button>
                  <button onClick={() => editar(c)} className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-brand-500">Editar</button>
                  <button onClick={() => borrar(c)} title="Eliminar" className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 dark:border-gray-800 hover:border-red-400 hover:text-red-500"><IconTrash width={15} height={15} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
