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
  const [ext, setExt] = useState(null);   // player de la plataforma (si lo tiene)

  useEffect(() => {
    apiFetch('/cliente/reproductor')
      .then((d) => { setR(d.reproductor); setExt(d.player_externo || null); })
      .catch(() => setR(null));
  }, []);

  if (r === undefined) return <p className="py-10 text-center text-gray-400">Cargando…</p>;
  if (!r) return <p className="py-10 text-center text-gray-400">Tu estación aún no está lista.</p>;

  const origin = window.location.origin;
  const embedUrl = `${origin}/embed/${r.shortcode}`;
  const iframe = `<iframe src="${embedUrl}" width="100%" height="110" frameborder="0" scrolling="no" style="max-width:420px;border-radius:16px"></iframe>`;
  const html5 = `<audio controls style="width:100%;max-width:420px"><source src="${r.stream_url}" type="audio/mpeg"></audio>`;

  return (
    <div className="space-y-6">
      {/* Player oficial de la plataforma: el que el cliente configura allá */}
      {ext && (
        <div className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              {ext.logo && <img src={ext.logo} alt="" className="w-12 h-12 rounded-xl object-cover bg-gray-100 dark:bg-gray-800" />}
              <div>
                <h2 className="font-semibold flex items-center gap-2">
                  Tu reproductor
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">{ext.estilo || 'Player'}</span>
                </h2>
                <p className="text-xs text-gray-400">
                  Este es tu player oficial{ext.ubicacion ? ` · ${ext.ubicacion}` : ''}. Su diseño, colores y redes se editan en la plataforma.
                </p>
              </div>
            </div>
            {(ext.url_editar || ext.url) && (
              <a href={ext.url_editar || ext.url} target="_blank" rel="noreferrer" className="btn-primary !py-2 !px-3 text-xs shrink-0">
                Editar player ↗
              </a>
            )}
          </div>

          {ext.url && (
            <>
              <div className="rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800">
                <iframe src={ext.url} width="100%" height="460" frameBorder="0" allow="autoplay" title="Mi reproductor" style={{ display: 'block' }} />
              </div>
              <p className="text-xs text-gray-400 mt-2">
                ¿No carga la vista previa? <a href={ext.url} target="_blank" rel="noreferrer" className="text-brand-600 dark:text-brand-400 underline underline-offset-2">Ábrelo en una pestaña nueva</a> — algunos navegadores bloquean páginas dentro de otras.
              </p>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <Snippet label="🔗 Link para compartir" code={ext.url} />
                <Snippet label="💻 Código para tu web (iframe)" code={ext.embed} />
              </div>
            </>
          )}

          {/* Colores configurados, como referencia visual */}
          {ext.colores?.primario && (
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-gray-400">
              <span>Tus colores:</span>
              {[['Primario', ext.colores.primario], ['Secundario', ext.colores.secundario], ['Fondo', ext.colores.fondo]]
                .filter(([, c]) => c)
                .map(([n, c]) => (
                  <span key={n} className="inline-flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-md border border-gray-200 dark:border-gray-700" style={{ background: c }} />
                    {n}
                  </span>
                ))}
            </div>
          )}
        </div>
      )}

      {ext && (
        <p className="text-sm text-gray-400 -mb-2">
          ¿Prefieres algo más simple para tu web? También puedes usar estas opciones básicas:
        </p>
      )}

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
    </div>
  );
}
