import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Interactive Leaflet Location Map for CamShield Security Console.
 * Displays:
 *  - Blue Marker: Approximate IP-based location
 *  - Green Marker: Real-time GPS location (pulsing, when authorized)
 */
export default function LiveLocationMap({
  visitorId,
  ipLocation,
  gpsLocation,
  height = 420
}) {
  const mapEl = useRef(null);
  const mapInstance = useRef(null);
  const ipLayer = useRef(null);
  const gpsLayer = useRef(null);

  // Initialise Leaflet Map
  useEffect(() => {
    if (!mapEl.current || mapInstance.current) return;

    const map = L.map(mapEl.current, {
      scrollWheelZoom: false,
      worldCopyJump: true,
      zoomControl: true
    }).setView([20, 0], 2);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19
    }).addTo(map);

    ipLayer.current = L.layerGroup().addTo(map);
    gpsLayer.current = L.layerGroup().addTo(map);

    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  // Update Markers when IP or GPS changes
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !ipLayer.current || !gpsLayer.current) return;

    ipLayer.current.clearLayers();
    gpsLayer.current.clearLayers();

    const bounds = [];

    // 1. Blue IP Marker
    const hasIpCoords =
      ipLocation &&
      Number.isFinite(Number(ipLocation.lat)) &&
      Number.isFinite(Number(ipLocation.lng));

    if (hasIpCoords) {
      const ipLat = Number(ipLocation.lat);
      const ipLng = Number(ipLocation.lng);
      bounds.push([ipLat, ipLng]);

      const blueIcon = L.divIcon({
        className: 'custom-leaflet-marker',
        html: `
          <div style="position:relative; width:28px; height:28px; display:flex; align-items:center; justify-content:center;">
            <div style="width:24px; height:24px; border-radius:50%; background:rgba(59,130,246,0.25); border:2px solid #3b82f6; display:flex; align-items:center; justify-content:center; box-shadow:0 0 10px rgba(59,130,246,0.5);">
              <div style="width:8px; height:8px; border-radius:50%; background:#60a5fa;"></div>
            </div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14]
      });

      const ipPopup = `
        <div style="font-family:sans-serif; color:#0f172a; min-width:180px; padding:4px;">
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
            <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#3b82f6;"></span>
            <strong style="font-size:12px; color:#1e3a8a;">IP Approximate Location</strong>
          </div>
          <div style="font-size:11px; margin-bottom:2px;"><strong>Visitor:</strong> ${visitorId ? visitorId.slice(0, 8) : '–'}</div>
          <div style="font-size:11px; margin-bottom:2px;"><strong>City:</strong> ${ipLocation.city || '–'}, ${ipLocation.country || ''}</div>
          <div style="font-size:11px; margin-bottom:2px;"><strong>Coordinates:</strong> ${ipLat.toFixed(4)}, ${ipLng.toFixed(4)}</div>
          <div style="font-size:10px; color:#64748b; margin-top:4px; border-top:1px solid #e2e8f0; padding-top:4px;">
            Estimated from network routing data. Not an exact street address.
          </div>
        </div>
      `;

      L.marker([ipLat, ipLng], { icon: blueIcon })
        .bindPopup(ipPopup)
        .addTo(ipLayer.current);
    }

    // 2. Green GPS Marker
    const hasGpsCoords =
      gpsLocation &&
      Number.isFinite(Number(gpsLocation.lat)) &&
      Number.isFinite(Number(gpsLocation.lng));

    if (hasGpsCoords) {
      const gpsLat = Number(gpsLocation.lat);
      const gpsLng = Number(gpsLocation.lng);
      bounds.push([gpsLat, gpsLng]);

      const isLive = gpsLocation.sharing !== false;
      const accuracy = Math.round(Number(gpsLocation.accuracy) || 15);

      const greenIcon = L.divIcon({
        className: 'custom-leaflet-marker',
        html: `
          <div style="position:relative; width:36px; height:36px; display:flex; align-items:center; justify-content:center;">
            ${
              isLive
                ? `<div style="position:absolute; width:34px; height:34px; border-radius:50%; background:#10b981; opacity:0.4; animation:leaflet-ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>`
                : ''
            }
            <div style="position:relative; width:26px; height:26px; border-radius:50%; background:rgba(16,185,129,0.3); border:2px solid #10b981; display:flex; align-items:center; justify-content:center; box-shadow:0 0 12px rgba(16,185,129,0.7);">
              <div style="width:10px; height:10px; border-radius:50%; background:#34d399;"></div>
            </div>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18]
      });

      const updatedStr = gpsLocation.updatedAt
        ? new Date(gpsLocation.updatedAt).toLocaleTimeString()
        : 'Just now';

      const gpsPopup = `
        <div style="font-family:sans-serif; color:#0f172a; min-width:200px; padding:4px;">
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
            <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10b981;"></span>
            <strong style="font-size:12px; color:#065f46;">
              ${isLive ? 'Real-Time GPS Location (LIVE)' : 'Authorized GPS Location (Ended)'}
            </strong>
          </div>
          <div style="font-size:11px; margin-bottom:2px;"><strong>Visitor ID:</strong> ${visitorId ? visitorId.slice(0, 8) : '–'}</div>
          <div style="font-size:11px; margin-bottom:2px;"><strong>Coordinates:</strong> ${gpsLat.toFixed(5)}, ${gpsLng.toFixed(5)}</div>
          <div style="font-size:11px; margin-bottom:2px;"><strong>Accuracy:</strong> ±${accuracy} meters</div>
          <div style="font-size:11px; margin-bottom:2px;"><strong>Last Updated:</strong> ${updatedStr}</div>
          <div style="font-size:10px; color:#64748b; margin-top:4px; border-top:1px solid #e2e8f0; padding-top:4px;">
            Explicitly authorized by visitor via browser Geolocation API.
          </div>
        </div>
      `;

      L.marker([gpsLat, gpsLng], { icon: greenIcon })
        .bindPopup(gpsPopup)
        .addTo(gpsLayer.current);

      // Draw accuracy circle
      L.circle([gpsLat, gpsLng], {
        radius: accuracy,
        color: '#10b981',
        weight: 1,
        fillColor: '#10b981',
        fillOpacity: 0.12
      }).addTo(gpsLayer.current);
    }

    // Adjust Map View to fit markers
    if (bounds.length === 1) {
      map.setView(bounds[0], hasGpsCoords ? 13 : 8);
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [visitorId, ipLocation, gpsLocation]);

  return (
    <div className="relative">
      <style>{`
        @keyframes leaflet-ping {
          75%, 100% {
            transform: scale(2);
            opacity: 0;
          }
        }
      `}</style>

      {/* Map Container */}
      <div
        ref={mapEl}
        style={{ height }}
        className="w-full overflow-hidden rounded-xl border border-ops-600 bg-ops-950"
        role="region"
        aria-label="Interactive visitor live location map"
      />

      {/* Map Legend Overlay */}
      <div className="absolute bottom-4 left-4 z-[400] flex flex-wrap items-center gap-3 rounded-lg border border-ops-600/80 bg-ops-950/90 px-3 py-2 text-xs backdrop-blur-sm">
        <div className="flex items-center gap-1.5 text-ops-text">
          <span className="inline-block size-3 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
          <span>Blue: IP Approximate Location</span>
        </div>
        <div className="flex items-center gap-1.5 text-ops-text">
          <span className="inline-block size-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
          <span>Green: Real-time GPS Location (Authorized)</span>
        </div>
      </div>
    </div>
  );
}

