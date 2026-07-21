/**
 * scripts/metadata.js — ¿la radio está enviando metadata a los reproductores?
 *
 *   node scripts/metadata.js https://server2.streaminghd.co/listen/prueb03/radio.mp3
 *
 * Se conecta al stream como lo haría un player (protocolo ICY) y muestra el
 * título que está llegando. Sirve para saber si el problema es del panel, del
 * AutoDJ o del programa con el que transmite el DJ en vivo.
 */
const net = require('net');
const tls = require('tls');
const { URL } = require('url');

const url = process.argv[2];
if (!url) {
  console.log('Uso: node scripts/metadata.js <URL del stream>');
  process.exit(1);
}

const u = new URL(url);
const seguro = u.protocol === 'https:';
const puerto = u.port || (seguro ? 443 : 80);
const ruta = u.pathname + u.search;

const conectar = seguro
  ? tls.connect({ host: u.hostname, port: puerto, servername: u.hostname })
  : net.connect({ host: u.hostname, port: puerto });

let buf = Buffer.alloc(0);
let cabeceraLista = false;
let metaint = 0;
let restanteAudio = 0;
let esperandoLargo = false;
let restanteMeta = 0;
let lecturas = 0;
let conTitulo = 0;

const salir = (codigo) => { try { conectar.destroy(); } catch (_) {} process.exit(codigo); };

conectar.setTimeout(15000, () => { console.log('❌ Tiempo agotado: la radio no respondió.'); salir(1); });
conectar.on('error', (e) => { console.log('❌ No se pudo conectar:', e.message); salir(1); });

conectar.on('connect', () => {
  conectar.write(
    `GET ${ruta} HTTP/1.0\r\nHost: ${u.hostname}\r\n` +
    'Icy-MetaData: 1\r\nUser-Agent: PanelRadio/1.0\r\n\r\n'
  );
});

conectar.on('data', (chunk) => {
  buf = Buffer.concat([buf, chunk]);

  // --- 1) Cabeceras -------------------------------------------------
  if (!cabeceraLista) {
    const corte = buf.indexOf('\r\n\r\n');
    if (corte === -1) return;
    const cabecera = buf.slice(0, corte).toString('utf8');
    buf = buf.slice(corte + 4);
    cabeceraLista = true;

    const lineas = cabecera.split('\r\n');
    const h = {};
    lineas.slice(1).forEach((l) => {
      const i = l.indexOf(':');
      if (i > 0) h[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
    });

    console.log('── RESPUESTA:', lineas[0]);
    if (!/200|OK/.test(lineas[0])) {
      console.log('❌ La radio no está al aire o la URL es incorrecta.');
      return salir(1);
    }

    console.log('\n── DATOS DEL STREAM');
    console.log('   Nombre  :', h['icy-name'] || '(sin nombre)');
    console.log('   Género  :', h['icy-genre'] || '—');
    console.log('   Bitrate :', h['icy-br'] || '—', 'kbps');
    console.log('   Formato :', h['content-type'] || '—');

    metaint = Number(h['icy-metaint'] || 0);
    if (!metaint) {
      console.log('\n❌ El stream NO abre canal de metadata (falta icy-metaint).');
      console.log('   Ningún reproductor podrá mostrar qué suena.');
      return salir(2);
    }
    console.log('   Metadata: cada', metaint, 'bytes ✅');
    console.log('\n── QUÉ ESTÁ SONANDO (3 lecturas del stream)');
    restanteAudio = metaint;
  }

  // --- 2) Audio y bloques de metadata intercalados -------------------
  while (buf.length) {
    if (restanteAudio > 0) {
      const n = Math.min(restanteAudio, buf.length);
      buf = buf.slice(n);
      restanteAudio -= n;
      if (restanteAudio === 0) esperandoLargo = true;
      continue;
    }
    if (esperandoLargo) {
      if (!buf.length) return;
      restanteMeta = buf[0] * 16;
      buf = buf.slice(1);
      esperandoLargo = false;
      if (restanteMeta === 0) {
        console.log(`   ${++lecturas}) (sin cambios)`);
        restanteAudio = metaint;
        if (lecturas >= 3) return resumen();
      }
      continue;
    }
    if (restanteMeta > 0) {
      if (buf.length < restanteMeta) return;
      const bloque = buf.slice(0, restanteMeta).toString('utf8').replace(/\0+$/, '');
      buf = buf.slice(restanteMeta);
      restanteMeta = 0;

      const m = bloque.match(/StreamTitle='([^']*)'/);
      const titulo = m ? m[1] : '';
      console.log(`   ${++lecturas}) ${titulo || '(vacío)'}`);
      if (titulo.trim()) conTitulo++;

      restanteAudio = metaint;
      if (lecturas >= 3) return resumen();
    }
  }
});

conectar.on('close', () => { if (cabeceraLista && lecturas < 3) resumen(); });

function resumen() {
  console.log();
  if (conTitulo) {
    console.log('✅ La radio SÍ envía el título. Los players lo mostrarán.');
  } else {
    console.log('⚠️  El canal existe pero llega VACÍO: nadie está poniendo el título.');
    console.log('   Suele pasar cuando el DJ en vivo no configuró el envío de títulos');
    console.log('   en su programa (BUTT, Mixxx, Sam Broadcaster…).');
  }
  salir(0);
}
