/**
 * services/monitor.js — vigilancia + alertas (nivel 1)
 * ------------------------------------------------------------------
 * Cada pocos minutos revisa TODOS los servidores y avisa cuando algo cambia a
 * mal (y cuando se recupera). Determinístico, sin IA: el "operador que nunca
 * duerme". Avisa por Telegram y/o WhatsApp (lo que configures).
 *
 * Alerta de:
 *   - Servidor que deja de responder (y su recuperación)
 *   - Radio/canal que se cae del aire (y su regreso)
 *   - Ancho de banda que se acerca al tope del servidor
 *
 * Canales de aviso (por variables de entorno; puedes usar uno o ambos):
 *   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
 *   WHATSAPP_TOKEN + WHATSAPP_TO  [+ WHATSAPP_API_URL]   (WhatsApp vía 360Messenger)
 *     WHATSAPP_TO       = tu número con código de país, ej. 573001234567
 *     WHATSAPP_API_URL  = endpoint de envío (por defecto el de 360Messenger)
 *   MONITOR_INTERVALO_MS (opcional, por defecto 3 min)
 * ------------------------------------------------------------------
 */
const servidorModel = require('../models/servidorModel');
const consumoModel = require('../models/consumoModel');
const clienteModel = require('../models/clienteModel');
const azuracast = require('./azuracast');
const videoNode = require('./videoNode');

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || '';
const WA_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WA_TO = process.env.WHATSAPP_TO || '';
const WA_URL = process.env.WHATSAPP_API_URL || 'https://api.360messenger.com/v2/sendMessage';
const INTERVALO = Number(process.env.MONITOR_INTERVALO_MS || 3 * 60 * 1000);

// Límites a partir de los cuales avisar sobre un nodo de video. Se avisa solo
// en el CAMBIO de nivel, no en cada ronda: una alerta que se repite cada 3
// minutos se deja de leer a la tercera, y entonces ya no sirve de nada.
const LIM = {
  disco_aviso: Number(process.env.LIM_DISCO_AVISO || 80),
  disco_critico: Number(process.env.LIM_DISCO_CRITICO || 92),
  cpu: Number(process.env.LIM_CPU || 85),
  memoria: Number(process.env.LIM_MEMORIA || 90),
  robado: Number(process.env.LIM_CPU_ROBADO || 25),
};
const GB = 1024 ** 3;

const hayTelegram = () => Boolean(TG_TOKEN && TG_CHAT);
const hayWhatsapp = () => Boolean(WA_TOKEN && WA_TO);
const configurado = () => hayTelegram() || hayWhatsapp();

// Último estado conocido, para alertar solo en los CAMBIOS (no spamear).
const st = { servidores: new Map(), clientes: new Map(), banda: new Map(), salud: new Map() };

async function enviarTelegram(texto) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text: texto, disable_web_page_preview: true }),
    });
    if (!r.ok) console.error('[monitor] telegram HTTP', r.status);
    return r.ok;
  } catch (e) { console.error('[monitor] telegram:', e.message); return false; }
}

async function enviarWhatsapp(texto) {
  try {
    const body = new URLSearchParams({ phonenumber: WA_TO, text: texto });
    const r = await fetch(WA_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!r.ok) console.error('[monitor] whatsapp HTTP', r.status);
    return r.ok;
  } catch (e) { console.error('[monitor] whatsapp:', e.message); return false; }
}

/** Envía la alerta por todos los canales configurados. Devuelve true si al menos uno salió. */
async function notificar(texto) {
  const envios = [];
  if (hayTelegram()) envios.push(enviarTelegram(texto));
  if (hayWhatsapp()) envios.push(enviarWhatsapp(texto));
  if (!envios.length) return false;
  const res = await Promise.all(envios);
  return res.some(Boolean);
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
        // Los canales viven en DOS sitios: las cuentas propias del nodo y los
        // heredados de asilivehd. Mirar solo las primeras dejaba sin vigilar a
        // 17 de los 20 canales — se caían y nadie se enteraba.
        const nodo = videoNode.crearCliente(s.url, s.api_key);
        const [cuentas, compat] = await Promise.all([nodo.cuentas(), nodo.compatClientes()]);
        if (!cuentas && !compat.length) throw new Error('sin respuesta');
        for (const c of cuentas || []) online[c.user] = Boolean(c.al_aire);
        for (const c of compat || []) online[c.user] = Boolean(c.al_aire);
      } else {
        const np = await azuracast.crearCliente(s.url, s.api_key).getNowPlayingAll();
        if (!np) throw new Error('sin respuesta');
        for (const e of np) online[e.station?.id] = Boolean(e.is_online);
      }
    } catch (_) { alcanzable = false; }

    // 1) Servidor caído / recuperado
    if (transicion(st.servidores, s.id, alcanzable, true)) {
      await notificar(alcanzable
        ? `✅ ${s.nombre} volvió a responder.`
        : `🔴 ${s.nombre} NO responde (${esVideo ? 'nodo de video' : 'AzuraCast'}). Revísalo.`);
    }
    if (!alcanzable) continue;

    // 2) Radios/canales de este servidor: caída / regreso al aire
    const mios = clientes.filter((c) => c.servidor_id === s.id && c.activo
      && (esVideo ? c.tipo === 'video' : c.tipo !== 'video'));
    for (const c of mios) {
      const clave = esVideo ? c.short_name : c.azuracast_station_id;
      const alAire = Boolean(online[clave]);
      if (transicion(st.clientes, c.id, alAire)) {
        await notificar(alAire
          ? `✅ ${c.nombre_empresa} volvió al aire.`
          : `🔴 ${c.nombre_empresa} se cayó (fuera del aire).`);
      }
    }

    // 3) Salud de la máquina del nodo de video (disco, CPU, memoria, servicios)
    if (esVideo) await revisarSalud(s);

    // 4) Banda cerca del tope
    if (s.banda_mensual_gb) {
      try {
        const dias = await consumoModel.mesActual(s.id);
        const gb = dias.reduce((a, d) => a + Number(d.bytes), 0) / GB;
        const pct = gb / s.banda_mensual_gb;
        const nivel = pct >= 0.9 ? 'critico' : pct >= 0.75 ? 'alto' : 'ok';
        if (transicion(st.banda, s.id, nivel) && nivel !== 'ok') {
          await notificar(`${nivel === 'critico' ? '🚨' : '⚠️'} ${s.nombre}: banda al ${Math.round(pct * 100)}% del tope (${gb.toFixed(0)}/${s.banda_mensual_gb} GB este mes).`);
        }
      } catch (_) {}
    }
  }
}

