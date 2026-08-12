/**
 * ambito.jsx — el panel de admin tiene tres modos: Todo, Audio y Video.
 * ------------------------------------------------------------------
 * POR QUÉ EXISTE:
 *
 * El menú estaba organizado por SERVICIO y luego por entidad, así que
 * "Clientes", "Planes", "Servidores" y "Documentación" aparecían dos veces
 * (una en Audio y otra en Video): 13 entradas para 9 destinos reales. Y como
 * había que elegir el servicio en cada enlace, no existía ninguna pantalla que
 * mostrara el negocio entero.
 *
 * Ahora el menú va por ENTIDAD y el servicio es un modo global que se elige una
 * vez, se recuerda entre sesiones y se cambia desde la cabecera. Las páginas ya
 * estaban preparadas: filtraban por `?tipo=`, solo cambia de dónde sale.
 *
 * Se descartó preguntar "¿a qué panel quieres entrar?" al iniciar sesión: solo
 * hay UN usuario que cruza audio y video (el admin) — los 33 clientes ya entran
 * a su panel correcto solos, por su `tipo` — y además obligaría a elegir uno de
 * los dos, que es justo lo que impide ver el total del negocio.
 * ------------------------------------------------------------------
 */
import { createContext, useContext, useState, useCallback } from 'react';

const CLAVE = 'panel_ambito';
export const AMBITOS = ['todo', 'audio', 'video'];

export const ETIQUETA = {
  todo: { txt: 'Todo', icono: '◎' },
  audio: { txt: 'Audio', icono: '🎙️' },
  video: { txt: 'Video', icono: '🎬' },
};

const Ctx = createContext(null);

function leerGuardado() {
  try {
    const v = localStorage.getItem(CLAVE);
    return AMBITOS.includes(v) ? v : 'todo';
  } catch (_) {
    return 'todo';
  }
}

export function AmbitoProvider({ children }) {
  const [ambito, setEstado] = useState(leerGuardado);

  const setAmbito = useCallback((v) => {
    if (!AMBITOS.includes(v)) return;
    setEstado(v);
    try { localStorage.setItem(CLAVE, v); } catch (_) { /* modo incógnito */ }
  }, []);

  return <Ctx.Provider value={{ ambito, setAmbito }}>{children}</Ctx.Provider>;
}

/**
 * Devuelve el modo activo y utilidades para filtrar.
 *
 *   const { ambito, esTodo, coincide } = useAmbito();
 *   const lista = clientes.filter((c) => coincide(c.tipo));
 *
 * `coincide` trata el tipo vacío como 'audio', que es como estaba antes de
 * existir el video: los registros viejos no tienen la columna rellena.
 */
export function useAmbito() {
  const ctx = useContext(Ctx);
  // Fuera del provider (panel de cliente o revendedor) no hay modos: es 'todo'.
  const ambito = ctx?.ambito ?? 'todo';
  return {
    ambito,
    setAmbito: ctx?.setAmbito ?? (() => {}),
    esTodo: ambito === 'todo',
    esVideo: ambito === 'video',
    esAudio: ambito === 'audio',
    coincide: (tipo) => ambito === 'todo' || (tipo || 'audio') === ambito,
    /** Tipo por defecto al CREAR algo. En "Todo" no hay uno obvio: se usa audio. */
    tipoPorDefecto: ambito === 'todo' ? 'audio' : ambito,
  };
}
