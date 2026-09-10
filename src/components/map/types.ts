export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  /** Marker accent. Provider-neutral semantic name. */
  tone?: 'primary' | 'muted' | 'success' | 'warning';
}

export interface MapWrapperProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarker[];
  className?: string;
  /** Called when the map viewport changes — enables "follow driver" behaviour. */
  onViewportChange?: (v: { center: { lat: number; lng: number }; zoom: number }) => void;
}
