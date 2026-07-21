/**
 * services/embedPage.js
 * ------------------------------------------------------------------
 * Genera el HTML del reproductor embebible (iframe).
 * Autónomo: reproduce el stream y muestra carátula + metadata en vivo,
 * consultando /api/public/nowplaying/:shortcode del mismo origen.
 * ------------------------------------------------------------------
 */
function embedPage(shortcode, baseURL) {
  const base = baseURL || process.env.AZURACAST_BASE_URL;
  const streamUrl = `${base}/listen/${shortcode}/radio.mp3`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Reproductor</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  body { background:#0d1117; color:#e6edf3; }
  .player { display:flex; align-items:center; gap:14px; padding:14px; background:linear-gradient(135deg,#161b22,#1a2029); border-radius:16px; }
  .art { width:72px; height:72px; border-radius:12px; object-fit:cover; background:#2a323d; flex-shrink:0; }
  .info { flex:1; min-width:0; }
  .live { display:inline-flex; align-items:center; gap:5px; font-size:10px; font-weight:700; color:#f85149; text-transform:uppercase; margin-bottom:3px; }
  .live .dot { width:7px; height:7px; border-radius:50%; background:#f85149; animation:p 1.2s infinite; }
  @keyframes p { 50%{opacity:.3} }
  .title { font-size:15px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .artist { font-size:13px; color:#8b949e; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .btn { width:48px; height:48px; border:none; border-radius:50%; background:linear-gradient(135deg,#10b981,#059669); color:#fff; cursor:pointer; flex-shrink:0; display:grid; place-items:center; transition:transform .05s; }
  .btn:active { transform:scale(.94); }
  .btn svg { width:22px; height:22px; }
  .listeners { font-size:11px; color:#8b949e; margin-top:2px; }
</style>
</head>
<body>
  <div class="player">
    <img id="art" class="art" src="" alt="" />
    <div class="info">
      <div id="live" class="live" style="display:none"><span class="dot"></span> En vivo</div>
      <div id="title" class="title">Cargando…</div>
      <div id="artist" class="artist"></div>
      <div id="listeners" class="listeners"></div>
    </div>
    <button id="btn" class="btn" aria-label="Reproducir">
      <svg id="ico" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
    </button>
  </div>

  <audio id="audio" preload="none"></audio>

  <script>
    var SHORT = ${JSON.stringify(shortcode)};
    var STREAM = ${JSON.stringify(streamUrl)};
    var DEFAULT_ART = ${JSON.stringify(`${base}/static/img/generic_song.jpg`)};
    var audio = document.getElementById('audio');
    var btn = document.getElementById('btn');
    var ico = document.getElementById('ico');
    var playing = false;

    var PLAY = '<path d="M8 5v14l11-7z"/>';
    var PAUSE = '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>';

    btn.onclick = function(){
      if (playing) { audio.pause(); }
      else { audio.src = STREAM + '?_=' + Date.now(); audio.play().catch(function(){}); }
    };
    audio.onplaying = function(){ playing = true; ico.innerHTML = PAUSE; };
    audio.onpause = function(){ playing = false; ico.innerHTML = PLAY; };

    function refresca(){
      fetch('/api/public/nowplaying/' + encodeURIComponent(SHORT))
        .then(function(r){ return r.json(); })
        .then(function(d){
          // El backend ya resuelve el titulo: si el DJ esta en vivo sin enviar
          // metadata, manda "En vivo" en vez de la cancion vieja del AutoDJ.
          var t = d.title, a = d.artist || '';
          if (!t) t = d.is_online ? 'En emisión' : 'Fuera de aire';
          document.getElementById('title').textContent = t;
          document.getElementById('artist').textContent = a;
          document.getElementById('art').src = d.art || DEFAULT_ART;
          document.getElementById('live').style.display = d.is_live ? 'inline-flex' : 'none';
          document.getElementById('listeners').textContent = d.listeners ? ('🎧 ' + d.listeners + ' oyentes') : '';
        })
        .catch(function(){});
    }
    refresca();
    setInterval(refresca, 12000);
  </script>
</body>
</html>`;
}

module.exports = embedPage;
