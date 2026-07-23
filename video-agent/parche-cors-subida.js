/**
 * parche-cors-subida.js — agrega la respuesta al preflight CORS en /_subir
 * de las cuentas YA creadas (las nuevas ya salen bien desde la plantilla).
 *
 * Por qué: la subida desde el panel usa barra de progreso (listener en
 * xhr.upload), lo que hace que el navegador mande un OPTIONS antes del POST.
 * Si nginx no lo responde, el navegador bloquea la subida con error de CORS.
 *
 * Es idempotente: si la config ya tiene el bloque, la salta.
 * Uso:  node parche-cors-subida.js   (luego: systemctl reload nginx-panel)
 */
const fs = require('fs');
const path = require('path');

const DIRS = [
  process.env.NGINX_CUENTAS_DIR || '/opt/nginx-panel/conf/cuentas',
  process.env.CONF_DIR || '/opt/nginx-panel/conf',
];

const AGENTE = process.env.PUERTO_AGENTE || '3000';

const OPTIONS_BLOQUE = `
        # Preflight CORS de la subida (la barra de progreso lo hace obligatorio)
        if ($request_method = OPTIONS) {
            add_header 'Access-Control-Allow-Origin' '*' always;
            add_header 'Access-Control-Allow-Methods' 'POST, OPTIONS' always;
            add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, Range' always;
            add_header 'Access-Control-Max-Age' 86400 always;
            add_header 'Content-Length' 0;
            add_header 'Content-Type' 'text/plain';
            return 204;
        }
`;

// Cuentas viejas (migradas de VDO) que nunca tuvieron la subida directa:
// hay que agregarles la location entera, no solo el preflight.
const LOCATION_COMPLETA = `
    # --- Subida directa del navegador al agente (archivos grandes) ---
    location /_subir {${OPTIONS_BLOQUE}
        proxy_pass http://127.0.0.1:${AGENTE}/subir;
        proxy_request_buffering off;      # pasa el archivo directo, sin bufferear GB
        proxy_http_version 1.1;
        proxy_read_timeout 3600s;         # subidas largas
        client_max_body_size 0;           # sin límite de nginx (lo pone el agente)
        add_header 'Access-Control-Allow-Origin' '*' always;
    }
`;

let parcheados = 0;
let saltados = 0;
const vistos = new Set();

for (const dir of DIRS) {
  let archivos = [];
  try { archivos = fs.readdirSync(dir).filter((f) => f.endsWith('.http')); } catch { continue; }

  for (const f of archivos) {
    const ruta = path.join(dir, f);
    if (vistos.has(ruta)) continue;
    vistos.add(ruta);

    let txt;
    try { txt = fs.readFileSync(ruta, 'utf8'); } catch { continue; }

    if (txt.includes('$request_method = OPTIONS')) {
      console.log(`  ya estaba: ${f}`);
      saltados++;
      continue;
    }

    let nuevo;
    if (txt.includes('location /_subir')) {
      // Ya tiene la subida: solo le falta responder el preflight
      nuevo = txt.replace(/location \/_subir\s*\{/, (m) => m + OPTIONS_BLOQUE);
    } else {
      // Cuenta vieja sin subida directa: se le agrega la location completa
      // justo antes de la llave que cierra el bloque server { }
      const cierre = txt.lastIndexOf('}');
      if (cierre === -1) { console.log(`  ⚠️ sin bloque server: ${f}`); saltados++; continue; }
      nuevo = txt.slice(0, cierre) + LOCATION_COMPLETA + txt.slice(cierre);
    }

    // Respaldo antes de tocar nada
    fs.writeFileSync(ruta + '.bak', txt);
    fs.writeFileSync(ruta, nuevo);
    console.log(`  parcheado: ${f}   (respaldo en ${f}.bak)`);
    parcheados++;
  }
}

console.log(`\n✅ ${parcheados} config(s) parcheada(s), ${saltados} sin cambios.`);
if (parcheados) console.log('   Ahora: /opt/nginx-panel/sbin/nginx -t  &&  systemctl reload nginx-panel');
