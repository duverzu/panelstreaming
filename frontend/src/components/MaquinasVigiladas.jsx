import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faServer, faPlus, faTrash, faCircleNodes } from '@fortawesome/free-solid-svg-icons';

/** Bytes a la unidad que se lee mejor. */
function peso(b) {
  const n = Number(b) || 0;
  if (n >= 1099511627776) return (n / 1099511627776).toFixed(1) + ' TB';
  if (n >= 1073741824) return (n / 1073741824).toFixed(n >= 10737418240 ? 0 : 1) + ' GB';
  return Math.round(n / 1048576) + ' MB';
}

function tiempo(s) {
  const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600);
  return d ? `${d} d ${h} h` : `${h} h`;
}

/** Barra con umbral: verde tranquilo, ámbar mírame, rojo actúa. */
function Barra({ etiqueta, detalle, pct, aviso = 75, critico = 90 }) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const color = p >= critico ? 'bg-red-600' : p >= aviso ? 'bg-amber-600' : 'bg-brand-500';
  return (
    <div>
      <div className="flex justify-between items-baseline text-xs mb-1 gap-2">
        <span className="text-gray-400 truncate">{etiqueta}</span>
        <span className="font-semibold shrink-0">{detalle}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: p + '%' }} />
      </div>
    </div>
  );
}

/**
 * Máquinas vigiladas que no son nodos del panel.
 *
 * No hay que instalar nada en ellas: se les pide una lectura de /proc por SSH
 * con la llave que estas máquinas ya usan entre sí.
 */
