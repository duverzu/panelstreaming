import { createContext, useContext, useEffect, useState } from 'react';

/**
 * Si el menú lateral está plegado. Vive en un contexto porque el botón que lo
 * pliega está en la CABECERA y el menú es otro componente: sin esto habría que
 * subir el estado a Layout y bajarlo por props a los dos.
 *
 * Se recuerda entre visitas: quien pliega el menú lo hace porque quiere más
 * sitio para trabajar, y volvérselo a abrir en cada recarga es pelearse con él.
 */
const Ctx = createContext({ plegado: false, alternar: () => {} });

export function SidebarProvider({ children }) {
  const [plegado, setPlegado] = useState(() => localStorage.getItem('sidebar_plegado') === '1');

  useEffect(() => {
    localStorage.setItem('sidebar_plegado', plegado ? '1' : '0');
  }, [plegado]);

  return (
    <Ctx.Provider value={{ plegado, alternar: () => setPlegado((v) => !v) }}>
      {children}
    </Ctx.Provider>
  );
}

export const useSidebar = () => useContext(Ctx);
