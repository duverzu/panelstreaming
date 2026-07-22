import Copiable from '../../../components/Copiable';
import { useVideo } from './useVideo';

export default function VideoEnlaces() {
  const { data, error } = useVideo();
  if (error && data === undefined) return <div className="py-10 text-center text-red-600">{error}</div>;
  if (data === undefined) return <p className="py-10 text-center text-gray-400">Cargando…</p>;

  const u = data.urls;
  return (
    <div className="card p-5 space-y-4 max-w-2xl">
      <div>
        <h2 className="font-semibold mb-1">Enlaces de tu canal</h2>
        <p className="text-xs text-gray-400">Comparte estos enlaces o úsalos en tu web y apps.</p>
      </div>
      <div>
        <div className="label mb-1">Señal del canal (lo que ven tus espectadores)</div>
        <Copiable texto={u.canal} />
        <p className="text-xs text-gray-400 mt-1">Muestra el vivo cuando transmites y tus videos en bucle cuando no.</p>
      </div>
      <div>
        <div className="label mb-1">Solo emisión 24/7 (tus videos)</div>
        <Copiable texto={u.emision} />
      </div>
      <div>
        <div className="label mb-1">Solo transmisión en vivo</div>
        <Copiable texto={u.vivo} />
        <p className="text-xs text-gray-400 mt-1">Responde solo mientras estás al aire.</p>
      </div>
    </div>
  );
}