/**
 * Vigila la máquina de un nodo de video y avisa al cruzar un límite.
 *
 * Cada cosa se sigue por separado con su propio nivel: si el disco se pone
 * crítico y además cae MediaMTX, llegan dos avisos distintos y no uno que
 * tape al otro. Y solo se avisa cuando el nivel CAMBIA, para que el mensaje
 * signifique «esto acaba de pasar» y no «esto sigue igual».
 */
async function revisarSalud(s) {
  const salud = await videoNode.crearCliente(s.url, s.api_key).salud();
  if (!salud) return;    // agente antiguo sin la ruta, o nodo mudo (ya se avisó arriba)

  const avisos = [];
  const nivelar = (clave, nivel, texto) => {
    if (transicion(st.salud, `${s.id}:${clave}`, nivel) && nivel !== 'ok') avisos.push(texto);
  };

  const disco = salud.disco?.usado_pct;
  if (disco != null) {
    const nivel = disco >= LIM.disco_critico ? 'critico' : disco >= LIM.disco_aviso ? 'alto' : 'ok';
    const libre = (salud.disco.libre_bytes / 1024 ** 3).toFixed(1);
    nivelar('disco', nivel, `${nivel === 'critico' ? '🚨' : '⚠️'} ${s.nombre}: disco al ${disco}% (quedan ${libre} GB). Sin espacio, nginx deja de escribir el video y los canales se quedan mudos.`);
  }

  const cpu = salud.cpu?.usado_pct;
  if (cpu != null) {
    nivelar('cpu', cpu >= LIM.cpu ? 'alto' : 'ok',
      `⚠️ ${s.nombre}: CPU al ${cpu}% de ${salud.cpu.nucleos} núcleos. Con el CPU saturado el video empieza a entrecortarse.`);
  }

  // El CPU robado se sigue aparte porque no se arregla optimizando nada: es el
  // proveedor dando menos máquina de la que vende.
  const robado = salud.cpu?.robado_pct;
  if (robado != null) {
    nivelar('robado', robado >= LIM.robado ? 'alto' : 'ok',
      `⚠️ ${s.nombre}: el proveedor se está llevando el ${robado}% del CPU (steal). No es consumo nuestro; si sigue así, hay que reclamar o cambiar de máquina.`);
  }

  const mem = salud.memoria?.usado_pct;
  if (mem != null) {
    nivelar('memoria', mem >= LIM.memoria ? 'alto' : 'ok',
      `⚠️ ${s.nombre}: memoria al ${mem}%. Si se llena, el sistema empieza a matar procesos y se caen canales.`);
  }

  for (const [nombre, vivo] of Object.entries(salud.servicios || {})) {
    if (transicion(st.salud, `${s.id}:svc:${nombre}`, Boolean(vivo), true)) {
      avisos.push(vivo
        ? `✅ ${s.nombre}: ${nombre} volvió a levantarse.`
        : `🔴 ${s.nombre}: ${nombre} NO está corriendo. ${nombre === 'nginx' ? 'Sin él no se ve ningún canal.' : 'Sin él no entra ni sale nada por SRT.'}`);
    }
  }

  for (const texto of avisos) await notificar(texto);
}

/** Envía un mensaje de prueba por los canales configurados. */
async function probar() {
  if (!configurado()) return { ok: false, error: 'No hay canal configurado. Pon TELEGRAM_* o WHATSAPP_* en el .env.' };
  const ok = await notificar('🔔 Prueba de alertas — el monitor de tu panel está conectado y vigilando tus servidores. ✅');
  const canales = [hayTelegram() && 'Telegram', hayWhatsapp() && 'WhatsApp'].filter(Boolean).join(' y ');
  return ok ? { ok: true, message: `Mensaje de prueba enviado por ${canales} ✅` } : { ok: false, error: 'No se pudo enviar. Revisa el token y el destino.' };
}

let timer = null;
function iniciar() {
  if (timer) return;
  if (!configurado()) {
    console.log('🔔 Monitor: sin canal de avisos configurado (Telegram o WhatsApp). Se activa al ponerlos en el .env.');
    return;
  }
  revisar().catch((e) => console.error('[monitor]', e.message));   // primera lectura (fija estados)
  timer = setInterval(() => revisar().catch((e) => console.error('[monitor]', e.message)), INTERVALO);
  const canales = [hayTelegram() && 'Telegram', hayWhatsapp() && 'WhatsApp'].filter(Boolean).join(' + ');
  console.log(`🔔 Monitor de alertas activo (cada ${INTERVALO / 60000} min, avisa por ${canales})`);
}

module.exports = { iniciar, probar, revisar };
