import { useEffect, useRef, useState } from 'react';

/**
 * Reproductor HLS para el canal del cliente. Usa hls.js donde el navegador
 * no soporta HLS nativo (Chrome/Firefox) y el <video> nativo donde sí (Safari).
 * props: src (URL .m3u8), poster
 */
export default function VideoPlayer({ src, poster }) {
  const ref = useRef(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video || !src) return;
    setError(false);
    let hls;
    let cancelado = false;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;                               // Safari / iOS: HLS nativo
    } else {
      // hls.js se carga solo cuando de verdad se necesita un player de video,
      // así los clientes de radio no cargan esa librería.
      import('hls.js').then(({ default: Hls }) => {
        if (cancelado) return;
        if (Hls.isSupported()) {
          hls = new Hls({ liveDurationInfinity: true });
          hls.loadSource(src);
          hls.attachMedia(video);
          // Si el canal se reinicia, sus segmentos viejos desaparecen y hls.js
          // da error. En vez de quedarse en blanco, recarga el stream solo.
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (!data.fatal) return;
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              setError(false);
              setTimeout(() => { if (!cancelado) hls.loadSource(src); }, 4000);
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
            } else { setError(true); }
          });
        } else { setError(true); }
      }).catch(() => setError(true));
    }
    return () => { cancelado = true; if (hls) hls.destroy(); };
  }, [src]);

  return (
    <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
      <video ref={ref} controls playsInline poster={poster}
        className="w-full h-full object-contain bg-black" />
      {error && (
        <div className="absolute inset-0 grid place-items-center text-center text-sm text-white/70 p-4">
          <div>
            <div className="text-3xl mb-2">📺</div>
            Tu canal no está transmitiendo ahora mismo.<br />
            <span className="text-xs text-white/50">Aparecerá aquí en cuanto tu emisión esté al aire.</span>
          </div>
        </div>
      )}
    </div>
  );
}
