import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import AreaChart from './charts/AreaChart';
import Modal from './Modal';

/**
 * Cuentas que hay en un nodo de VIDEO, leídas por el agente que corre allí.
 * Solo lectura: muestra lo que existe en ese servidor, esté o no dado de alta
 * en el panel todavía.
 */
export default function CuentasVideo({ servidorId }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [abierta, setAbierta] = useState(null);
  const [importar, setImportar] = useState(null);   // cuenta que se está dando de alta
  const [planes, setPlanes] = useState([]);
  const [form, setForm] = useState({ nombre_empresa: '', email: '', plan_id: '' });
  const [guardando, setGuardando] = useState(false);
  const [errImport, setErrImport] = useState(null);
  const [aviso, setAviso] = useState(null);

  function cargar() {
    apiFetch(`/admin/servidores/${servidorId}/cuentas`).then(setDatos).catch((e) => setError(e.message));
  }

  function abrirImportar(c) {
    setImportar(c);
    setForm({ nombre_empresa: c.user, email: '', plan_id: '' });
    setErrImport(null);
    apiFetch('/admin/planes')
      .then(({ planes }) => setPlanes(planes.filter((p) => p.tipo === 'video')))
      .catch(() => setPlanes([]));
  }

  async function confirmarImportar(e) {
    e.preventDefault();
    setGuardando(true); setErrImport(null);
    try {
      const r = await apiFetch(`/admin/servidores/${servidorId}/cuentas/${encodeURIComponent(importar.user)}/importar`, {
        method: 'POST', body: JSON.stringify(form),
      });
      setImportar(null);
      setAviso(r.message);
      cargar();
    } catch (err) { setErrImport(err.message); }
    finally { setGuardando(false); }
  }

  useEffect(() => {
    let vivo = true;
    apiFetch(`/admin/servidores/${servidorId}/cuentas`)
      .then((d) => vivo && setDatos(d))
      .catch((e) => vivo && setError(e.message));
    return () => { vivo = false; };
  }, [servidorId]);

  if (error) {
    return (
      <div className="mt-4 text-xs rounded-xl px-3 py-2.5 text-red-700 bg-red-50 dark:bg-red-500/10 dark:text-red-400">
        {error}
      </div>
    );
  }
  if (!datos) return <div className="mt-4 text-sm text-gray-400">Consultando el nodo…</div>;

  return (
    <>
    {aviso && (
      <div className="mt-4 text-xs rounded-xl px-3 py-2 text-brand-700 bg-brand-50 dark:bg-brand-500/10 dark:text-brand-400">
        {aviso} · El cliente aún no tiene acceso; se le genera cuando su panel muestre sus videos.
      </div>
    )}
    <div className="mt-4 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
      {datos.cuentas.length === 0 && (
        <div className="p-4 text-sm text-gray-400 text-center">Este nodo no tiene cuentas todavía.</div>
      )}

      {datos.cuentas.map((c) => (
        <div key={c.user}>
          <button
            onClick={() => setAbierta(abierta === c.user ? null : c.user)}
            className="w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition flex items-center gap-3"
          >
            <span className="flex-1 min-w-0">
              <span className="font-medium flex items-center gap-2">
                {c.nombre_empresa || c.user}
                {c.al_aire && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    {c.fuente === 'stream' ? 'EMISIÓN 24/7' : 'EN VIVO'}
                  </span>
                )}
                {!c.cliente_id && (
                  <span
                    role="button" tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); abrirImportar(c); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); abrirImportar(c); } }}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/20 cursor-pointer transition"
                  >
                    + Dar de alta
                  </span>
                )}
              </span>
              <span className="text-xs text-gray-400 font-mono">
                {c.user} · puertos {c.puertos?.http || '—'} / {c.puertos?.rtmp || '—'}
              </span>
            </span>
            <span className="text-right shrink-0">
              <span className="text-sm font-medium tabular-nums block">{c.espacio}</span>
              <span className="text-xs text-gray-400">{c.videos} videos</span>
            </span>
          </button>

          {abierta === c.user && <Detalle servidorId={servidorId} user={c.user} />}
        </div>
      ))}
    </div>

    <Modal open={Boolean(importar)} onClose={() => setImportar(null)} title={`Dar de alta "${importar?.user || ''}"`}>
      <form onSubmit={confirmarImportar} className="space-y-3">
        <p className="text-xs text-gray-400">
          Registra esta cuenta en el panel para verla, medirla y facturarla.
          <b> No se toca nada en el servidor de video</b> y el cliente no recibe acceso todavía.
        </p>
        <div>
          <label className="label">Nombre del canal</label>
          <input className="input" value={form.nombre_empresa} onChange={(e) => setForm({ ...form, nombre_empresa: e.target.value })} required />
        </div>
        <div>
          <label className="label">Email de contacto</label>
          <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="opcional" />
        </div>
        <div>
          <label className="label">Plan</label>
          <select className="input" value={form.plan_id} onChange={(e) => setForm({ ...form, plan_id: e.target.value })}>
            <option value="">Sin plan (se marca como «Importado»)</option>
            {planes.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {(p.espacio_mb / 1024).toFixed(0)} GB</option>)}
          </select>
          {planes.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">No tienes planes de video. Puedes crearlos luego en Planes y asignarlo después.</p>
          )}
        </div>
        {errImport && <div className="text-sm rounded-xl px-3 py-2 text-red-600 bg-red-50 dark:bg-red-500/10">{errImport}</div>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => setImportar(null)} className="btn-ghost flex-1">Cancelar</button>
          <button className="btn-primary flex-1" disabled={guardando}>{guardando ? 'Dando de alta…' : 'Dar de alta'}</button>
        </div>
      </form>
    </Modal>
    </>
  );
}

function Detalle({ servidorId, user }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vivo = true;
    apiFetch(`/admin/servidores/${servidorId}/cuentas/${encodeURIComponent(user)}`)
      .then((x) => vivo && setD(x))
      .catch((e) => vivo && setError(e.message));
    return () => { vivo = false; };
  }, [servidorId, user]);

  if (error) return <div className="p-3 text-xs text-red-600">{error}</div>;
  if (!d) return <div className="p-3 text-xs text-gray-400">Cargando…</div>;

  const serie = (d.consumo?.por_dia || []).map((x) => ({
    label: new Date(x.fecha).toLocaleDateString('es', { day: '2-digit', month: 'short' }),
    valor: x.gb,
  }));

  return (
    <div className="bg-gray-50/70 dark:bg-gray-950/40 p-4 space-y-4">
      {d.consumo && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400">Consumo · últimos 30 días</span>
            <span className="text-sm font-semibold tabular-nums">{d.consumo.total}</span>
          </div>
          <AreaChart data={serie} color="#6366f1" unidad=" GB" height={140} />
        </div>
      )}

      <div>
        <div className="text-xs text-gray-400 mb-2">Videos ({d.videos.length})</div>
        {d.videos.length === 0 ? (
          <p className="text-xs text-gray-400">Sin videos subidos.</p>
        ) : (
          <div className="max-h-56 overflow-y-auto space-y-1">
            {d.videos.map((v) => (
              <div key={v.ruta} className="flex items-center gap-3 text-xs">
                <span className="flex-1 truncate">{v.ruta}</span>
                <span className="text-gray-400 tabular-nums shrink-0">{v.tam}</span>
                <span className="text-gray-400 shrink-0 hidden sm:block">
                  {new Date(v.modificado).toLocaleDateString('es')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