export default function MaquinasVigiladas() {
  const [maquinas, setMaquinas] = useState(undefined);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);

  const cargar = () => apiFetch('/admin/maquinas').then((d) => setMaquinas(d.maquinas || [])).catch(() => setMaquinas([]));

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 30000);
    return () => clearInterval(t);
  }, []);

  async function guardar() {
    setMsg(null);
    try {
      const r = await apiFetch('/admin/maquinas', { method: 'POST', body: JSON.stringify(form) });
      setForm(null); setMsg({ ok: true, text: r.message }); cargar();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  }

  async function quitar(m) {
    if (!confirm(`¿Dejar de vigilar «${m.nombre}»?`)) return;
    await apiFetch(`/admin/maquinas/${m.id}`, { method: 'DELETE' }).catch(() => {});
    cargar();
  }

  if (maquinas === undefined) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold flex items-center gap-2">
          <FontAwesomeIcon icon={faCircleNodes} className="w-4 h-4 text-brand-500" />
          Otras máquinas
          <span className="text-xs font-normal text-gray-400">(no alojan radios ni canales)</span>
        </h2>
        <button
          onClick={() => setForm({ nombre: '', host: '', usuario: 'root', puerto: 22, nota: '' })}
          className="btn-ghost text-xs flex items-center gap-1.5"
        >
          <FontAwesomeIcon icon={faPlus} className="w-3 h-3" /> Vigilar una máquina
        </button>
      </div>

      {msg && (
        <div className={`mb-3 text-sm rounded-xl px-3 py-2 ${msg.ok ? 'text-brand-700 bg-brand-50 dark:bg-brand-500/10 dark:text-brand-400' : 'text-red-600 bg-red-50 dark:bg-red-500/10'}`}>
          {msg.text}
        </div>
      )}

      {form && (
        <div className="card p-5 mb-4 max-w-2xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="label mb-1">Nombre</div>
              <input className="input" placeholder="VPS panel de clientes" value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div>
              <div className="label mb-1">Dirección</div>
              <input className="input font-mono text-sm" placeholder="82.25.93.118 (vacío = esta misma máquina)"
                value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
            </div>
            <div>
              <div className="label mb-1">Usuario</div>
              <input className="input font-mono text-sm" value={form.usuario}
                onChange={(e) => setForm({ ...form, usuario: e.target.value })} />
            </div>
            <div>
              <div className="label mb-1">Puerto SSH</div>
              <input className="input font-mono text-sm" value={form.puerto}
                onChange={(e) => setForm({ ...form, puerto: e.target.value })} />
            </div>
          </div>
          <div className="mt-3">
            <div className="label mb-1">Nota (para acordarte de qué es)</div>
            <input className="input" placeholder="Aquí viven panelclientes y mazamorra" value={form.nota}
              onChange={(e) => setForm({ ...form, nota: e.target.value })} />
          </div>
          <p className="text-[11px] text-gray-400 mt-3">
            No se instala nada en la máquina ni se guarda ninguna contraseña: se entra con la
            llave SSH que este servidor ya tiene, y solo para leer.
          </p>
          <div className="flex gap-2 mt-4">
            <button onClick={guardar} className="btn-primary text-sm">Empezar a vigilar</button>
            <button onClick={() => { setForm(null); setMsg(null); }} className="btn-ghost text-sm">Cancelar</button>
          </div>
        </div>
      )}

      {maquinas.length === 0 && !form && (
        <div className="card p-6 text-center text-sm text-gray-400">
          Aquí puedes vigilar cualquier servidor tuyo aunque no aloje radios ni canales — el del
          panel, el de otro producto, el de un cliente. Se ven igual que los nodos: disco, CPU y
          memoria, con los mismos avisos.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {maquinas.map((m) => (
          <div key={m.id} className={`card p-5 ${!m.responde && !m.pausada ? 'border-red-200 dark:border-red-500/30' : ''}`}>
            <div className="flex items-center justify-between mb-1 gap-2">
              <span className="font-medium flex items-center gap-2 min-w-0">
                <FontAwesomeIcon icon={faServer} className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span className="truncate">{m.nombre}</span>
              </span>
              <button onClick={() => quitar(m)} title="Dejar de vigilar"
                className="shrink-0 text-gray-300 hover:text-red-500 transition">
                <FontAwesomeIcon icon={faTrash} className="w-3 h-3" />
              </button>
            </div>
            <div className="text-[11px] text-gray-400 mb-4 truncate">
              {m.host || 'esta misma máquina'}{m.nota ? ` · ${m.nota}` : ''}
            </div>

            {m.pausada ? (
              <p className="text-xs text-gray-400">Vigilancia en pausa.</p>
            ) : !m.responde ? (
              <p className="text-xs text-red-600 dark:text-red-400">
                No contesta. Puede estar apagada, sin red, o faltarle la llave SSH de este servidor.
              </p>
            ) : (
              <div className="space-y-3">
                <Barra
                  etiqueta={`Disco · ${peso(m.disco?.total_bytes)}`}
                  detalle={`quedan ${peso(m.disco?.libre_bytes)}`}
                  pct={m.disco?.usado_pct} aviso={80} critico={92}
                />
                <Barra
                  etiqueta={`CPU · ${m.cpu?.nucleos || '?'} cores`}
                  detalle={m.cpu?.usado_pct != null ? `${m.cpu.usado_pct}%` : 'midiendo…'}
                  pct={m.cpu?.usado_pct} aviso={70} critico={85}
                />
                {m.cpu?.robado_pct >= 5 && (
                  <div className="text-[11px] text-amber-600 dark:text-amber-400 -mt-1.5">
                    +{m.cpu.robado_pct}% que se lleva el vecino (CPU robado por el proveedor)
                  </div>
                )}
                <Barra
                  etiqueta={`Memoria · ${peso(m.memoria?.total_bytes)}`}
                  detalle={`${peso(m.memoria?.usado_bytes)} · ${m.memoria?.usado_pct ?? '—'}%`}
                  pct={m.memoria?.usado_pct} aviso={80} critico={90}
                />
                <div className="text-[11px] text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-800 space-y-0.5">
                  <div>Encendido hace {tiempo(m.uptime_s || 0)}</div>
                  {Array.isArray(m.cpu?.carga) && m.cpu.carga.length === 3 && (
                    <div>
                      Carga {m.cpu.carga.map((x) => Number(x).toFixed(2)).join(' · ')}
                      <span className="text-gray-300 dark:text-gray-600"> sobre {m.cpu.nucleos} cores</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
