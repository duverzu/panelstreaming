import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../api';
import Markdown from '../../components/Markdown';
import { IconPlus, IconTrash } from '../../icons';

const VACIO = { titulo: '', categoria: 'General', contenido: '', orden: 0, publicado: true };

export default function AdminDocumentacion() {
  const [docs, setDocs] = useState([]);
  const [editId, setEditId] = useState(null); // null = ninguno; 'nuevo' = crear
  const [form, setForm] = useState(VACIO);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const areaRef = useRef(null);
  const fileRef = useRef(null);

  async function cargar() {
    const { docs } = await apiFetch('/admin/docs');
    setDocs(docs);
  }
  useEffect(() => { cargar(); }, []);

  function nuevo() { setEditId('nuevo'); setForm(VACIO); setPreview(false); setMsg(null); }
  async function editar(id) {
    const { doc } = await apiFetch('/admin/docs/' + id);
    setForm({ titulo: doc.titulo, categoria: doc.categoria, contenido: doc.contenido, orden: doc.orden, publicado: doc.publicado });
    setEditId(id); setPreview(false); setMsg(null);
  }

  async function guardar(e) {
    e.preventDefault();
    setSaving(true); setMsg(null);
    try {
      if (editId === 'nuevo') { const { doc } = await apiFetch('/admin/docs', { method: 'POST', body: JSON.stringify(form) }); setEditId(doc.id); }
      else await apiFetch('/admin/docs/' + editId, { method: 'PUT', body: JSON.stringify(form) });
      setMsg({ type: 'ok', text: '✅ Guardado' });
      cargar();
    } catch (err) { setMsg({ type: 'err', text: err.message }); }
    finally { setSaving(false); }
  }

  async function eliminar(id, titulo) {
    if (!confirm(`¿Eliminar "${titulo}"?`)) return;
    await apiFetch('/admin/docs/' + id, { method: 'DELETE' });
    if (editId === id) setEditId(null);
    cargar();
  }

  // Insertar imagen (captura) como data URI en el cursor del textarea
  function insertarImagen(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('La imagen es muy grande (máx 2 MB).'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const md = `\n![captura](${reader.result})\n`;
      const ta = areaRef.current;
      const pos = ta ? ta.selectionStart : form.contenido.length;
      const nuevo = form.contenido.slice(0, pos) + md + form.contenido.slice(pos);
      setForm((f) => ({ ...f, contenido: nuevo }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
      {/* Lista */}
      <div className="card p-4 h-fit">
        <button onClick={nuevo} className="btn-primary w-full text-sm mb-3"><IconPlus width={15} height={15} /> Nuevo artículo</button>
        <div className="space-y-0.5 max-h-[70vh] overflow-y-auto">
          {docs.map((d) => (
            <div key={d.id} className={`flex items-center gap-1 rounded-lg ${editId === d.id ? 'bg-brand-50 dark:bg-brand-500/10' : ''}`}>
              <button onClick={() => editar(d.id)} className="flex-1 text-left text-sm px-2.5 py-2 min-w-0">
                <div className="truncate">{d.titulo} {!d.publicado && <span className="text-[10px] text-amber-500">(borrador)</span>}</div>
                <div className="text-[11px] text-gray-400">{d.categoria}</div>
              </button>
              <button onClick={() => eliminar(d.id, d.titulo)} className="w-7 h-7 grid place-items-center rounded-lg text-gray-400 hover:text-red-500 shrink-0"><IconTrash width={14} height={14} /></button>
            </div>
          ))}
          {docs.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Sin artículos</p>}
        </div>
      </div>

      {/* Editor */}
      {editId == null ? (
        <div className="card p-10 text-center text-gray-400">Selecciona un artículo o crea uno nuevo.</div>
      ) : (
        <form onSubmit={guardar} className="card p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_90px] gap-3">
            <div><label className="label">Título</label><input className="input" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} required /></div>
            <div><label className="label">Categoría</label><input className="input" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} /></div>
            <div><label className="label">Orden</label><input className="input" type="number" value={form.orden} onChange={(e) => setForm({ ...form, orden: Number(e.target.value) })} /></div>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.publicado} onChange={(e) => setForm({ ...form, publicado: e.target.checked })} /> Publicado
            </label>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost !py-1.5 !px-2.5 text-xs">🖼️ Insertar captura</button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={insertarImagen} />
              <button type="button" onClick={() => setPreview((p) => !p)} className="btn-ghost !py-1.5 !px-2.5 text-xs">{preview ? '✏️ Editar' : '👁️ Vista previa'}</button>
            </div>
          </div>

          {preview ? (
            <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-4 min-h-[300px]"><Markdown>{form.contenido}</Markdown></div>
          ) : (
            <div>
              <label className="label">Contenido (Markdown) — usa # títulos, - listas, **negrita**, `código`</label>
              <textarea ref={areaRef} className="input font-mono text-sm !leading-relaxed" rows="18" value={form.contenido} onChange={(e) => setForm({ ...form, contenido: e.target.value })} placeholder="# Título&#10;&#10;Escribe la guía aquí…" />
            </div>
          )}

          {msg && <div className={`text-sm rounded-xl px-3 py-2 ${msg.type === 'ok' ? 'text-brand-700 bg-brand-50 dark:bg-brand-500/10 dark:text-brand-400' : 'text-red-600 bg-red-50 dark:bg-red-500/10'}`}>{msg.text}</div>}
          <button className="btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar artículo'}</button>
        </form>
      )}
    </div>
  );
}
