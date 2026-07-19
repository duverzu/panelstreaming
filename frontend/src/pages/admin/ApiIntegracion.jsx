import { useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import { IconPlus, IconTrash, IconCopy, IconCheck } from '../../icons';

function Copiable({ texto, mono = true }) {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={() => navigator.clipboard?.writeText(texto).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); })}
      className={`inline-flex items-center gap-1.5 ${mono ? 'font-mono' : ''} text-sm px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-brand-500 transition break-all text-left`}>
      {ok ? <IconCheck width={13} height={13} className="text-brand-600 shrink-0" /> : <IconCopy width={13} height={13} className="shrink-0" />}
      <span className="truncate">{texto}</span>
    </button>
  );
}

export default function AdminApiIntegracion() {
  const [keys, setKeys] = useState([]);
  const [nombre, setNombre] = useState('');
  const [nuevoToken, setNuevoToken] = useState(null);
  const base = `${window.location.origin}/api/provision`;

  async function cargar() { const { keys } = await apiFetch('/admin/api-keys'); setKeys(keys); }
  useEffect(() => { cargar(); }, []);

  async function crear(e) {
    e.preventDefault();
    if (!nombre.trim()) return;
    const r = await apiFetch('/admin/api-keys', { method: 'POST', body: JSON.stringify({ nombre: nombre.trim() }) });
    setNuevoToken(r.token);
    setNombre('');
    cargar();
  }
  async function toggle(k) { await apiFetch('/admin/api-keys/' + k.id, { method: 'PUT', body: JSON.stringify({ activo: !k.activo }) }); cargar(); }
  async function eliminar(k) { if (!confirm(`¿Eliminar la llave "${k.nombre}"?`)) return; await apiFetch('/admin/api-keys/' + k.id, { method: 'DELETE' }); cargar(); }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Llaves */}
      <div className="card p-5">
        <h2 className="font-semibold mb-1">Llaves de API</h2>
        <p className="text-xs text-gray-400 mb-4">Genera una llave para que tu sistema de facturación (WHMCS u otro) cree radios automáticamente al pagar una orden.</p>

        {nuevoToken && (
          <div className="mb-4 rounded-xl border border-brand-300 dark:border-brand-500/40 bg-brand-50 dark:bg-brand-500/10 p-3">
            <div className="text-sm font-medium text-brand-700 dark:text-brand-400 mb-1">✅ Llave creada — cópiala ahora (no se vuelve a mostrar)</div>
            <Copiable texto={nuevoToken} />
          </div>
        )}

        <form onSubmit={crear} className="flex gap-2 mb-4">
          <input className="input flex-1" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre (ej: WHMCS producción)" />
          <button className="btn-primary shrink-0"><IconPlus width={16} height={16} /> Generar llave</button>
        </form>

        <div className="space-y-2">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
              <div className="flex-1 min-w-0">
                <div className="font-medium">{k.nombre}</div>
                <div className="text-xs text-gray-400 font-mono">{k.token} · {k.ultimo_uso ? 'usada' : 'sin usar'}</div>
              </div>
              <button onClick={() => toggle(k)} className={`text-xs px-2.5 py-1 rounded-lg border transition ${k.activo ? 'border-brand-500 text-brand-600' : 'border-gray-200 dark:border-gray-800 text-gray-400'}`}>{k.activo ? 'Activa' : 'Desactivada'}</button>
              <button onClick={() => eliminar(k)} className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 dark:border-gray-800 hover:border-red-400 hover:text-red-500 transition"><IconTrash width={15} height={15} /></button>
            </div>
          ))}
          {keys.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Sin llaves todavía</p>}
        </div>
      </div>

      {/* Documentación de la API */}
      <div className="card p-5">
        <h2 className="font-semibold mb-3">Cómo conectar tu facturación</h2>
        <div className="space-y-3 text-sm">
          <div>
            <div className="text-gray-500 mb-1">URL base de la API</div>
            <Copiable texto={base} />
          </div>
          <div>
            <div className="text-gray-500 mb-1">Autenticación (header)</div>
            <Copiable texto={'Authorization: Bearer TU_LLAVE'} />
          </div>
          <div className="text-gray-500">Endpoints (como un módulo de WHMCS):</div>
          <div className="rounded-xl bg-gray-50 dark:bg-gray-950 p-3 font-mono text-xs space-y-1 overflow-x-auto">
            <div><span className="text-brand-600">GET</span>    /test                         → prueba de conexión</div>
            <div><span className="text-brand-600">GET</span>    /planes                       → planes disponibles</div>
            <div><span className="text-brand-600">GET</span>    /servicios                    → LISTA todas las radios (sincronizar)</div>
            <div><span className="text-blue-600">POST</span>   /servicios                    → crear radio (al pagar)</div>
            <div><span className="text-blue-600">POST</span>   /servicios/:id/suspender      → suspender (impago)</div>
            <div><span className="text-blue-600">POST</span>   /servicios/:id/reactivar      → reactivar (pagó)</div>
            <div><span className="text-blue-600">POST</span>   /servicios/:id/plan           → cambiar plan</div>
            <div><span className="text-red-600">DELETE</span> /servicios/:id                → terminar (baja)</div>
            <div><span className="text-brand-600">GET</span>    /servicios/:id                → estado/uso</div>
          </div>
          <div>
            <div className="text-gray-500 mb-1">Ejemplo — crear radio al pagar una orden:</div>
            <pre className="rounded-xl bg-gray-50 dark:bg-gray-950 p-3 text-xs overflow-x-auto">{`curl -X POST ${base}/servicios \\
  -H "Authorization: Bearer TU_LLAVE" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"cliente@correo.com","nombre_empresa":"Rock FM","plan":"Profesional"}'`}</pre>
          </div>
          <p className="text-xs text-gray-400">Respuesta: datos de acceso del cliente + datos de la estación (URL de streaming y conexión DJ). El flujo es igual al de Centova/WHMCS: creas el producto apuntando a un plan, y al pagar la factura tu facturación llama a <code>/servicios</code>.</p>
        </div>
      </div>
    </div>
  );
}
