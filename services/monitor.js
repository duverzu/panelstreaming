/**
 * services/monitor.js — vigilancia + alertas por Telegram (nivel 1)
 * ------------------------------------------------------------------
 * Cada pocos minutos revisa TODOS los servidores y avisa por Telegram cuando
 * algo cambia a mal (y cuando se recupera). Es determinístico, sin IA: es el
 * "operador que nunca duerme".
 *
 * Alerta de:
 *   - Servidor que deja de responder (y su recuperación)
 *   - Radio/canal que se cae del aire (y su regreso)
 *   - Ancho de banda que se acerca al tope del servidor
 *
 * Config por variables de entorno:
 *   TELEGRAM_BOT_TOKEN   (de @BotFather)
 *   TELEGRAM_CHAT_ID     (chat/grupo donde llegan las alertas)
 *   MONITOR_INTERVALO_MS (opcional, por defecto 3 min)
 * ------------------------------------------------------------------
 */
const servidorModel = require('../models/servidorModel');
const consumoModel = require('../models/consumoModel');
const clienteModel = require('../models/clienteModel');
const azuracast = require('./azuracast');
const videoNode = require('./videoNode');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT = process.env.TELEGRAM_CHAT_ID || '';
const INTERVALO = Number(process.env.MONITOR_INTERVALO_MS || 3 * 60 * 1000);
const GB = 1024 ** 3;

// Último estado conocido, para alertar solo en los CAMBIOS (no spamear).
const st = { servidores: new Map(), clientes: new Map(), banda: new Map() };

async function telegram(texto) {
  if (!TOKEN || !CHAT) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text: texto, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    if (!r.ok) console.error('[monitor] telegram HTTP', r.status);
    return r.ok;
  } catch (e) { console.error('[monitor] telegram:', e.message); return false; }
}

/** ¿Debe alertar este cambio? (la primera lectura no alerta, salvo servidor caído). */
function transicion(mapa, clave, nuevo, alertarPrimeraSiMal = false) {
  const prev = mapa.get(clave);
  mapa.set(clave, nuevo);
  if (prev === undefined) return alertarPrimeraSiMal && nuevo === false;
  return prev !== nuevo;
}

async function revisar() {
  const servidores = (await servidorModel.findAllConUso()).filter((s) => s.activo);
  const clientes = await clienteModel.findAllWithEmail();

  for (const s of servidores) {
    const esVideo = s.tipo === 'video';
    let alcanzable = true;
    const online = {};   // clave (station_id | user) -> al aire?

    try {
      if (esVideo) {
        const cuentas = await videoNode.crearCliente(s.url, s.api_key).cuentas();
        if (!cuentas) throw new Error('sin respuesta');
        for (const c of cuentas) online[c.user] = Boolean(c.al_aire);
      } else {
        const np = await azuracast.crearCliente(s.url, s.api_key).getNowPlayingAll();
        if (!np) throw new Error('sin respuesta');
        for (const e of np) online[e.station?.id] = Boolean(e.is_online);
      }
    } catch (_) { alcanzable = false; }

    // 1) Servidor caído / recuperado
    if (transicion(st.servidores, s.id, alcanzable, true)) {
      await telegram(alcanzable
        ? `✅ <b>${s.nombre}</b> volvió a responder.`
        : `🔴 <b>${s.nombre}</b> NO responde (${esVideo ? 'nodo de video' : 'AzuraCast'}). Revísalo.`);
    }
    if (!alcanzable) continue;

    // 2) Radios/canales de este servidor: caída / regreso al aire
    const mios = clientes.filter((c) => c.servidor_id === s.id && c.activo
      && (esVideo ? c.tipo === 'video' : c.tipo !== 'video'));
    for (const c of mios) {
      const clave = esVideo ? c.short_name : c.azuracast_station_id;
      const alAire = Boolean(online[clave]);
      if (transicion(st.clientes, c.id, alAire)) {
        await telegram(alAire
          ? `✅ <b>${c.nombre_empresa}</b> volvió al aire.`
          : `🔴 <b>${c.nombre_empresa}</b> se cayó (fuera del aire).`);
      }
    }

    // 3) Banda cerca del tope
    if (s.banda_mensual_gb) {
      try {
        const dias = await consumoModel.mesActual(s.id);
        const gb = dias.reduce((a, d) => a + Number(d.bytes), 0) / GB;
        const pct = gb / s.banda_mensual_gb;
        const nivel = pct >= 0.9 ? 'critico' : pct >= 0.75 ? 'alto' : 'ok';
        if (transicion(st.banda, s.id, nivel) && nivel !== 'ok') {
          await telegram(`${nivel === 'critico' ? '🚨' : '⚠️'} <b>${s.nombre}</b>: banda al ${Math.round(pct * 100)}% del tope (${gb.toFixed(0)}/${s.banda_mensual_gb} GB este mes).`);
        }
      } catch (_) {}
    }
  }
}

/** Envía un mensaje de prueba para verificar la config. */
async function probar() {
  if (!TOKEN || !CHAT) return { ok: false, error: 'Falta TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en el .env' };
  const ok = await telegram('🔔 <b>Prueba de alertas</b> — el monitor de tu panel está conectado y vigilando tus servidores. ✅');
  return ok ? { ok: true, message: 'Mensaje de prueba enviado a Telegram ✅' } : { ok: false, error: 'No se pudo enviar. Revisa el token y el chat_id.' };
}

let timer = null;
function iniciar() {
  if (timer) return;
  if (!TOKEN || !CHAT) {
    console.log('🔔 Monitor: sin Telegram configurado (TELEGRAM_BOT_TOKEN/CHAT_ID). Se activa al ponerlos en el .env.');
    return;
  }
  revisar().catch((e) => console.error('[monitor]', e.message));   // primera lectura (fija estados)
  timer = setInterval(() => revisar().catch((e) => console.error('[monitor]', e.message)), INTERVALO);
  console.log(`🔔 Monitor de alertas activo (revisa cada ${INTERVALO / 60000} min, avisa por Telegram)`);
}

module.exports = { iniciar, probar, revisar };
