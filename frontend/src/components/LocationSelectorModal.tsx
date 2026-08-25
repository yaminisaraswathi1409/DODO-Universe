'use client';

import React, { useState } from 'react';
import { MapPin, Navigation, Search, Check, X, Compass, Globe } from 'lucide-react';

export interface LocationData {
  addressText: string;
  lat: number;
  lng: number;
  areaName?: string;
  cityName?: string;
}

interface LocationSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLocation: LocationData;
  onSelectLocation: (loc: LocationData) => void;
}

const PRESET_LOCATIONS: LocationData[] = [
  { addressText: 'Choutuppal, Telangana 508252', lat: 17.25, lng: 78.95, areaName: 'Choutuppal', cityName: 'Yadadri Bhuvanagiri' },
  { addressText: 'HITEC City, Hyderabad, Telangana 500081', lat: 17.4435, lng: 78.3772, areaName: 'HITEC City', cityName: 'Hyderabad' },
  { addressText: 'Suryapet, Telangana 508213', lat: 17.1439, lng: 79.6239, areaName: 'Suryapet', cityName: 'Suryapet' },
  { addressText: 'Vijayawada Highway, Choutuppal Yard, Telangana', lat: 17.2541, lng: 78.9612, areaName: 'NH65 Highway Yard', cityName: 'Choutuppal' },
  { addressText: 'Benz Circle, Vijayawada, Andhra Pradesh 520010', lat: 16.5062, lng: 80.6480, areaName: 'Benz Circle', cityName: 'Vijayawada' },
  { addressText: 'Warangal Urban, Telangana 506002', lat: 17.9784, lng: 79.5941, areaName: 'Warangal Fort', cityName: 'Warangal' },
];

export default function LocationSelectorModal({
  isOpen,
  onClose,
  currentLocation,
  onSelectLocation,
}: LocationSelectorModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [customAddress, setCustomAddress] = useState(currentLocation.addressText || '');
  const [customLat, setCustomLat] = useState(currentLocation.lat || 17.25);
  const [customLng, setCustomLng] = useState(currentLocation.lng || 78.95);

  if (!isOpen) return null;

  const handleDetectGPS = () => {
    if (!navigator.geolocation) {
      setErrorMsg('GPS Geolocation is not supported by your browser.');
      return;
    }

    setDetecting(true);
    setErrorMsg('');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCustomLat(lat);
        setCustomLng(lng);

        try {
          // Attempt reverse geocoding via OpenStreetMap Nominatim API
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
          if (res.ok) {
            const data = await res.json();
            const address = data.display_name || `GPS Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
            const loc: LocationData = {
              addressText: address,
              lat,
              lng,
              areaName: data.address?.suburb || data.address?.village || data.address?.town || 'Detected Area',
              cityName: data.address?.city || data.address?.county || 'Local Region',
            };
            onSelectLocation(loc);
            onClose();
            return;
          }
        } catch {
          // Fallback if reverse geocoding request fails
        }

        const fallbackLoc: LocationData = {
          addressText: `Current GPS Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
          lat,
          lng,
          areaName: 'Current GPS',
        };
        onSelectLocation(fallbackLoc);
        onClose();
      },
      (err) => {
        setDetecting(false);
        setErrorMsg(`Unable to retrieve GPS location: ${err.message}. Please select from list or search below.`);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const filteredPresets = PRESET_LOCATIONS.filter(
    (p) =>
      p.addressText.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.areaName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.cityName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customAddress.trim()) return;
    onSelectLocation({
      addressText: customAddress.trim(),
      lat: customLat,
      lng: customLng,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-[#0d1322] border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 my-8">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <div className="flex items-center gap-2 text-rose-400 mb-1 font-bold text-xs uppercase tracking-wider">
            <MapPin className="w-4 h-4" />
            <span>PostGIS Proximity Location</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-extrabold text-white">Select Service / Delivery Location</h3>
          <p className="text-slate-400 text-xs mt-1">
            Choose where your service or delivery is needed to match nearby providers.
          </p>
        </div>

        {/* GPS Auto-Detect Button */}
        <button
          type="button"
          onClick={handleDetectGPS}
          disabled={detecting}
          className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-blue-600/25 transition-all disabled:opacity-50"
        >
          <Navigation className={`w-4 h-4 ${detecting ? 'animate-spin' : ''}`} />
          <span>{detecting ? 'Detecting current GPS position...' : 'Use Current GPS Location'}</span>
        </button>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs">
            {errorMsg}
          </div>
        )}

        <div className="relative flex items-center">
          <div className="flex-grow border-t border-slate-800" />
          <span className="flex-shrink mx-3 text-slate-500 text-xs uppercase font-mono">or search location</span>
          <div className="flex-grow border-t border-slate-800" />
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            placeholder="Search city, area, town, or pin code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-600"
          />
        </div>

        {/* Presets List */}
        <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Popular Service Areas</span>
          {filteredPresets.map((loc) => {
            const isSelected = currentLocation.addressText === loc.addressText;
            return (
              <button
                key={loc.addressText}
                type="button"
                onClick={() => {
                  onSelectLocation(loc);
                  onClose();
                }}
                className={`w-full p-3 rounded-xl border text-left flex items-start justify-between transition-all ${
                  isSelected
                    ? 'bg-blue-600/15 border-blue-500/40 text-blue-300'
                    : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <MapPin className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isSelected ? 'text-blue-400' : 'text-slate-500'}`} />
                  <div>
                    <div className="font-bold text-xs sm:text-sm">{loc.areaName || loc.cityName}</div>
                    <div className="text-[11px] text-slate-400 line-clamp-1">{loc.addressText}</div>
                  </div>
                </div>
                {isSelected && <Check className="w-4 h-4 text-blue-400 flex-shrink-0 mt-1" />}
              </button>
            );
          })}
        </div>

        {/* Custom Address Form */}
        <form onSubmit={handleCustomSubmit} className="pt-3 border-t border-slate-800/80 space-y-3">
          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Globe className="w-3.5 h-3.5 text-purple-400" />
            <span>Enter Custom Address & Coordinates</span>
          </label>
          <input
            type="text"
            placeholder="Type detailed address text..."
            value={customAddress}
            onChange={(e) => setCustomAddress(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-purple-500"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-slate-500 mb-0.5">Latitude (PostGIS)</label>
              <input
                type="number"
                step="0.0001"
                value={customLat}
                onChange={(e) => setCustomLat(parseFloat(e.target.value) || 17.25)}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-300 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-0.5">Longitude (PostGIS)</label>
              <input
                type="number"
                step="0.0001"
                value={customLng}
                onChange={(e) => setCustomLng(parseFloat(e.target.value) || 78.95)}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-300 text-xs font-mono"
              />
            </div>
          </div>
          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all"
          >
            Confirm Custom Location
          </button>
        </form>
      </div>
    </div>
  );
}
