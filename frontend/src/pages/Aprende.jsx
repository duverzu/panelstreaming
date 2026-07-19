import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import Markdown from '../components/Markdown';

export default function Aprende() {
  const [docs, setDocs] = useState([]);
  const [sel, setSel] = useState(null);
  const [contenido, setContenido] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/public/docs').then((d) => {
      setDocs(d.docs);
      if (d.docs[0]) abrir(d.docs[0].id);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function abrir(id) {
    setSel(id); setContenido(null);
    try { const { doc } = await apiFetch('/public/docs/' + id); setContenido(doc); }
    catch { setContenido({ titulo: 'Error', contenido: 'No se pudo cargar el artículo.' }); }
  }

  // Agrupar por categoría
  const categorias = {};
  docs.forEach((d) => { (categorias[d.categoria] ||= []).push(d); });

  if (loading) return <p className="py-10 text-center text-gray-400">Cargando ayuda…</p>;
  if (!docs.length) return <p className="py-10 text-center text-gray-400">Aún no hay documentación disponible.</p>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
      {/* Índice */}
      <aside className="card p-4 h-fit lg:sticky lg:top-20">
        {Object.entries(categorias).map(([cat, arts]) => (
          <div key={cat} className="mb-4 last:mb-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-2 mb-1.5">{cat}</div>
            <div className="space-y-0.5">
              {arts.map((a) => (
                <button key={a.id} onClick={() => abrir(a.id)}
                  className={`w-full text-left text-sm px-2.5 py-2 rounded-lg transition ${sel === a.id ? 'bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 font-medium' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                  {a.titulo}
                </button>
              ))}
            </div>
          </div>
        ))}
      </aside>

      {/* Artículo */}
      <article className="card p-6 min-h-[300px]">
        {contenido ? <Markdown>{contenido.contenido}</Markdown> : <p className="text-gray-400">Cargando…</p>}
      </article>
    </div>
  );
}
