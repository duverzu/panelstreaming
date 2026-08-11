import { useEffect, useRef, useState } from 'react';
import { apiFetch, apiUpload } from '../../api';
import { IconMusic, IconTrash, IconPlus, IconRefresh } from '../../icons';

export default function ClienteMusica() {
  const [media, setMedia] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [destino, setDestino] = useState(''); // playlist destino de la subida
  const [msg, setMsg] = useState(null);
  const [sel, setSel] = useState(() => new Set());   // canciones seleccionadas (para lote)
  const [aplicando, setAplicando] = useState(false);
  const inputRef = useRef(null);
  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState('recientes');
  const [pagina, setPagina] = useState(0);

  // Filtrado + orden + paginación (client-side): la página va fluida aunque
  // el cliente tenga miles de canciones.
  const q = busqueda.trim().toLowerCase();
  const filtradas = media
    .filter((m) => !q || (m.titulo || '').toLowerCase().includes(q) || (m.artista || '').toLowerCase().includes(q))
    .slice()
    .sort((a, b) => {
      if (orden === 'titulo') return (a.titulo || '').localeCompare(b.titulo || '', 'es', { numeric: true });
      if (orden === 'artista') return (a.artista || '').localeCompare(b.artista || '', 'es', { numeric: true });
      return (b.id || 0) - (a.id || 0);   // recientes (id más alto = subido después)
    });
  const POR_PAGINA = 50;
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const pag = Math.min(pagina, totalPaginas - 1);
  const paginadas = filtradas.slice(pag * POR_PAGINA, (pag + 1) * POR_PAGINA);

  function toggle(id) {
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleTodos() {
    setSel((s) => (s.size >= filtradas.length && filtradas.length > 0 ? new Set() : new Set(filtradas.map((m) => m.id))));
  }

  /** Agrega o quita una playlist a las canciones seleccionadas (o a todas). */
  async function aplicarLote(playlist_id, accion, todas = false) {
    if (!playlist_id) return;
    setAplicando(true); setMsg(null);
    try {
      const body = { playlist_id: Number(playlist_id), accion };
      if (!todas) body.media_ids = [...sel];
      const r = await apiFetch('/cliente/media/playlists-lote', { method: 'PUT', body: JSON.stringify(body) });
      setMsg({ type: 'ok', text: r.message });
      setSel(new Set());
      cargar();
    } catch (e) { setMsg({ type: 'err', text: e.message }); }
    finally { setAplicando(false); }
  }

  async function cargar() {
    setLoading(true);
    try {
      const [m, p] = await Promise.all([apiFetch('/cliente/media'), apiFetch('/cliente/playlists')]);
      setMedia(m.media);
      setPlaylists(p.playlists);
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { cargar(); }, []);

  async function setPlaylistsDe(m, nuevosIds) {
    try {
      await apiFetch(`/cliente/media/${m.id}/playlists`, {
        method: 'PUT', body: JSON.stringify({ playlist_ids: nuevosIds }),
      });
      cargar();
    } catch (e) { alert(e.message); }
  }
  const agregarA = (m, plId) => setPlaylistsDe(m, [...m.playlists.map((p) => p.id), Number(plId)]);
  const quitarDe = (m, plId) => setPlaylistsDe(m, m.playlists.filter((p) => p.id !== plId).map((p) => p.id));

  async function subir(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setMsg(null);
    setSubiendo(true);
    let ok = 0;
    for (const file of files) {
      try {
        const fd = new FormData();
        fd.append('archivo', file);
        if (destino) fd.append('playlist_id', destino);
        await apiUpload('/cliente/media/subir', fd);
        ok++;
      } catch (err) {
        setMsg({ type: 'err', text: `${file.name}: ${err.message}` });
      }
    }
    setSubiendo(false);
    if (ok) setMsg({ type: 'ok', text: `✅ ${ok} canción(es) subida(s)` });
    if (inputRef.current) inputRef.current.value = '';
    cargar();
  }

  async function eliminar(m) {
    if (!confirm(`¿Eliminar "${m.titulo}"?`)) return;
    try { await apiFetch('/cliente/media/' + m.id, { method: 'DELETE' }); cargar(); }
    catch (e) { alert(e.message); }
  }

  return (
    <div className="space-y-6">
      {/* Zona de subida */}
      <div className="card p-6">
        {playlists.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-gray-500">Subir a:</span>
            <select value={destino} onChange={(e) => setDestino(e.target.value)}
              className="input !w-auto !py-1.5 text-sm">
              <option value="">Playlist principal (default)</option>
              {playlists.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
        )}
        <div
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl p-8 text-center cursor-pointer hover:border-brand-500 transition"
        >
          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 grid place-items-center">
            <IconPlus width={24} height={24} />
          </div>
          <div className="font-medium">{subiendo ? 'Subiendo…' : 'Haz clic para subir música'}</div>
          <div className="text-xs text-gray-400 mt-1">Archivos MP3 · puedes seleccionar varios</div>
          <input ref={inputRef} type="file" accept=".mp3,audio/mpeg" multiple hidden onChange={subir} disabled={subiendo} />
        </div>
        {msg && (
          <div className={`mt-3 text-sm rounded-xl px-3 py-2 ${msg.type === 'ok'
            ? 'text-brand-700 bg-brand-50 dark:bg-brand-500/10 dark:text-brand-400'
            : 'text-red-600 bg-red-50 dark:bg-red-500/10'}`}>
            {msg.text}
          </div>
        )}
      </div>

      {/* Lista de canciones */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2">
            <IconMusic width={18} height={18} /> Mi música <span className="text-gray-400 font-normal">({q ? `${filtradas.length} de ${media.length}` : media.length})</span>
          </h2>
          <button onClick={cargar} className="btn-ghost !py-2 !px-3 text-xs">
            <IconRefresh width={15} height={15} /> Actualizar
          </button>
        </div>

        {/* Buscador + orden — para librerías grandes */}
        {media.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setPagina(0); }}
              placeholder="🔍 Buscar por título o artista…" className="input !py-2 text-sm flex-1 min-w-[180px]" />
            <select value={orden} onChange={(e) => setOrden(e.target.value)} className="input !w-auto !py-2 text-sm">
              <option value="recientes">Recientes</option>
              <option value="titulo">Título A-Z</option>
              <option value="artista">Artista A-Z</option>
            </select>
          </div>
        )}

        {/* Barra de acciones en lote — evita ir pista por pista */}
        {media.length > 0 && playlists.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-3 p-2.5 rounded-xl bg-gray-50 dark:bg-gray-950 text-sm">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={sel.size >= filtradas.length && filtradas.length > 0} onChange={toggleTodos} />
              <span className="text-gray-500">{sel.size ? `${sel.size} seleccionada(s)` : (q ? `Seleccionar los ${filtradas.length} filtrados` : 'Seleccionar todo')}</span>
            </label>

            {sel.size > 0 ? (
              <>
                <select disabled={aplicando} value="" onChange={(e) => { aplicarLote(e.target.value, 'agregar'); e.target.value = ''; }}
                  className="input !w-auto !py-1 text-xs">
                  <option value="">＋ Agregar a playlist…</option>
                  {playlists.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                <select disabled={aplicando} value="" onChange={(e) => { aplicarLote(e.target.value, 'quitar'); e.target.value = ''; }}
                  className="input !w-auto !py-1 text-xs">
                  <option value="">− Quitar de playlist…</option>
                  {playlists.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </>
            ) : (
              <select disabled={aplicando} value="" onChange={(e) => { aplicarLote(e.target.value, 'agregar', true); e.target.value = ''; }}
                className="input !w-auto !py-1 text-xs ml-auto">
                <option value="">⚡ Agregar TODA mi música a…</option>
                {playlists.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            )}
            {aplicando && <span className="text-xs text-gray-400">Aplicando…</span>}
          </div>
        )}

        {loading ? (
          <p className="py-8 text-center text-gray-400">Cargando…</p>
        ) : media.length === 0 ? (
          <p className="py-8 text-center text-gray-400">Aún no has subido música. ¡Sube tu primer MP3!</p>
        ) : filtradas.length === 0 ? (
          <p className="py-8 text-center text-gray-400">Ninguna canción coincide con «{busqueda}».</p>
        ) : (
          <>
          <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
            {paginadas.map((m) => (
              <div key={m.id} className={`flex items-center gap-3 py-3 ${sel.has(m.id) ? 'bg-brand-50/40 dark:bg-brand-500/5 -mx-2 px-2 rounded-lg' : ''}`}>
                <input type="checkbox" checked={sel.has(m.id)} onChange={() => toggle(m.id)} className="shrink-0" />
                <div className="w-9 h-9 shrink-0 rounded-lg bg-gray-100 dark:bg-gray-800 grid place-items-center text-gray-400">
                  <IconMusic width={16} height={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{m.titulo}</div>
                  <div className="text-xs text-gray-400 truncate">
                    {m.artista || 'Sin artista'}{m.duracion ? ` · ${m.duracion}` : ''}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {m.playlists.map((p) => (
                      <span key={p.id} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">
                        {p.nombre}
                        <button onClick={() => quitarDe(m, p.id)} className="hover:text-red-500" title="Quitar">×</button>
                      </span>
                    ))}
                    {playlists.filter((pl) => !m.playlists.some((mp) => mp.id === pl.id)).length > 0 && (
                      <select value="" onChange={(e) => e.target.value && agregarA(m, e.target.value)}
                        className="text-[10px] bg-transparent border border-gray-200 dark:border-gray-800 rounded-full px-2 py-0.5 text-gray-500 outline-none cursor-pointer">
                        <option value="">＋ playlist</option>
                        {playlists.filter((pl) => !m.playlists.some((mp) => mp.id === pl.id)).map((pl) => (
                          <option key={pl.id} value={pl.id}>{pl.nombre}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
                <button onClick={() => eliminar(m)} title="Eliminar"
                  className="w-8 h-8 shrink-0 grid place-items-center rounded-lg border border-gray-200 dark:border-gray-800 hover:border-red-400 hover:text-red-500 transition">
                  <IconTrash width={15} height={15} />
                </button>
              </div>
            ))}
          </div>
          {totalPaginas > 1 && (
            <div className="flex items-center justify-center gap-3 mt-4 text-sm">
              <button onClick={() => setPagina((n) => Math.max(0, n - 1))} disabled={pag === 0} className="btn-ghost !py-1.5 !px-3 text-xs disabled:opacity-40">‹ Anterior</button>
              <span className="text-gray-400">Página {pag + 1} de {totalPaginas}</span>
              <button onClick={() => setPagina((n) => Math.min(totalPaginas - 1, n + 1))} disabled={pag >= totalPaginas - 1} className="btn-ghost !py-1.5 !px-3 text-xs disabled:opacity-40">Siguiente ›</button>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}
