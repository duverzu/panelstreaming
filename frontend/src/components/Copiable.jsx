import { useState } from 'react';
import { IconCopy, IconCheck } from '../icons';

/** Campo de texto copiable al portapapeles. */
export default function Copiable({ texto, mono = true }) {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={() => navigator.clipboard?.writeText(texto).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); })}
      className={`inline-flex items-center gap-1.5 ${mono ? 'font-mono' : ''} text-xs px-2.5 py-2 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-brand-500 transition break-all text-left w-full`}>
      {ok ? <IconCheck width={13} height={13} className="text-brand-600 shrink-0" /> : <IconCopy width={13} height={13} className="shrink-0" />}
      <span className="truncate">{texto}</span>
    </button>
  );
}
