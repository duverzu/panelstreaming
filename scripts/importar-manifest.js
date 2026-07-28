/**
 * scripts/importar-manifest.js — importa el manifiesto contra el panel
 * ------------------------------------------------------------------
 * Lee manifest.json (del exportador) y llama a POST /admin/migracion/importar
 * en lotes, mostrando el avance. No crea nada por su cuenta: solo empuja el
 * manifiesto al panel, que es quien crea las estaciones en el servidor destino.
 *
 * USO:
 *   PANEL_URL=https://server2.streaminghd.co \
 *   ADMIN_TOKEN=<token de sesión admin> \
 *   SERVIDOR_ID=<id del servidor NUEVO en el panel> \
 *   node scripts/importar-manifest.js manifest.json
 *
 * Para sacar ADMIN_TOKEN: entra al panel como admin y copia el token del
 * almacenamiento del navegador (o usa el login por API). Ver MIGRACION.md.
 * ------------------------------------------------------------------
 */
const fs = require('fs');

const archivo = process.argv[2] || 'manifest.json';
const PANEL = (process.env.PANEL_URL || '').replace(/\/$/, '');
const TOKEN = process.env.ADMIN_TOKEN;
const SERVIDOR_ID = process.env.SERVIDOR_ID;
const PLAN_ID = process.env.PLAN_ID || undefined;
const LOTE = Number(process.env.LOTE || 5);   // de a 5 para no saturar AzuraCast

if (!PANEL || !TOKEN || !SERVIDOR_ID) {
  console.error('Faltan variables: PANEL_URL, ADMIN_TOKEN y SERVIDOR_ID son obligatorias.');
  process.exit(1);
}

async function main() {
  const cuentas = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  console.log(`Importando ${cuentas.length} cuentas al servidor ${SERVIDOR_ID}, de a ${LOTE}…\n`);

  let creadas = 0, saltadas = 0, errores = 0;
  for (let i = 0; i < cuentas.length; i += LOTE) {
    const grupo = cuentas.slice(i, i + LOTE);
    const resp = await fetch(`${PANEL}/api/admin/migracion/importar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ servidor_id: Number(SERVIDOR_ID), plan_id: PLAN_ID, cuentas: grupo }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) { console.error(`  ✗ lote ${i / LOTE + 1}: ${data.error || resp.status}`); errores += grupo.length; continue; }
    for (const r of data.resultados || []) {
      const icono = r.estado === 'creada' ? '✓' : r.estado === 'saltada' ? '·' : '✗';
      console.log(`  ${icono} ${r.usuario} — ${r.estado}${r.motivo ? ' (' + r.motivo + ')' : ''}${r.url_streaming ? ' → ' + r.url_streaming : ''}`);
    }
    creadas += data.creadas || 0; saltadas += data.saltadas || 0; errores += data.errores || 0;
  }

  console.log(`\n✅ Listo: ${creadas} creadas, ${saltadas} saltadas, ${errores} con error.`);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
