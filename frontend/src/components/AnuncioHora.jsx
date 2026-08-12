import { useEffect, useState } from 'react';
import { apiFetch } from '../api';

const CADA = [{ v: 60, t: 'Cada hora en punto' }, { v: 30, t: 'Cada media hora' }, { v: 15, t: 'Cada 15 minutos' }];

const ZONAS = [
  ['America/Bogota', 'Colombia (Bogotá)'], ['America/Mexico_City', 'México (CDMX)'],
  ['America/Lima', 'Perú (Lima)'], ['America/Santiago', 'Chile (Santiago)'],
  ['America/Argentina/Buenos_Aires', 'Argentina (Bs. As.)'], ['America/Caracas', 'Venezuela'],
  ['America/Guayaquil', 'Ecuador'], ['America/Panama', 'Panamá'],
  ['America/New_York', 'EE.UU. (Este)'], ['America/Los_Angeles', 'EE.UU. (Oeste)'],
  ['America/Sao_Paulo', 'Brasil (São Paulo)'], ['Europe/Madrid', 'España (Madrid)'], ['UTC', 'UTC'],
];

/** "Da la hora" — anuncio de hora automático por voz (estilo Zara/RadioBOSS). */
export default function AnuncioHora() {
  const [cfg, setCfg] = useState(undefined);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState(null);

  const cargar = () => apiFetch('/cliente/anuncio-hora').then(setCfg).catch(() => setCfg({ disponible: false }));
  useEffect(() => { cargar(); }, []);

  if (cfg === undefined) return null;
  if (!cfg.disponible) return null;

  async function guardar(cambios) {
    setOcupado(true); setMsg(null);
    try {
      const r = await apiFetch('/cliente/anuncio-hora', {
        method: 'PUT',
        body: JSON.stringify({ activo: cfg.activo, cada_min: cfg.cada_min, con_saludo: cfg.con_saludo, ...cambios }),
      });
      setCfg((c) => ({ ...c, ...r }));
    } catch (e) { setMsg({ type: 'err', text: e.message }); }
    finally { setOcupado(false); }
  }

  async function probar() {
    setOcupado(true); setMsg(null);
    try { const r = await apiFetch('/cliente/anuncio-hora/probar', { method: 'POST' }); setMsg({ type: 'ok', text: r.message }); }
    catch (e) { setMsg({ type: 'err', text: e.message }); }
    finally { setOcupado(false); }
  }

  return (
    <div className="card p-5 space-y-4 max-w-2xl">
      <div>
        <h2 className="font-semibold flex items-center gap-2">🕒 Da la hora (automático)</h2>
        <p className="text-xs text-gray-400 mt-1">Tu radio dirá la hora con voz sola, como en Zara o RadioBOSS. Ejemplo: «{cfg.ejemplo}».</p>
      </div>

      <div>
        <label className="label">Zona horaria de tu emisora</label>
        <select className="input !w-auto text-sm" value={cfg.zona_horaria || 'America/Bogota'} disabled={ocupado}
          onChange={(e) => guardar({ zona_horaria: e.target.value })}>
          {ZONAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        <p className="text-[11px] text-gray-400 mt-1">La hora de tus <b>anuncios y cuñas</b> se calcula con esta zona. Por defecto: Colombia.</p>
      </div>

      <div>
        <label className="label">Voz del locutor</label>
        <div className="flex gap-2">
          {[['masculina', '👨 Masculina'], ['femenina', '👩 Femenina']].map(([v, t]) => (
            <button key={v} type="button" disabled={ocupado} onClick={() => guardar({ voz: v })}
              className={`px-3 py-1.5 rounded-xl text-sm border transition ${(cfg.voz || 'masculina') === v
                ? 'bg-brand-500 text-white border-brand-500'
                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
              {t}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-1">Voz que dice la <b>hora y las cuñas de texto</b>. La masculina es de locutor (más natural); la femenina es la voz estándar. Las cuñas ya creadas conservan su voz.</p>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={cfg.activo} disabled={ocupado} onChange={(e) => guardar({ activo: e.target.checked })} />
        <span className="text-sm">Activar el anuncio de la hora</span>
      </label>

      {cfg.activo && (
        <div className="space-y-3 pl-6">
          <div>
            <label className="label">¿Cada cuánto?</label>
            <select className="input !w-auto text-sm" value={cfg.cada_min} disabled={ocupado} onChange={(e) => guardar({ cada_min: Number(e.target.value) })}>
              {CADA.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={cfg.con_saludo} disabled={ocupado} onChange={(e) => guardar({ con_saludo: e.target.checked })} />
            Anteponer un saludo («Atención…»)
          </label>

          {/* Clima */}
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={cfg.con_clima} disabled={ocupado} onChange={(e) => guardar({ con_clima: e.target.checked })} />
            Decir también el clima 🌤️
          </label>
          {cfg.con_clima && (
            <div>
              <label className="label">Ciudad (para el clima)</label>
              <input className="input !w-auto text-sm" defaultValue={cfg.ciudad || ''} placeholder="Ej: Cali"
                onBlur={(e) => e.target.value.trim() !== (cfg.ciudad || '') && guardar({ ciudad: e.target.value.trim() })} />
              <p className="text-[11px] text-gray-400 mt-1">Ej: «…y ahora mismo 26 grados en Cali, despejado». Escribe la ciudad y sal del campo para guardar.</p>
            </div>
          )}

          <button type="button" onClick={probar} disabled={ocupado} className="btn-ghost !py-1.5 !px-3 text-xs">🔊 Probar ahora</button>
          <p className="text-[11px] text-gray-400">Al probar, el anuncio suena <b>al terminar la canción que esté sonando</b> (no la corta). No es instantáneo: espera a que acabe el tema actual.</p>
        </div>
      )}

      {msg && <div className={`text-sm rounded-xl px-3 py-2 ${msg.type === 'ok' ? 'text-brand-700 bg-brand-50 dark:bg-brand-500/10 dark:text-brand-400' : 'text-red-600 bg-red-50 dark:bg-red-500/10'}`}>{msg.text}</div>}
    </div>
  );
}
