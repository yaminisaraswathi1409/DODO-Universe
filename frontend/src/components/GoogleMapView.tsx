'use client';

import React from 'react';
import { APIProvider, Map, Marker } from '@vis.gl/react-google-maps';
import { MapPin, AlertCircle } from 'lucide-react';

export interface MapMarker {
  id?: string;
  lat: number;
  lng: number;
  title?: string;
  label?: string;
  draggable?: boolean;
}

export interface GoogleMapViewProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarker[];
  onMarkerDragEnd?: (markerId: string | undefined, newLat: number, newLng: number) => void;
  onMapClick?: (lat: number, lng: number) => void;
  className?: string;
  style?: React.CSSProperties;
  mapId?: string;
  interactive?: boolean;
}

const DEFAULT_CENTER = { lat: 17.25, lng: 78.95 }; // Default center (Choutuppal, Telangana)

export default function GoogleMapView({
  center = DEFAULT_CENTER,
  zoom = 13,
  markers = [],
  onMarkerDragEnd,
  onMapClick,
  className = 'w-full h-64 rounded-2xl overflow-hidden shadow-inner border border-slate-800',
  style,
  interactive = true,
}: GoogleMapViewProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Fallback view when Google Maps API key is not configured in .env.local
  if (!apiKey) {
    return (
      <div
        className={`${className} relative bg-slate-950 flex flex-col items-center justify-center p-4 text-center select-none`}
        style={style}
      >
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:16px_16px]" />
        
        <div className="relative z-10 flex flex-col items-center gap-2 max-w-xs">
          <div className="p-3 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <MapPin className="w-6 h-6 animate-bounce" />
          </div>
          <span className="text-xs font-bold text-slate-200">Google Maps View</span>
          <span className="text-[11px] text-slate-400 font-mono bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
            Center: ({center.lat.toFixed(4)}, {center.lng.toFixed(4)})
          </span>
          {markers.length > 0 && (
            <span className="text-[10px] text-slate-500">
              {markers.length} location marker{markers.length > 1 ? 's' : ''} defined
            </span>
          )}
          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-md">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable live tiles</span>
          </div>
        </div>
      </div>
    );
  }

  const handleMapClick = (e: any) => {
    if (onMapClick && e.detail?.latLng) {
      onMapClick(e.detail.latLng.lat, e.detail.latLng.lng);
    }
  };

  return (
    <div className={className} style={style}>
      <APIProvider apiKey={apiKey}>
        <Map
          center={center}
          defaultCenter={center}
          defaultZoom={zoom}
          gestureHandling={interactive ? 'greedy' : 'none'}
          disableDefaultUI={!interactive}
          zoomControl={interactive}
          onClick={handleMapClick}
          className="w-full h-full"
        >
          {markers.map((m, idx) => (
            <Marker
              key={m.id || `marker-${idx}`}
              position={{ lat: m.lat, lng: m.lng }}
              title={m.title}
              label={m.label}
              draggable={m.draggable}
              onDragEnd={(e) => {
                if (onMarkerDragEnd && e.latLng) {
                  onMarkerDragEnd(m.id, e.latLng.lat(), e.latLng.lng());
                }
              }}
            />
          ))}
        </Map>
      </APIProvider>
    </div>
  );
}
