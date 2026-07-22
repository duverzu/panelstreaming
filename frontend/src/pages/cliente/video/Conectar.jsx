import { IconMic } from '../../../icons';
import Copiable from '../../../components/Copiable';
import { useVideo } from './useVideo';

export default function VideoConectar() {
  const { data, error } = useVideo();
  if (error && data === undefined) return <div className="py-10 text-center text-red-600">{error}</div>;
  if (data === undefined) return <p className="py-10 text-center text-gray-400">Cargando…</p>;

  if (!data.permite_vivo || !data.conexion) {
    return <div className="card p-8 text-center text-gray-400">
      <div className="text-3xl mb-2">🎥</div>
      Tu plan no incluye transmisión en vivo. Tu canal emite tus videos en bucle 24/7.
    </div>;
  }

  return (
    <div className="card p-5 max-w-2xl">
      <h2 className="font-semibold flex items-center gap-2 mb-1"><IconMic width={18} height={18} /> Transmitir en vivo</h2>
      <p className="text-xs text-gray-400 mb-4">Con OBS, vMix o cualquier encoder. Mientras transmites, tu señal en vivo reemplaza tus videos; al terminar, vuelven solos.</p>
      <div className="space-y-3">
        <div>
          <div className="label mb-1">Servidor (URL)</div>
          <Copiable texto={data.conexion.servidor} />
        </div>
        <div>
          <div className="label mb-1">Clave de transmisión</div>
          <Copiable texto={data.conexion.clave} />
        </div>
      </div>
      <div className="mt-4 text-xs text-gray-400 rounded-xl bg-gray-50 dark:bg-gray-950 p-3">
        <b>En OBS:</b> Ajustes → Emisión → Servicio «Personalizado», pega el servidor y la clave, y pulsa «Iniciar transmisión».
      </div>
    </div>
  );
}
