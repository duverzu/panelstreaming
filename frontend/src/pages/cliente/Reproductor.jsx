import { useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import { IconCopy, IconCheck } from '../../icons';

function Snippet({ label, code }) {
  const [copiado, setCopiado] = useState(false);
  function copiar() {
    navigator.clipboard?.writeText(code).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    });
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium">{label}</span>
        <button onClick={copiar} className="text-xs flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-brand-500 hover:text-brand-600 transition">
          {copiado ? <><IconCheck width={13} height={13} /> Copiado</> : <><IconCopy width={13} height={13} /> Copiar</>}
        </button>
      </div>
      <textarea readOnly value={code} rows={code.length > 90 ? 3 : 2}
        onClick={(e) => e.target.select()}
        className="w-full text-xs font-mono bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl p-2.5 resize-none outline-none" />
    </div>
  );
}

export default function ClienteReproductor() {
  const [r, setR] = useState(undefined);

  useEffect(() => {
    apiFetch('/cliente/reproductor').then((d) => setR(d.reproductor)).catch(() => setR(null));
  }, []);

  if (r === undefined) return <p className="py-10 text-center text-gray-400">Cargando…</p>;
  if (!r) return <p className="py-10 text-center text-gray-400">Tu estación aún no está lista.</p>;

  const origin = window.location.origin;
  const embedUrl = `${origin}/embed/${r.shortcode}`;
  const iframe = `<iframe src="${embedUrl}" width="100%" height="110" frameborder="0" scrolling="no" style="max-width:420px;border-radius:16px"></iframe>`;
  const html5 = `<audio controls style="width:100%;max-width:420px"><source src="${r.stream_url}" type="audio/mpeg"></audio>`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Vista previa del reproductor embebible */}
      <div className="card p-5">
        <h2 className="font-semibold mb-1">Reproductor con carátula</h2>
        <p className="text-xs text-gray-400 mb-4">Muestra la portada y lo que suena en vivo (o AutoDJ). Así se verá en tu web:</p>
        <iframe src={embedUrl} width="100%" height="110" frameBorder="0" scrolling="no" style={{ maxWidth: 420, borderRadius: 16 }} title="preview" />
        <div className="mt-4">
          <Snippet label="Código para incrustar (iframe)" code={iframe} />
        </div>
      </div>

      {/* Links tipo Sonic Panel */}
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold">Enlaces para tu sitio web</h2>
        <Snippet label="🎵 Reproductor HTML5 simple" code={html5} />
        <Snippet label="🔗 Stream directo (URL)" code={r.stream_url} />
        {r.pls_url && <Snippet label="📻 Winamp / VLC / foobar (.pls)" code={r.pls_url} />}
        {r.m3u_url && <Snippet label="📻 iTunes / otros (.m3u)" code={r.m3u_url} />}
      </div>
    </div>
  );
}
