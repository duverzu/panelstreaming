import { useEffect, useRef, useState } from 'react';
import { apiFetch, apiUpload } from '../../api';
import { IconMusic, IconTrash, IconPlus, IconRefresh } from '../../icons';

export default function ClienteMusica() {
  const [media, setMedia] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [msg, setMsg] = useState(null);
  const inputRef = useRef(null);

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
            <IconMusic width={18} height={18} /> Mi música <span className="text-gray-400 font-normal">({media.length})</span>
          </h2>
          <button onClick={cargar} className="btn-ghost !py-2 !px-3 text-xs">
            <IconRefresh width={15} height={15} /> Actualizar
          </button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-gray-400">Cargando…</p>
        ) : media.length === 0 ? (
          <p className="py-8 text-center text-gray-400">Aún no has subido música. ¡Sube tu primer MP3!</p>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
            {media.map((m) => (
              <div key={m.id} className="flex items-center gap-3 py-3">
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
        )}
      </div>
    </div>
  );
}
