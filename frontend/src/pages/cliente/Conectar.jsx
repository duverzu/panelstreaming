import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../api';
import { IconMic, IconCopy, IconCheck } from '../../icons';

const EXPLICA = {
  servidor: 'La dirección de tu servidor de radio. Va en el campo "Server/Host" o "Dirección" de tu programa.',
  puerto: 'El puerto por donde entra tu transmisión. Va en el campo "Port".',
  punto_montaje: 'El "Mount point". En BUTT/Icecast escribe exactamente una barra: /',
  usuario: 'Tu nombre de usuario de transmisión (source/DJ).',
  password: 'Tu contraseña de transmisión. NO la compartas.',
  protocolo: 'El tipo de servidor. Elige "Icecast" (o Icecast 2) en tu programa.',
  formato: 'Formato de audio recomendado para transmitir.',
};

function Campo({ etiqueta, valor, ayuda }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = () => navigator.clipboard?.writeText(String(valor)).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500); });
  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-gray-400">{etiqueta}</div>
          <div className="font-mono text-sm truncate">{valor}</div>
        </div>
        <button onClick={copiar} title="Copiar" className="shrink-0 w-8 h-8 grid place-items-center rounded-lg border border-gray-200 dark:border-gray-800 hover:border-brand-500 hover:text-brand-600 transition">
          {copiado ? <IconCheck width={15} height={15} className="text-brand-600" /> : <IconCopy width={15} height={15} />}
        </button>
      </div>
      {ayuda && <div className="text-[11px] text-gray-400 mt-1.5">{ayuda}</div>}
    </div>
  );
}

export default function ClienteConectar() {
  const [dj, setDj] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { apiFetch('/cliente/configurar-dj').then(setDj).catch((e) => setError(e.message)); }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Datos de conexión */}
      <div className="card p-5">
        <h2 className="font-semibold mb-1 flex items-center gap-2"><IconMic width={18} height={18} /> Datos para transmitir en vivo</h2>
        <p className="text-xs text-gray-400 mb-4">Copia estos datos en tu software (BUTT, Mixxx, RadioDJ, OBS).</p>
        {error ? <p className="text-sm text-gray-400">{error}</p>
          : !dj ? <p className="text-sm text-gray-400">Cargando…</p>
          : !dj.disponible ? (
            <div className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-500/10 rounded-xl px-3 py-2.5">{dj.mensaje}</div>
          ) : (
            <div className="space-y-2.5">
              <Campo etiqueta="Servidor" valor={dj.servidor} ayuda={EXPLICA.servidor} />
              <Campo etiqueta="Puerto" valor={dj.puerto} ayuda={EXPLICA.puerto} />
              <Campo etiqueta="Punto de montaje" valor={dj.punto_montaje} ayuda={EXPLICA.punto_montaje} />
              <Campo etiqueta="Usuario" valor={dj.usuario} ayuda={EXPLICA.usuario} />
              <Campo etiqueta="Contraseña" valor={dj.password} ayuda={EXPLICA.password} />
              <div className="grid grid-cols-2 gap-2.5">
                <Campo etiqueta="Protocolo" valor={dj.protocolo} ayuda={EXPLICA.protocolo} />
                <Campo etiqueta="Formato" valor={dj.formato} ayuda={EXPLICA.formato} />
              </div>
              {dj.url_escucha && (
                <div className="pt-2 mt-1 border-t border-gray-100 dark:border-gray-800">
                  <div className="text-[11px] text-gray-400 mb-1.5">🎧 Enlace para que tus oyentes escuchen:</div>
                  <Campo etiqueta="URL de escucha" valor={dj.url_escucha} />
                </div>
              )}
            </div>
          )}
      </div>

      {/* Guía rápida */}
      <div className="card p-5">
        <h2 className="font-semibold mb-3">¿Cómo conecto? (guía rápida)</h2>
        <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-600 dark:text-gray-300">
          <li>Descarga <b>BUTT</b> (gratis): <a className="text-brand-600 underline" href="https://danielnoethen.de/butt/" target="_blank" rel="noreferrer">danielnoethen.de/butt</a></li>
          <li>Abre BUTT → <b>Settings → Main → Add server</b>.</li>
          <li>Tipo: <b>Icecast</b>.</li>
          <li>Pega <b>Servidor</b>, <b>Puerto</b>, <b>Usuario</b> y <b>Contraseña</b> de la izquierda.</li>
          <li>En <b>Mountpoint</b> escribe una barra: <code className="px-1 rounded bg-gray-100 dark:bg-gray-800">/</code></li>
          <li>Guarda y pulsa <b>Play ▶️</b>. ¡Estás al aire!</li>
        </ol>
        <div className="mt-4 text-sm bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 rounded-xl p-3">
          💡 Al conectar en vivo, tu transmisión reemplaza al AutoDJ. Al desconectarte, el AutoDJ vuelve solo.
        </div>
        <Link to="/cliente/aprende" className="btn-ghost mt-4 inline-flex text-sm">📚 Ver la guía completa</Link>
      </div>
    </div>
  );
}
