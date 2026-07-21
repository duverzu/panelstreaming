/**
 * services/nowplaying.js
 * ------------------------------------------------------------------
 * Normaliza el "sonando ahora" de AzuraCast para el panel y los players.
 *
 * El problema que resuelve: cuando un DJ entra en vivo y su programa NO
 * envía títulos, AzuraCast deja colgada la ÚLTIMA canción del AutoDJ. El
 * panel entonces muestra una canción que ya no suena.
 *
 * Se detecta comparando cuándo empezó la canción con cuándo empezó la
 * transmisión en vivo: si la canción es anterior, es del AutoDJ y quedó
 * obsoleta. En ese caso se muestra "En vivo" y el nombre del DJ.
 * ------------------------------------------------------------------
 */

function normalizar(np) {
  const song = np?.now_playing?.song || {};
  const esVivo = Boolean(np?.live?.is_live);
  const streamer = np?.live?.streamer_name || '';

  const inicioVivo = Number(np?.live?.broadcast_start || 0);
  const inicioCancion = Number(np?.now_playing?.played_at || 0);

  // Título heredado del AutoDJ: empezó ANTES de que el DJ entrara al aire.
  // Si AzuraCast no informa cuándo empezó la transmisión, no se asume nada.
  const obsoleto = esVivo && inicioVivo > 0 && inicioCancion > 0 && inicioCancion < inicioVivo;

  const hayTitulo = Boolean(song.title || song.text);
  const mostrarCancion = hayTitulo && !obsoleto;

  return {
    is_online: Boolean(np?.is_online),
    is_live: esVivo,
    streamer,
    // Lo que realmente suena, ya resuelto para pintar en pantalla
    titulo: mostrarCancion ? (song.title || song.text || '') : (esVivo ? 'En vivo' : ''),
    artista: mostrarCancion ? (song.artist || '') : (esVivo ? streamer : ''),
    art: mostrarCancion ? (song.art || '') : '',
    // Señales para la interfaz
    fuente: esVivo ? 'vivo' : 'autodj',
    // true = está en vivo y su programa no envía el nombre de la canción
    sin_metadata_en_vivo: esVivo && (obsoleto || !hayTitulo),
    listeners: np?.listeners?.current ?? 0,
  };
}

module.exports = { normalizar };
