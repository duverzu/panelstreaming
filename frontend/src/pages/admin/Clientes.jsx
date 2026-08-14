import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../api';
import { useAuth } from '../../auth';
import { useAmbito } from '../../ambito';
import Modal from '../../components/Modal';
import Copiable from '../../components/Copiable';
import { IconPlay, IconStop, IconPower, IconEnter, IconTrash, IconPlus, IconRefresh, IconMusic, IconSliders } from '../../icons';

/** Icono de llave (accesos), inline para no tocar el set de iconos. */
function IconLlave({ width = 14, height = 14 }) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="15" r="4" /><path d="M10.85 12.15 19 4M18 5l2 2M15 8l2 2" />
    </svg>
  );
}

/** Icono de lápiz (editar), inline. */
function IconLapiz({ width = 14, height = 14 }) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

const ESTADO_BADGE = {
  online: { txt: 'Al aire', cls: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400', dot: 'bg-brand-500 animate-pulse' },
  offline: { txt: 'Fuera de aire', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400', dot: 'bg-gray-400' },
  suspendido: { txt: 'Suspendido', cls: 'bg-red-50 text-red-600 dark:bg-red-500/10', dot: 'bg-red-500' },
  'sin-estacion': { txt: 'Sin estación', cls: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10', dot: 'bg-amber-500' },
  error: { txt: 'Error', cls: 'bg-red-50 text-red-600 dark:bg-red-500/10', dot: 'bg-red-500' },
};

/** Bytes a la unidad que se lee mejor. "—" si aún no hay dato. */
function peso(bytes) {
  if (bytes == null) return '—';
  const n = Number(bytes) || 0;
  if (n >= 1073741824) return (n / 1073741824).toFixed(n >= 10737418240 ? 0 : 1) + ' GB';
  if (n >= 1048576) return Math.round(n / 1048576) + ' MB';
  if (n >= 1024) return Math.round(n / 1024) + ' KB';
  return n + ' B';
}

/** Disco usado con su barra. El color avisa antes de que se llene: una radio
 *  sin espacio deja de aceptar música y el cliente no entiende por qué. */
function Disco({ usado, total }) {
  // Sin dato ≠ cero. Los canales de la capa de compatibilidad (asilivehd) no
  // reportan espacio: su API solo devuelve `user`, `al_aire` y `viewers`.
  // Poner "0 MB" ahí sería inventarse un dato que nadie ha medido.
  if (usado == null) {
    return (
      <span className="text-gray-300 dark:text-gray-600 cursor-help"
        title="Este nodo no reporta el espacio usado (canales de la capa de compatibilidad).">
        — <span className="text-[10px]">sin dato</span>
      </span>
    );
  }
  const pct = total ? Math.min(100, Math.round((usado / total) * 100)) : null;
  const color = pct == null ? 'bg-gray-300 dark:bg-gray-700'
    : pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-brand-500';
  return (
    <div className="min-w-[92px]">
      <div className="text-xs tabular-nums">
        {peso(usado)}
        {total ? <span className="text-gray-400"> / {peso(total)}</span> : null}
      </div>
      {pct != null && (
        <div className="h-1 mt-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: pct + '%' }} />
        </div>
      )}
    </div>
  );
}

export default function AdminClientes() {
  const { impersonate } = useAuth();
  const navigate = useNavigate();
  // El servicio ya no viene en la URL: es el modo global de la cabecera.
  const { ambito, esVideo, esTodo, coincide, tipoPorDefecto } = useAmbito();
  const tipo = tipoPorDefecto;
  // Textos según el servicio (misma página para radios y canales de video)
  const T = esVideo
    ? { unidad: 'canal', crear: 'Crear canal', tituloModal: 'Crear nuevo canal', nombreLabel: 'Nombre del canal', ph: 'Mi Canal TV' }
    : { unidad: 'radio', crear: 'Crear radio', tituloModal: 'Crear nueva radio', nombreLabel: 'Nombre de la radio', ph: 'Rock FM' };

  const [clientes, setClientes] = useState([]);
  const [planes, setPlanes] = useState([]);
  const [servidores, setServidores] = useState([]);
  const [estados, setEstados] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // id en proceso

  const [form, setForm] = useState({ nombre_empresa: '', username: '', email: '', password: '', plan_id: '', servidor_id: '' });
  const [userTocado, setUserTocado] = useState(false); // si el admin escribió el usuario a mano
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Modal de accesos del cliente
  const [accesos, setAccesos] = useState(null);       // cliente con el modal abierto
  const [datos, setDatos] = useState(null);           // datos traídos del backend
  const [nuevaPass, setNuevaPass] = useState(null);   // clave recién generada (se ve una vez)
  const [generando, setGenerando] = useState(false);
  const [srtBusy, setSrtBusy] = useState(false);
  const [srtSalidaBusy, setSrtSalidaBusy] = useState(false);
  const [consumo, setConsumo] = useState({});   // cliente_id -> disco y transferencia
  const [oyentes, setOyentes] = useState({});   // cliente_id -> oyentes (audio)
  const [viewers, setViewers] = useState({});   // cliente_id -> viewers (video)

  async function cargar() {
    setLoading(true);
    try {
      const [c, p, sv] = await Promise.all([apiFetch('/admin/clientes'), apiFetch('/admin/planes'), apiFetch('/admin/servidores')]);
      setClientes(c.clientes);
      setPlanes(p.planes);
      setServidores(sv.servidores || []);
      setForm((f) => ({ ...f, plan_id: f.plan_id || p.planes[0]?.id || '' }));
      apiFetch('/admin/clientes/estados').then((e) => setEstados(e.estados)).catch(() => {});
      // Consumo, oyentes y viewers van aparte y sin bloquear: la tabla se pinta
      // ya y estas columnas se rellenan cuando llegan (el disco tarda, hay que
      // preguntarle a cada estación).
      apiFetch('/admin/consumo-clientes')
        .then((d) => setConsumo(Object.fromEntries((d.clientes || []).map((x) => [x.cliente_id, x]))))
        .catch(() => {});
      apiFetch('/admin/estadisticas')
        .then((d) => setOyentes(Object.fromEntries((d.ranking || []).map((r) => [r.cliente_id, r.oyentes]))))
        .catch(() => {});
      apiFetch('/admin/video/viewers')
        .then((d) => setViewers(Object.fromEntries((d.canales || []).map((c) => [c.cliente_id, c.viewers]))))
        .catch(() => {});
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { cargar(); }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Editar nombre y plan de un cliente
  const [editar, setEditar] = useState(null);
  const [editForm, setEditForm] = useState({ nombre_empresa: '', plan: '' });
  const [editMsg, setEditMsg] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  function abrirEditar(c) { setEditar(c); setEditForm({ nombre_empresa: c.nombre_empresa || '', plan: c.plan || '' }); setEditMsg(null); }
  async function guardarEditar() {
    setEditSaving(true); setEditMsg(null);
    try {
      await apiFetch(`/admin/clientes/${editar.id}`, { method: 'PUT', body: JSON.stringify(editForm) });
      setEditar(null); cargar();
    } catch (e) { setEditMsg(e.message); }
    finally { setEditSaving(false); }
  }

  // "Rock FM 88.5" → "rockfm885" (mismo criterio que el backend)
  const slug = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 40);

  // El usuario se sugiere del nombre de la radio, pero el admin puede cambiarlo.
  const setNombre = (e) => {
    const nombre_empresa = e.target.value;
    setForm((f) => ({ ...f, nombre_empresa, username: userTocado ? f.username : slug(nombre_empresa) }));
  };
  const setUsername = (e) => { setUserTocado(true); setForm((f) => ({ ...f, username: slug(e.target.value) })); };

  async function crear(e) {
    e.preventDefault();
    setSaving(true); setMsg(null);
    try {
      const r = await apiFetch('/admin/clientes/crear', { method: 'POST', body: JSON.stringify(form) });
      setMsg({ type: 'ok', text: `✅ Radio creada. Acceso → usuario: ${r.credenciales?.usuario} · contraseña: ${r.credenciales?.password}` });
      setForm({ nombre_empresa: '', username: '', email: '', password: '', plan_id: planes.find((p) => (p.tipo || 'audio') === tipo)?.id || '', servidor_id: '' });
      setUserTocado(false);
      setModalOpen(false);
      cargar();
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setSaving(false);
    }
  }

  async function accion(c, path, confirmMsg) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(c.id);
    try {
      await apiFetch(`/admin/clientes/${c.id}/${path}`, { method: 'POST' });
      await cargar();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function borrar(c) {
    if (!confirm(`¿Eliminar "${c.nombre_empresa}" y su estación? No se puede deshacer.`)) return;
    setBusy(c.id);
    try {
      await apiFetch('/admin/clientes/' + c.id, { method: 'DELETE' });
      await cargar();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function entrar(c) {
    try { await impersonate(c.id); navigate('/cliente', { replace: true }); }
    catch (e) { alert(e.message); }
  }

  async function agregarBiblioteca(c) {
    setBusy(c.id);
    try {
      const r = await apiFetch(`/admin/clientes/${c.id}/biblioteca`, { method: 'POST' });
      alert(r.message);
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function reaplicarPlan(c) {
    if (!confirm(`¿Re-aplicar los límites del plan "${c.plan}" a "${c.nombre_empresa}"?`)) return;
    setBusy(c.id);
    try {
      const r = await apiFetch(`/admin/clientes/${c.id}/reaplicar-plan`, { method: 'POST' });
      alert(r.message);
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  }

  /** Activa o quita la entrada SRT del canal abierto en el modal de accesos. */
  async function cambiarSrt(activo) {
    if (!accesos) return;
    setSrtBusy(true);
    try {
      const r = await apiFetch(`/admin/clientes/${accesos.id}/srt`, {
        method: 'PUT', body: JSON.stringify({ activo }),
      });
      // Se relee del nodo en vez de asumir: así la URL SRT aparece o
      // desaparece con el dato real, no con lo que creemos que pasó.
      setDatos(await apiFetch(`/admin/clientes/${accesos.id}/accesos`));
      alert(r.message);
    } catch (e) { alert(e.message); }
    finally { setSrtBusy(false); }
  }

  /** Permite (o no) que un tercero se baje la señal del canal por SRT. */
  async function cambiarSrtSalida(activo) {
    if (!accesos) return;
    setSrtSalidaBusy(true);
    try {
      const r = await apiFetch(`/admin/clientes/${accesos.id}/srt-salida`, {
        method: 'PUT', body: JSON.stringify({ activo }),
      });
      setDatos(await apiFetch(`/admin/clientes/${accesos.id}/accesos`));
      alert(r.message);
    } catch (e) { alert(e.message); }
    finally { setSrtSalidaBusy(false); }
  }

  async function verAccesos(c) {
    setAccesos(c); setDatos(null); setNuevaPass(null);
    try { setDatos(await apiFetch(`/admin/clientes/${c.id}/accesos`)); }
    catch (e) { setDatos({ error: e.message }); }
  }

  async function generarPassword() {
    if (!confirm('Se generará una contraseña NUEVA para el cliente; la anterior dejará de funcionar. ¿Continuar?')) return;
    setGenerando(true);
    try {
      const r = await apiFetch(`/admin/clientes/${accesos.id}/password`, { method: 'POST' });
      setNuevaPass(r.password);
    } catch (e) { alert(e.message); }
    finally { setGenerando(false); }
  }

  /** Texto listo para pegarle al cliente por WhatsApp/correo. */
  function mensajeCliente() {
    if (!datos) return '';
    const L = [`Hola! Estos son los accesos de "${datos.nombre_empresa}":`, '',
      `PANEL: ${window.location.origin}`,
      `Usuario: ${datos.usuario || '—'}`,
      `Contraseña: ${nuevaPass || '(la que ya tienes)'}`];
    if (datos.tipo === 'video' && datos.video) {
      L.push('', 'TRANSMITIR EN VIVO (OBS / vMix):', `Servidor: ${datos.video.servidor_rtmp}`, `Clave: ${datos.video.clave}`);
    } else if (datos.audio) {
      L.push('', 'TRANSMITIR EN VIVO (encoder / DJ):');
      if (datos.audio.dj_puerto) L.push(`Puerto: ${datos.audio.dj_puerto}`);
      if (datos.audio.dj_usuario) L.push(`Usuario: ${datos.audio.dj_usuario}`);
      if (datos.audio.dj_password) L.push(`Contraseña: ${datos.audio.dj_password}`);
      if (datos.audio.url_streaming) L.push('', `Escucha tu radio: ${datos.audio.url_streaming}`);
    }
    return L.join('\n');
  }

  // Solo los clientes y planes del servicio actual (audio | video)
  const lista = clientes.filter((c) => coincide(c.tipo));
  const planesTipo = planes.filter((p) => (p.tipo || 'audio') === tipo);

  // Al cambiar de servicio o cargar planes, el plan por defecto es del tipo correcto
  useEffect(() => {
    setForm((f) => (planesTipo.some((p) => String(p.id) === String(f.plan_id))
      ? f : { ...f, plan_id: planesTipo[0]?.id || '' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambito, planes]);

  return (
    <div className="space-y-6">
      {/* Tabla de clientes */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          {/* En modo "Todo" la lista mezcla los dos servicios: llamarla
              "Clientes de audio" seria mentir sobre lo que se esta viendo. */}
          <h2 className="font-semibold">
            {esTodo ? 'Todos los clientes' : `Clientes de ${esVideo ? 'video' : 'audio'}`}
            <span className="text-gray-400 font-normal"> ({lista.length})</span>
            {esTodo && (
              <span className="ml-2 text-xs font-normal text-gray-400">
                🎙️ {lista.filter((c) => (c.tipo || 'audio') !== 'video').length} audio ·
                🎬 {lista.filter((c) => c.tipo === 'video').length} video
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={cargar} className="btn-ghost !py-2 !px-3 text-xs"><IconRefresh width={15} height={15} /> Actualizar</button>
            <button onClick={() => { setMsg(null); setModalOpen(true); }} className="btn-primary !py-2 !px-3 text-xs">
              <IconPlus width={15} height={15} /> {T.crear}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="py-2.5 pr-3 font-medium">Empresa</th>
                <th className="py-2.5 px-3 font-medium">Plan</th>
                <th className="py-2.5 px-3 font-medium">Disco</th>
                <th className="py-2.5 px-3 font-medium text-right">Audiencia</th>
                <th className="py-2.5 px-3 font-medium text-right">Transferencia</th>
                <th className="py-2.5 px-3 font-medium">Estado</th>
                <th className="py-2.5 pl-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="py-8 text-center text-gray-400">Cargando…</td></tr>
              ) : lista.length === 0 ? (
                <tr><td colSpan="7" className="py-8 text-center text-gray-400">Sin clientes de {esVideo ? 'video' : 'audio'} todavía</td></tr>
              ) : (
                lista.map((c) => {
                  const est = ESTADO_BADGE[estados[c.id]] || ESTADO_BADGE.offline;
                  const suspendido = estados[c.id] === 'suspendido' || !c.activo;
                  const esV = c.tipo === 'video';
                  return (
                    <tr key={c.id} className="border-b border-gray-50 dark:border-gray-800/60 last:border-0">
                      <td className="py-3 pr-3">
                        <div className="font-medium flex items-center gap-2">
                          {/* Franja de color a la izquierda: de un vistazo se ve
                              dónde acaban las radios y empiezan los canales,
                              sin tener que leer etiqueta por etiqueta. */}
                          {esTodo && (
                            <span className={`w-1 h-8 rounded-full shrink-0 ${esV ? 'bg-fuchsia-500' : 'bg-brand-500'}`} />
                          )}
                          <span className="truncate">{c.nombre_empresa}</span>
                          {esTodo && (
                            <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full ${
                              esV
                                ? 'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-500/10 dark:text-fuchsia-400'
                                : 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400'
                            }`}>
                              {esV ? '🎬 Video' : '🎙️ Audio'}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">
                          <span className="font-mono">{c.username}</span>{c.email ? ` · ${c.email}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-3 capitalize">{c.plan}</td>
                      <td className="py-3 px-3">
                        <Disco usado={consumo[c.id]?.disco_bytes} total={consumo[c.id]?.disco_total_bytes} />
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span className="text-sm font-medium tabular-nums">
                          {(esV ? viewers[c.id] : oyentes[c.id]) ?? 0}
                        </span>
                        <div className="text-[10px] text-gray-400">
                          {esV
                            ? ((viewers[c.id] ?? 0) === 1 ? 'viewer' : 'viewers')
                            : ((oyentes[c.id] ?? 0) === 1 ? 'oyente' : 'oyentes')}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span className="text-sm tabular-nums">{peso(consumo[c.id]?.transferencia_bytes)}</span>
                        <div className="text-[10px] text-gray-400">este mes</div>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full ${est.cls}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${est.dot}`} /> {est.txt}
                        </span>
                      </td>
                      <td className="py-3 pl-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {busy === c.id ? (
                            <span className="text-xs text-gray-400 px-2">…</span>
                          ) : (
                            <>
                              {/* Control de emisión: sirve para radio (AzuraCast) y para canal de video (nodo) */}
                              <IconBtn title={esVideo ? 'Iniciar canal 24/7' : 'Iniciar / al aire'} onClick={() => accion(c, 'iniciar')} hover="brand"><IconPlay width={14} height={14} /></IconBtn>
                              <IconBtn title={esVideo ? 'Detener canal' : 'Parar transmisión'} onClick={() => accion(c, 'parar')} hover="amber"><IconStop width={13} height={13} /></IconBtn>
                              <IconBtn title={esVideo ? 'Reiniciar canal' : 'Reiniciar estación'} onClick={() => accion(c, 'reiniciar')} hover="brand"><IconRefresh width={14} height={14} /></IconBtn>
                              {suspendido ? (
                                <IconBtn title="Reactivar" onClick={() => accion(c, 'reactivar')} hover="brand"><IconPower width={14} height={14} /></IconBtn>
                              ) : (
                                <IconBtn title="Suspender" onClick={() => accion(c, 'suspender', `¿Suspender a "${c.nombre_empresa}"? Se apaga su ${esVideo ? 'canal' : 'radio'} y no podrá entrar.`)} hover="red"><IconPower width={14} height={14} /></IconBtn>
                              )}
                              {!esVideo && (
                                <>
                                  <IconBtn title="Re-aplicar límites del plan" onClick={() => reaplicarPlan(c)} hover="brand"><IconSliders width={14} height={14} /></IconBtn>
                                  <IconBtn title="Agregar música de cortesía" onClick={() => agregarBiblioteca(c)} hover="brand"><IconMusic width={14} height={14} /></IconBtn>
                                </>
                              )}
                              <IconBtn title="Editar nombre y plan" onClick={() => abrirEditar(c)} hover="brand"><IconLapiz width={14} height={14} /></IconBtn>
                              <IconBtn title="Ver accesos (usuario y datos de conexión)" onClick={() => verAccesos(c)} hover="brand"><IconLlave width={14} height={14} /></IconBtn>
                              <IconBtn title="Entrar al panel" onClick={() => entrar(c)} hover="brand"><IconEnter width={14} height={14} /></IconBtn>
                              <IconBtn title="Eliminar" onClick={() => borrar(c)} hover="red"><IconTrash width={14} height={14} /></IconBtn>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal crear cliente/radio */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={T.tituloModal}>
        <form onSubmit={crear} className="space-y-3">
          {planesTipo.length === 0 && (
            <div className="text-sm rounded-xl px-3 py-2 text-amber-700 bg-amber-50 dark:bg-amber-500/10">
              No hay planes de {esVideo ? 'video' : 'audio'} todavía. Crea uno en <b>Planes</b> para poder dar de alta {esVideo ? 'canales' : 'radios'}.
            </div>
          )}
          <div>
            <label className="label">{T.nombreLabel}</label>
            <input className="input" value={form.nombre_empresa} onChange={setNombre} placeholder={T.ph} required />
          </div>
          <div>
            <label className="label">Usuario de acceso</label>
            <input className="input font-mono" value={form.username} onChange={setUsername} placeholder="rockfm" required />
            <p className="text-xs text-gray-400 mt-1">Con esto entra al panel. Debe ser único; el email puede repetirse (un mismo cliente puede tener varias radios).</p>
          </div>
          <div>
            <label className="label">Email de contacto del cliente</label>
            <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="dueno@radio.com" required />
          </div>
          <div>
            <label className="label">Contraseña temporal</label>
            <input className="input" value={form.password} onChange={set('password')} placeholder="temporal123" required />
          </div>
          <div>
            <label className="label">Plan</label>
            <select className="input" value={form.plan_id} onChange={set('plan_id')} required>
              {planesTipo.map((p) => (
                <option key={p.id} value={p.id}>
                  {esVideo
                    ? `${p.nombre} · ${p.max_resolucion || '720p'} · ${p.espacio_mb ? Math.round(p.espacio_mb / 1024) + ' GB' : ''}`
                    : `${p.nombre} · ${p.max_bitrate || '∞'} kbps · ${p.max_oyentes} oyentes`}
                </option>
              ))}
            </select>
          </div>
          {esVideo && (
            <div>
              <label className="label">Nodo de video</label>
              <select className="input" value={form.servidor_id} onChange={set('servidor_id')}>
                <option value="">Automático (el de más cupo libre)</option>
                {servidores.filter((s) => s.tipo === 'video' && s.activo).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre} · libres {Math.max(0, (s.capacidad_radios || 0) - (s.radios || 0))}/{s.capacidad_radios || 0}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">En qué servidor se crea el canal. Elige uno a propósito para dirigir la migración a un nodo concreto.</p>
            </div>
          )}
          <p className="text-xs text-gray-400">{esVideo ? 'Se creará su canal en el nodo de video con los límites del plan.' : 'Se creará su estación en AzuraCast con los límites del plan y quedará al aire.'}</p>
          {msg && msg.type === 'err' && (
            <div className="text-sm rounded-xl px-3 py-2 text-red-600 bg-red-50 dark:bg-red-500/10">{msg.text}</div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-ghost flex-1">Cancelar</button>
            <button className="btn-primary flex-1" disabled={saving}>
              <IconPlus width={16} height={16} /> {saving ? 'Creando…' : T.crear}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal EDITAR nombre y plan */}
      <Modal open={!!editar} onClose={() => setEditar(null)} title={`Editar · ${editar?.nombre_empresa || ''}`}>
        <div className="space-y-3">
          <div>
            <label className="label">Nombre</label>
            <input className="input" value={editForm.nombre_empresa} onChange={(e) => setEditForm({ ...editForm, nombre_empresa: e.target.value })} />
          </div>
          <div>
            <label className="label">Plan</label>
            <select className="input" value={editForm.plan} onChange={(e) => setEditForm({ ...editForm, plan: e.target.value })}>
              <option value="">— sin plan —</option>
              {planesTipo.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">Asigna el plan del canal (para orden y facturación).</p>
          </div>
          {editMsg && <div className="text-sm rounded-xl px-3 py-2 text-red-600 bg-red-50 dark:bg-red-500/10">{editMsg}</div>}
          <div className="flex gap-2 pt-1">
            <button onClick={() => setEditar(null)} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={guardarEditar} disabled={editSaving} className="btn-primary flex-1">{editSaving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      </Modal>

      {/* Modal de ACCESOS del cliente */}
      <Modal open={!!accesos} onClose={() => setAccesos(null)} title={`Accesos · ${accesos?.nombre_empresa || ''}`}>
        {!datos ? (
          <p className="text-sm text-gray-400 py-6 text-center">Cargando…</p>
        ) : datos.error ? (
          <div className="text-sm rounded-xl px-3 py-2 text-red-600 bg-red-50 dark:bg-red-500/10">{datos.error}</div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="label">Panel del cliente</div>
              <Copiable texto={window.location.origin} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><div className="label">Usuario</div><Copiable texto={datos.usuario || '—'} /></div>
              <div><div className="label">Email</div><Copiable texto={datos.email || '—'} mono={false} /></div>
            </div>

            {/* Contraseña del panel: no es recuperable (hash) */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
              <div className="label">Contraseña del panel</div>
              {nuevaPass ? (
                <>
                  <Copiable texto={nuevaPass} />
                  <p className="text-[11px] text-brand-600 dark:text-brand-400 mt-1.5">⚠️ Cópiala ahora: no se vuelve a mostrar.</p>
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-400 mb-2">
                    Por seguridad se guarda encriptada y <b>no se puede recuperar</b>. Si el cliente la perdió, genera una nueva.
                  </p>
                  <button onClick={generarPassword} disabled={generando} className="btn-ghost !py-1.5 !px-2.5 text-xs disabled:opacity-60">
                    {generando ? 'Generando…' : '🔑 Generar contraseña nueva'}
                  </button>
                </>
              )}
            </div>

            {/* Datos de transmisión según el servicio */}
            {datos.tipo === 'video' ? (
              datos.video ? (
                <div className="space-y-2">
                  <div className="label">Transmitir en vivo (OBS / vMix)</div>
                  <Copiable texto={datos.video.servidor_rtmp} />
                  <Copiable texto={datos.video.clave} />

                  {/* Entrada SRT. Va junto al RTMP porque es lo mismo — otra
                      forma de subir — y es donde se mira cuando el cliente
                      se queja de que se le corta la señal. */}
                  {datos.video.srt_activo !== null && datos.video.srt_activo !== undefined && (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                      <div className="flex items-center justify-between mb-1.5">
                        <div>
                          <div className="label !mb-0">Entrada SRT</div>
                          <p className="text-[11px] text-gray-400">
                            Para conexiones inestables. No sustituye al RTMP: se suma.
                          </p>
                        </div>
                        <button
                          onClick={() => cambiarSrt(!datos.video.srt_activo)}
                          disabled={srtBusy}
                          className={`text-xs px-3 py-1.5 rounded-lg border transition shrink-0 ${
                            datos.video.srt_activo
                              ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                              : 'border-gray-200 dark:border-gray-800 text-gray-400 hover:border-brand-500'
                          }`}
                        >
                          {srtBusy ? '…' : datos.video.srt_activo ? '● Activa' : 'Desactivada'}
                        </button>
                      </div>
                      {datos.video.srt_activo && datos.video.srt && (
                        <>
                          <Copiable texto={datos.video.srt.url} />
                          <p className="text-[11px] text-gray-400 mt-1">
                            En OBS: Servicio «Personalizado», esta dirección en Servidor y la clave vacía.
                            Latencia {datos.video.srt.latencia_ms} ms.
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  {/* Salida SRT. Es la contraria: no deja subir, deja que un
                      tercero se LLEVE la señal. Por eso va en su propio bloque
                      y no como una opción más del de arriba. */}
                  {datos.video.srt_salida_activa !== null && datos.video.srt_salida_activa !== undefined && (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                      <div className="flex items-center justify-between mb-1.5">
                        <div>
                          <div className="label !mb-0">Salida SRT (cable operadores)</div>
                          <p className="text-[11px] text-gray-400">
                            Deja que un tercero se baje su señal. Para uno o dos destinos, no para el público.
                          </p>
                        </div>
                        <button
                          onClick={() => cambiarSrtSalida(!datos.video.srt_salida_activa)}
                          disabled={srtSalidaBusy}
                          className={`text-xs px-3 py-1.5 rounded-lg border transition shrink-0 ${
                            datos.video.srt_salida_activa
                              ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                              : 'border-gray-200 dark:border-gray-800 text-gray-400 hover:border-brand-500'
                          }`}
                        >
                          {srtSalidaBusy ? '…' : datos.video.srt_salida_activa ? '● Activa' : 'Desactivada'}
                        </button>
                      </div>
                      {datos.video.srt_salida_activa && datos.video.srt_salida && (
                        <>
                          <Copiable texto={datos.video.srt_salida.url} />
                          <p className="text-[11px] text-gray-400 mt-1">
                            Esta es la que se le pasa al operador. Cada conexión se lleva el flujo entero.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-400">No se pudieron leer los datos de conexión del nodo de video.</p>
              )
            ) : (
              <div className="space-y-2">
                <div className="label">Transmitir en vivo (encoder / DJ)</div>
                {datos.audio?.dj_usuario && <Copiable texto={`Usuario: ${datos.audio.dj_usuario}`} />}
                {datos.audio?.dj_password && <Copiable texto={`Clave: ${datos.audio.dj_password}`} />}
                {datos.audio?.dj_puerto && <Copiable texto={`Puerto: ${datos.audio.dj_puerto}`} />}
                {!datos.audio?.dj_usuario && <p className="text-xs text-gray-400">Esta radio aún no tiene datos de DJ guardados.</p>}
                {datos.audio?.url_streaming && (
                  <>
                    <div className="label" style={{ marginTop: 10 }}>URL de escucha</div>
                    <Copiable texto={datos.audio.url_streaming} />
                  </>
                )}
              </div>
            )}

            <button onClick={() => navigator.clipboard?.writeText(mensajeCliente())} className="btn-primary w-full text-sm">
              📋 Copiar mensaje listo para enviar
            </button>
          </div>
        )}
      </Modal>

      {msg && msg.type === 'ok' && (
        <div className="fixed bottom-5 right-5 z-50 text-sm rounded-xl px-4 py-3 shadow-lg text-white bg-brand-600">
          {msg.text}
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, title, onClick, hover }) {
  const h = {
    brand: 'hover:border-brand-500 hover:text-brand-600',
    red: 'hover:border-red-400 hover:text-red-500',
    amber: 'hover:border-amber-400 hover:text-amber-500',
  }[hover] || 'hover:border-brand-500';
  return (
    <button onClick={onClick} title={title}
      className={`w-8 h-8 grid place-items-center rounded-lg border border-gray-200 dark:border-gray-800 transition ${h}`}>
      {children}
    </button>
  );
}
