import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapWrapperProps, MapMarker } from './types';

const TONE_COLORS: Record<NonNullable<MapMarker['tone']>, string> = {
  primary: '#2563eb',
  muted: '#64748b',
  success: '#16a34a',
  warning: '#d97706',
};

function pinIcon(tone: MapMarker['tone'] = 'primary') {
  const color = TONE_COLORS[tone];
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
      <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.3 21.7 0 14 0z" fill="${color}"/>
      <circle cx="14" cy="14" r="5.5" fill="#fff"/>
    </svg>`;
  return L.divIcon({ html: svg, className: '', iconSize: [28, 36], iconAnchor: [14, 36] });
}

function ViewportReporter({ onViewportChange }: Pick<MapWrapperProps, 'onViewportChange'>) {
  const map = useMap();
  useEffect(() => {
    if (!onViewportChange) return;
    const handler = () => {
      const c = map.getCenter();
      onViewportChange({ center: { lat: c.lat, lng: c.lng }, zoom: map.getZoom() });
    };
    map.on('moveend', handler);
    return () => { map.off('moveend', handler); };
  }, [map, onViewportChange]);
  return null;
}

function Recenter({ lat, lng, zoom, follow }: { lat: number; lng: number; zoom: number; follow: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!follow) return;
    map.setView([lat, lng], zoom, { animate: true });
  }, [map, lat, lng, zoom, follow]);
  return null;
}

export function LeafletMap({
  center = { lat: 6.5244, lng: 3.3792 },
  zoom = 12,
  markers = [],
  className = 'h-96 w-full rounded-lg',
  follow = true,
  onViewportChange,
}: MapWrapperProps) {
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={zoom} className={className}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Recenter lat={center.lat} lng={center.lng} zoom={zoom} follow={follow} />
      <ViewportReporter onViewportChange={onViewportChange} />
      {markers.map((m) => (
        <Marker key={m.id} position={[m.lat, m.lng]} icon={pinIcon(m.tone)}>
          {m.label && <Popup>{m.label}</Popup>}
        </Marker>
      ))}
    </MapContainer>
  );
}
