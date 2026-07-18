import { useRef, useState, useEffect } from 'react';
import { IconPlay, IconPause, IconVolume } from '../icons';

/**
 * Reproductor de stream reutilizable.
 * props: src (URL de escucha), title, subtitle
 * Si el stream está fuera de aire, el <audio> dispara onError y lo mostramos.
 */
export default function Player({ src, title, subtitle }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [volume, setVolume] = useState(0.8);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Al cambiar de estación, resetea el estado
  useEffect(() => {
    setPlaying(false);
    setError(false);
    if (audioRef.current) audioRef.current.pause();
  }, [src]);

  async function toggle() {
    const a = audioRef.current;
    if (!a || !src) return;
    if (playing) {
      a.pause();
      setPlaying(false);
      return;
    }
    setError(false);
    setLoading(true);
    // cache-busting para forzar una conexión fresca al stream en vivo
    a.src = src + (src.includes('?') ? '&' : '?') + '_=' + Date.now();
    try {
      await a.play();
      setPlaying(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  const estado = error
    ? 'Fuera de aire'
    : loading
    ? 'Conectando…'
    : playing
    ? subtitle || 'En vivo'
    : 'Detenido';

  return (
    <div className="card p-4 flex items-center gap-4">
      <button
        onClick={toggle}
        disabled={!src}
        className="w-12 h-12 shrink-0 rounded-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white grid place-items-center transition active:scale-95"
        title={playing ? 'Pausar' : 'Reproducir'}
      >
        {loading ? (
          <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        ) : playing ? (
          <IconPause width={20} height={20} />
        ) : (
          <IconPlay width={20} height={20} />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{title || 'Radio'}</div>
        <div className={`text-xs truncate flex items-center gap-1.5 ${error ? 'text-red-500' : 'text-gray-400'}`}>
          {playing && !error && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
          {estado}
        </div>
      </div>

      <div className="hidden sm:flex items-center gap-2 w-32">
        <IconVolume width={16} height={16} className="text-gray-400 shrink-0" />
        <input
          type="range" min="0" max="1" step="0.01" value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="w-full accent-brand-600 cursor-pointer"
        />
      </div>

      <audio
        ref={audioRef}
        onError={() => { setError(true); setPlaying(false); setLoading(false); }}
        onStalled={() => setLoading(true)}
        onPlaying={() => { setLoading(false); setPlaying(true); }}
        onPause={() => setPlaying(false)}
      />
    </div>
  );
}
