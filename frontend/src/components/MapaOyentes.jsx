import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/** Mapa de oyentes con Leaflet + OpenStreetMap (gratis, sin API key). */
export default function MapaOyentes({ oyentes = [] }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  // Inicializa el mapa una sola vez
  useEffect(() => {
    if (mapRef.current || !ref.current) return;
    const map = L.map(ref.current, { worldCopyJump: true, minZoom: 1 }).setView([10, -30], 1.6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 18,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 200); // asegura el render correcto del tamaño
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Actualiza los marcadores cuando cambian los oyentes
  useEffect(() => {
    const layer = layerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();
    const pts = oyentes.filter((o) => o.lat != null && o.lon != null);
    pts.forEach((o) => {
      L.circleMarker([o.lat, o.lon], {
        radius: 7, color: '#059669', fillColor: '#10b981', fillOpacity: 0.6, weight: 2,
      }).bindPopup(`<b>${o.ciudad || o.pais || 'Oyente'}</b><br>${o.dispositivo || ''}`).addTo(layer);
    });
    if (pts.length) {
      try { map.fitBounds(L.latLngBounds(pts.map((o) => [o.lat, o.lon])).pad(0.3)); } catch {}
    }
  }, [oyentes]);

  const conCoords = oyentes.filter((o) => o.lat != null).length;

  return (
    <div className="relative">
      <div ref={ref} style={{ height: 320 }} className="rounded-xl overflow-hidden z-0" />
      {conCoords === 0 && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <span className="text-sm text-gray-500 bg-white/80 dark:bg-gray-900/80 px-3 py-1.5 rounded-lg">
            {oyentes.length ? 'Oyentes sin ubicación (falta GeoLite2 en AzuraCast)' : 'Sin oyentes en el mapa ahora'}
          </span>
        </div>
      )}
    </div>
  );
}
