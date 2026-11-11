import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/** Plots ESTIMATED locations (from IP data). points: [{ lat, lng, label, color }] */
export default function LocationMap({ points = [], height = 320 }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const valid = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

  useEffect(() => {
    if (!el.current || map.current) return undefined;
    map.current = L.map(el.current, { scrollWheelZoom: false, worldCopyJump: true }).setView([20, 10], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!map.current || !layer.current) return;
    layer.current.clearLayers();
    valid.forEach((p) => {
      L.circleMarker([p.lat, p.lng], { radius: 8, color: p.color || '#4b93ff', fillColor: p.color || '#4b93ff', fillOpacity: 0.35, weight: 2 })
        .bindPopup(p.label || '').addTo(layer.current);
    });
    if (valid.length === 1) map.current.setView([valid[0].lat, valid[0].lng], 5);
    else if (valid.length > 1) map.current.fitBounds(valid.map((p) => [p.lat, p.lng]), { padding: [40, 40], maxZoom: 6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(valid)]);

  return (
    <div>
      <div ref={el} style={{ height }} className="w-full overflow-hidden rounded-lg border border-ops-600" role="img" aria-label="Map of estimated visitor locations" />
      <p className="mt-2 text-xs text-ops-muted">
        {valid.length ? 'Estimated from IP address data. This is the network’s registered area, not an exact or home address.' : 'No location data to plot yet.'}
      </p>
    </div>
  );
}
