export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  tone?: 'primary' | 'muted' | 'success' | 'warning';
}

export interface MapWrapperProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarker[];
  className?: string;
  /** Recenter the map when `center` changes. Default true. */
  follow?: boolean;
  onViewportChange?: (v: { center: { lat: number; lng: number }; zoom: number }) => void;
}
