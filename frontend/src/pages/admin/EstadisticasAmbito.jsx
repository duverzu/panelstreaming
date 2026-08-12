/**
 * EstadisticasAmbito.jsx — decide qué estadísticas mostrar según el modo.
 * ------------------------------------------------------------------
 * Es el único sitio donde audio y video tienen páginas DISTINTAS de verdad
 * (las demás — clientes, planes, servidores, documentación — comparten
 * componente y solo cambian el filtro). Antes eso obligaba a tener dos entradas
 * de menú; ahora hay una sola y aquí se elige cuál toca.
 *
 * En modo "Todo" se apilan las dos con su encabezado, en vez de esconder una:
 * el admin quiere ver el negocio entero, no la mitad.
 * ------------------------------------------------------------------
 */
import { useAmbito } from '../../ambito';
import AdminEstadisticas from './Estadisticas';
import AdminVideoEstadisticas from './VideoEstadisticas';

function Encabezado({ icono, texto }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-lg">{icono}</span>
      <h2 className="font-semibold">{texto}</h2>
      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
    </div>
  );
}

export default function EstadisticasAmbito() {
  const { ambito } = useAmbito();

  if (ambito === 'audio') return <AdminEstadisticas />;
  if (ambito === 'video') return <AdminVideoEstadisticas />;

  return (
    <div className="space-y-10">
      <section>
        <Encabezado icono="🎙️" texto="Streaming Audio" />
        <AdminEstadisticas />
      </section>
      <section>
        <Encabezado icono="🎬" texto="Streaming Video" />
        <AdminVideoEstadisticas />
      </section>
    </div>
  );
}
