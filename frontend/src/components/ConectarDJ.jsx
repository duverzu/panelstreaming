import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { IconMic, IconCopy, IconCheck } from '../icons';

/** Fila con valor + botón copiar. */
function Campo({ label, value }) {
  const [copiado, setCopiado] = useState(false);
  function copiar() {
    navigator.clipboard?.writeText(String(value)).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    });
  }
  return (
    <div className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-950 rounded-xl px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-[11px] text-gray-400">{label}</div>
        <div className="font-mono text-sm truncate">{value}</div>
      </div>
      <button onClick={copiar} title="Copiar"
        className="shrink-0 w-8 h-8 grid place-items-center rounded-lg border border-gray-200 dark:border-gray-800 hover:border-brand-500 hover:text-brand-600 transition">
        {copiado ? <IconCheck width={15} height={15} className="text-brand-600" /> : <IconCopy width={15} height={15} />}
      </button>
    </div>
  );
}

export default function ConectarDJ() {
  const [dj, setDj] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch('/cliente/configurar-dj').then(setDj).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="card p-5">
      <h2 className="font-semibold mb-1 flex items-center gap-2">
        <IconMic width={18} height={18} /> Conectar tu radio (DJ en vivo)
      </h2>
      <p className="text-xs text-gray-400 mb-4">
        Usa estos datos en tu software (BUTT, Mixxx, RadioDJ, OBS) para transmitir desde tu PC.
      </p>

      {error ? (
        <p className="text-sm text-gray-400">{error}</p>
      ) : !dj ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : !dj.disponible ? (
        <div className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-500/10 rounded-xl px-3 py-2.5">
          {dj.mensaje}
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Campo label="Servidor" value={dj.servidor} />
            <Campo label="Puerto" value={dj.puerto} />
            <Campo label="Punto de montaje" value={dj.punto_montaje} />
            <Campo label="Protocolo" value={dj.protocolo} />
            <Campo label="Usuario" value={dj.usuario} />
            <Campo label="Contraseña" value={dj.password} />
          </div>
          <div className="text-xs text-gray-400 pt-1">
            Formato recomendado: <b>{dj.formato}</b>. Al conectar tu software, tu transmisión en vivo
            reemplaza automáticamente al AutoDJ.
          </div>
          {dj.url_escucha && (
            <div className="mt-2 pt-3 border-t border-gray-100 dark:border-gray-800">
              <div className="text-[11px] text-gray-400 mb-1.5">🎧 Enlace para que tus oyentes escuchen:</div>
              <Campo label="URL de escucha" value={dj.url_escucha} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
