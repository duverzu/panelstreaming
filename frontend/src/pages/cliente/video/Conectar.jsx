import { useEffect, useState } from 'react';
import { IconMic } from '../../../icons';
import Copiable from '../../../components/Copiable';
import { apiFetch } from '../../../api';
import { useVideo } from './useVideo';

export default function VideoConectar() {
  const { data, error } = useVideo();
  if (error && data === undefined) return <div className="py-10 text-center text-red-600">{error}</div>;
  if (data === undefined) return <p className="py-10 text-center text-gray-400">Cargando…</p>;

  if (!data.permite_vivo || !data.conexion) {
    return (
      <div className="space-y-6">
        <div className="card p-8 text-center text-gray-400">
          <div className="text-3xl mb-2">🎥</div>
          Tu plan no incluye transmisión en vivo. Tu canal emite tus videos en bucle 24/7.
        </div>
        <RestreamFacebook />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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

      {data.srt && <ConexionSrt srt={data.srt} />}
      {data.srt_salida && <SalidaSrt srt={data.srt_salida} />}

      <RestreamFacebook />
    </div>
  );
}

/** Conexión SRT: la alternativa para quien tiene internet inestable.
 *  Solo aparece si se le activó desde el panel — mostrarla a quien no la tiene
 *  sería darle una dirección que le va a rechazar la conexión. */
function ConexionSrt({ srt }) {
  return (
    <div className="card p-5 max-w-2xl border-brand-200 dark:border-brand-500/30">
      <h2 className="font-semibold flex items-center gap-2 mb-1">
        📡 Transmitir por SRT
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">recomendado si se te corta</span>
      </h2>
      <p className="text-xs text-gray-400 mb-4">
        Es otra forma de subir la misma señal. Si tu internet pierde datos, SRT los reenvía y
        la transmisión aguanta, mientras que por RTMP se congela. <b>Usa una u otra, no las dos a la vez.</b>
      </p>

      <div className="space-y-3">
        <div>
          <div className="label mb-1">Servidor (URL completa)</div>
          <Copiable texto={srt.url} />
        </div>
        <div>
          <div className="label mb-1">Clave de transmisión</div>
          <div className="text-sm text-gray-400 rounded-xl bg-gray-50 dark:bg-gray-950 px-3 py-2">
            Déjala <b>vacía</b>: tus datos ya van dentro de la dirección de arriba.
          </div>
        </div>
      </div>

      <div className="mt-4 text-xs text-gray-400 rounded-xl bg-gray-50 dark:bg-gray-950 p-3 space-y-1.5">
        <div><b>En OBS:</b> Ajustes → Emisión → Servicio «Personalizado», pega la URL en «Servidor» y deja «Clave» en blanco.</div>
        <div>
          El <b>búfer de {srt.latencia_ms / 1000} s</b> es el margen que tiene para recuperar lo que se pierda:
          tu señal sale al aire con ese retraso. Es lo que compra la estabilidad.
        </div>
      </div>
    </div>
  );
}

/** Salida SRT: la dirección que le pasa a su cable operador para que se baje
 *  la señal. Es lo contrario de las otras dos tarjetas — aquí no sube nada. */
function SalidaSrt({ srt }) {
  return (
    <div className="card p-5 max-w-2xl">
      <h2 className="font-semibold flex items-center gap-2 mb-1">📤 Entregar tu señal a un cable operador</h2>
      <p className="text-xs text-gray-400 mb-4">
        Esta dirección <b>no es para transmitir</b>: es para que otro se lleve tu canal. Se la pasas a tu
        cable operador y él la pone en su equipo. Llega con unos 2 segundos de retraso, en vez de los
        20–30 del enlace normal.
      </p>

      <div className="label mb-1">Dirección para el operador</div>
      <Copiable texto={srt.url} />

      <div className="mt-4 text-xs text-amber-700 dark:text-amber-400 rounded-xl bg-amber-50 dark:bg-amber-500/10 p-3">
        <b>No la pongas en tu web ni se la des a tu público.</b> Cada persona que se conecte se lleva tu
        señal completa, sin comprimir. Es para uno o dos destinos concretos; para el público está tu
        enlace de siempre.
      </div>
    </div>
  );
}

/** Reenvío del canal a Facebook Live (solo si el plan lo permite). */
function RestreamFacebook() {
  const [cfg, setCfg] = useState(undefined);
  const [clave, setClave] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState(null);

  const cargar = () => apiFetch('/cliente/video/restream').then(setCfg).catch(() => setCfg({ permite: false }));
  useEffect(() => { cargar(); }, []);

  if (cfg === undefined) return null;
  if (!cfg.permite) return null;   // plan sin restream → la tarjeta no se muestra

  async function aplicar(encender) {
    setGuardando(true); setMsg(null);
    try {
      const body = { encender };
      if (clave.trim()) body.facebook_key = clave.trim();
      await apiFetch('/cliente/video/restream', { method: 'PUT', body: JSON.stringify(body) });
      setClave('');
      setMsg({ ok: true, text: encender ? '✅ Retransmitiendo a Facebook' : 'Retransmisión detenida' });
      cargar();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setGuardando(false); }
  }

  return (
    <div className="card p-5 max-w-2xl">
      <h2 className="font-semibold flex items-center gap-2 mb-1">📘 Retransmitir a Facebook</h2>
      <p className="text-xs text-gray-400 mb-4">Envía tu canal a tu página de Facebook Live. Se retransmite lo que esté al aire (tus videos o tu vivo).</p>

      <div className="flex items-center gap-2 mb-4 text-sm">
        <span className={`w-2 h-2 rounded-full ${cfg.activo ? 'bg-brand-500 animate-pulse' : 'bg-gray-300 dark:bg-gray-700'}`} />
        {cfg.activo ? <b className="text-brand-600 dark:text-brand-400">En vivo en Facebook</b> : <span className="text-gray-500">Apagado{cfg.tiene_clave ? ' (clave guardada)' : ''}</span>}
      </div>

      <div className="label mb-1">Clave de transmisión de Facebook Live</div>
      <input value={clave} onChange={(e) => setClave(e.target.value)} type="password"
        placeholder={cfg.tiene_clave ? '•••• (guardada — escribe una nueva para cambiarla)' : 'pega aquí tu clave de Facebook'}
        className="input font-mono text-sm" autoComplete="off" />
      <p className="text-[11px] text-gray-400 mt-1.5">
        La sacas en Facebook → <b>Herramienta de transmisión en vivo</b> → «Usar clave de transmisión». Usa una <b>clave persistente</b> para no cambiarla cada vez.
      </p>

      {msg && <div className={`mt-3 text-sm rounded-xl px-3 py-2 ${msg.ok ? 'text-brand-700 bg-brand-50 dark:bg-brand-500/10 dark:text-brand-400' : 'text-red-600 bg-red-50 dark:bg-red-500/10'}`}>{msg.text}</div>}

      <div className="flex gap-2 mt-4">
        <button onClick={() => aplicar(true)} disabled={guardando || (!clave.trim() && !cfg.tiene_clave)} className="btn-primary text-sm disabled:opacity-60">
          {guardando ? 'Aplicando…' : cfg.activo ? 'Actualizar' : 'Guardar y activar'}
        </button>
        {cfg.activo && (
          <button onClick={() => aplicar(false)} disabled={guardando} className="btn-ghost text-sm">Apagar</button>
        )}
      </div>
    </div>
  );
}
