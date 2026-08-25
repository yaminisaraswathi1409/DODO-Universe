'use client';

import React, { useState, useEffect } from 'react';
import { UserAddress, getUserAddresses, createUserAddress, setDefaultUserAddress, deleteUserAddress, UserProfile } from '@/lib/api';
import LocationSelectorModal, { LocationData } from './LocationSelectorModal';
import { MapPin, Plus, Check, Star, Trash2, Home, Briefcase, Building2, Navigation, Edit3, X, AlertCircle, Phone, User, Compass } from 'lucide-react';

interface SavedAddressesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  selectedAddressId?: string;
  inline?: boolean;
  onSelectAddress: (addr: {
    id?: string;
    label: string;
    addressText: string;
    lat: number;
    lng: number;
    landmark?: string;
    receiverName?: string;
    receiverPhone?: string;
    isSaved?: boolean;
  }) => void;
}

export default function SavedAddressesModal({
  isOpen,
  onClose,
  currentUser,
  selectedAddressId,
  inline = false,
  onSelectAddress,
}: SavedAddressesModalProps) {
  const [addresses, setAddresses] = useState<UserAddress[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'LIST' | 'ADD'>('LIST');

  // Form State for Adding New Address
  const [label, setLabel] = useState<'Home' | 'Work' | 'Construction Site' | 'Other' | string>('Home');
  const [customLabelInput, setCustomLabelInput] = useState('');
  const [addressText, setAddressText] = useState('');
  const [lat, setLat] = useState(17.25);
  const [lng, setLng] = useState(78.95);
  const [landmark, setLandmark] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [saveForFuture, setSaveForFuture] = useState(true);
  const [isDefault, setIsDefault] = useState(false);

  // Embedded Location Picker Modal
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [detectingGps, setDetectingGps] = useState(false);

  useEffect(() => {
    if ((isOpen || inline) && currentUser) {
      loadAddresses();
    }
  }, [isOpen, inline, currentUser]);

  const loadAddresses = async () => {
    if (!currentUser) return;
    setLoading(true);
    setError('');
    try {
      const uId = currentUser.id || currentUser.phone || currentUser.supabase_uid;
      const list = await getUserAddresses(uId);
      setAddresses(list);
    } catch (err: any) {
      setError('Failed to load saved addresses');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen && !inline) return null;


  const handleSetDefault = async (e: React.MouseEvent, addrId: string) => {
    e.stopPropagation();
    if (!currentUser?.id) return;
    try {
      await setDefaultUserAddress(currentUser.id, addrId);
      await loadAddresses();
    } catch (err: any) {
      alert(`Failed to set default: ${err.message || 'Error'}`);
    }
  };

  const handleDelete = async (e: React.MouseEvent, addrId: string) => {
    e.stopPropagation();
    if (!currentUser?.id) return;
    if (!confirm('Are you sure you want to delete this address?')) return;
    try {
      await deleteUserAddress(currentUser.id, addrId);
      await loadAddresses();
    } catch (err: any) {
      alert(`Failed to delete address: ${err.message || 'Error'}`);
    }
  };

  const handleDetectGPS = () => {
    if (!navigator.geolocation) {
      alert('GPS location is not supported by your browser.');
      return;
    }
    setDetectingGps(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;
        setLat(latitude);
        setLng(longitude);
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          if (res.ok) {
            const data = await res.json();
            setAddressText(data.display_name || `GPS Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`);
          }
        } catch {
          setAddressText(`GPS Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`);
        } finally {
          setDetectingGps(false);
        }
      },
      (err) => {
        setDetectingGps(false);
        alert(`Location permission denied or unavailable: ${err.message}`);
      },
      { timeout: 8000 }
    );
  };

  const handleLocationSelected = (loc: LocationData) => {
    setAddressText(loc.addressText);
    setLat(loc.lat);
    setLng(loc.lng);
  };

  const handleSaveAndSelectNewAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addressText.trim()) {
      alert('Please enter or select a valid address.');
      return;
    }

    const finalLabel = label === 'Other' ? (customLabelInput.trim() || 'Other') : label;

    let savedAddr: UserAddress | null = null;
    if (saveForFuture && currentUser?.id) {
      try {
        savedAddr = await createUserAddress(currentUser.id, {
          label: finalLabel,
          address_text: addressText.trim(),
          lat,
          lng,
          landmark: landmark.trim() || undefined,
          receiver_name: receiverName.trim() || undefined,
          receiver_phone: receiverPhone.trim() || undefined,
          is_default: isDefault,
        });
        await loadAddresses();
      } catch (err: any) {
        console.error('Failed to save address to DB:', err);
      }
    }

    onSelectAddress({
      id: savedAddr?.id,
      label: finalLabel,
      addressText: addressText.trim(),
      lat,
      lng,
      landmark: landmark.trim() || undefined,
      receiverName: receiverName.trim() || undefined,
      receiverPhone: receiverPhone.trim() || undefined,
      isSaved: !!savedAddr,
    });

    setView('LIST');
    onClose();
  };

  const getLabelIcon = (lbl: string) => {
    const lower = lbl.toLowerCase();
    if (lower.includes('home')) return <Home className="w-4 h-4 text-emerald-400" />;
    if (lower.includes('work') || lower.includes('office')) return <Briefcase className="w-4 h-4 text-blue-400" />;
    if (lower.includes('site') || lower.includes('construction') || lower.includes('yard')) return <Building2 className="w-4 h-4 text-amber-400" />;
    return <MapPin className="w-4 h-4 text-rose-400" />;
  };

  const modalContent = (
    <div className={`relative w-full ${inline ? '' : 'max-w-lg'} bg-[#0d1322] border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 ${inline ? '' : 'my-8'}`}>
      {!inline && (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      <div>
        <div className="flex items-center gap-2 text-rose-400 mb-1 font-bold text-xs uppercase tracking-wider">
          <MapPin className="w-4 h-4" />
          <span>Delivery Location Manager</span>
        </div>

            <h3 className="text-xl sm:text-2xl font-extrabold text-white">
              {view === 'LIST' ? 'Select Delivery Address' : 'Add New Saved Address'}
            </h3>
            <p className="text-slate-400 text-xs mt-1">
              {view === 'LIST'
                ? 'Choose a saved address for this order or add a new delivery location.'
                : 'Enter details below to set your delivery location.'}
            </p>
          </div>

          {view === 'LIST' ? (
            <div className="space-y-4">
              {loading ? (
                <div className="py-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
                  <span>Loading saved addresses...</span>
                </div>
              ) : addresses.length === 0 ? (
                <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-3">
                  <MapPin className="w-8 h-8 text-slate-500 mx-auto" />
                  <p className="text-slate-300 text-sm font-medium">No saved addresses found</p>
                  <p className="text-slate-400 text-xs">Add your Home, Work, or Site address for 1-click orders.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setReceiverName(currentUser?.full_name || '');
                      setReceiverPhone(currentUser?.phone || '');
                      setView('ADD');
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/20 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add New Address</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {addresses.map((addr) => {
                    const isSelected = selectedAddressId === addr.id;
                    return (
                      <div
                        key={addr.id}
                        onClick={() => {
                          onSelectAddress({
                            id: addr.id,
                            label: addr.label,
                            addressText: addr.address_text,
                            lat: addr.lat,
                            lng: addr.lng,
                            landmark: addr.landmark,
                            receiverName: addr.receiver_name,
                            receiverPhone: addr.receiver_phone,
                            isSaved: true,
                          });
                          onClose();
                        }}
                        className={`group relative p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                          isSelected
                            ? 'bg-gradient-to-r from-rose-950/40 to-slate-900 border-rose-500/60 shadow-lg shadow-rose-500/10'
                            : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                        }`}
                      >
                        <div className="mt-1 flex-shrink-0">{getLabelIcon(addr.label)}</div>
                        <div className="flex-1 min-w-0 pr-12">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white font-bold text-sm">{addr.label}</span>
                            {addr.is_default && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                <Star className="w-3 h-3 fill-emerald-400" /> Default
                              </span>
                            )}
                          </div>
                          <p className="text-slate-300 text-xs mt-1 line-clamp-2">{addr.address_text}</p>
                          {addr.landmark && (
                            <p className="text-slate-400 text-[11px] mt-0.5 flex items-center gap-1">
                              <span className="text-slate-500 font-medium">Landmark:</span> {addr.landmark}
                            </p>
                          )}
                          {(addr.receiver_name || addr.receiver_phone) && (
                            <p className="text-slate-400 text-[11px] mt-0.5 flex items-center gap-1">
                              <User className="w-3 h-3 text-slate-500" />
                              <span>{addr.receiver_name || 'Receiver'}</span>
                              {addr.receiver_phone && <span className="text-slate-500">({addr.receiver_phone})</span>}
                            </p>
                          )}
                        </div>

                        {/* Action icons */}
                        <div className="absolute top-3 right-3 flex items-center gap-1">
                          {!addr.is_default && (
                            <button
                              type="button"
                              title="Set as Default Address"
                              onClick={(e) => handleSetDefault(e, addr.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
                            >
                              <Star className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            title="Delete Address"
                            onClick={(e) => handleDelete(e, addr.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add New Address Button */}
              {addresses.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setReceiverName(currentUser?.full_name || '');
                    setReceiverPhone(currentUser?.phone || '');
                    setView('ADD');
                  }}
                  className="w-full py-3 px-4 rounded-2xl border border-dashed border-slate-700 hover:border-rose-500/60 bg-slate-900/40 hover:bg-rose-950/20 text-rose-400 hover:text-rose-300 font-bold text-xs flex items-center justify-center gap-2 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Add New Address</span>
                </button>
              )}
            </div>
          ) : (
            /* ADD NEW ADDRESS FORM */
            <form onSubmit={handleSaveAndSelectNewAddress} className="space-y-4">
              {/* Location Picker & GPS buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleDetectGPS}
                  disabled={detectingGps}
                  className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  <Navigation className={`w-3.5 h-3.5 text-blue-400 ${detectingGps ? 'animate-spin' : ''}`} />
                  <span>{detectingGps ? 'Detecting GPS...' : 'Use GPS Location'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setLocationPickerOpen(true)}
                  className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition-all"
                >
                  <Compass className="w-3.5 h-3.5 text-amber-400" />
                  <span>Browse Map / Presets</span>
                </button>
              </div>

              {/* Address Label Selection */}
              <div>
                <label className="block text-slate-300 text-xs font-semibold mb-1.5">Address Label</label>
                <div className="grid grid-cols-4 gap-2">
                  {['Home', 'Work', 'Construction Site', 'Other'].map((lbl) => (
                    <button
                      key={lbl}
                      type="button"
                      onClick={() => setLabel(lbl)}
                      className={`py-2 px-2 rounded-xl border font-semibold text-xs flex flex-col items-center gap-1 transition-all ${
                        label === lbl
                          ? 'bg-rose-600/20 border-rose-500 text-white shadow-md'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-850'
                      }`}
                    >
                      {getLabelIcon(lbl)}
                      <span className="truncate max-w-full">{lbl === 'Construction Site' ? 'Site' : lbl}</span>
                    </button>
                  ))}
                </div>
                {label === 'Other' && (
                  <input
                    type="text"
                    placeholder="Enter custom label (e.g. Warehouse, Farm)"
                    value={customLabelInput}
                    onChange={(e) => setCustomLabelInput(e.target.value)}
                    className="mt-2 w-full py-2 px-3 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none focus:border-rose-500"
                  />
                )}
              </div>

              {/* Full Address Text */}
              <div>
                <label className="block text-slate-300 text-xs font-semibold mb-1.5">
                  Full Delivery Address <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="House/Flat No., Building, Street Name, Area, City, Pincode"
                  value={addressText}
                  onChange={(e) => setAddressText(e.target.value)}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none focus:border-rose-500 resize-none"
                />
              </div>

              {/* Landmark */}
              <div>
                <label className="block text-slate-300 text-xs font-semibold mb-1">Landmark (Optional)</label>
                <input
                  type="text"
                  placeholder="Near Bus Stop, Opposite Fuel Station, etc."
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none focus:border-rose-500"
                />
              </div>

              {/* Receiver Name & Phone */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 text-xs font-semibold mb-1">Receiver Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Vyshnavi"
                    value={receiverName}
                    onChange={(e) => setReceiverName(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none focus:border-rose-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 text-xs font-semibold mb-1">Receiver Phone</label>
                  <input
                    type="tel"
                    placeholder="e.g. +91 9876543210"
                    value={receiverPhone}
                    onChange={(e) => setReceiverPhone(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              {/* Save Checkboxes */}
              <div className="space-y-2 pt-1 border-t border-slate-800/80">
                <label className="flex items-center gap-2 cursor-pointer text-slate-300 text-xs">
                  <input
                    type="checkbox"
                    checked={saveForFuture}
                    onChange={(e) => setSaveForFuture(e.target.checked)}
                    className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-rose-600 focus:ring-rose-500"
                  />
                  <span>Save this address to my profile for future orders</span>
                </label>

                {saveForFuture && (
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 text-xs pl-6">
                    <input
                      type="checkbox"
                      checked={isDefault}
                      onChange={(e) => setIsDefault(e.target.checked)}
                      className="w-3.5 h-3.5 rounded bg-slate-900 border-slate-700 text-rose-600 focus:ring-rose-500"
                    />
                    <span className="text-slate-400">Set as my default delivery address</span>
                  </label>
                )}
              </div>

              {/* Form Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setView('LIST')}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 font-bold text-xs transition-colors"
                >
                  Back to List
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-xs shadow-lg shadow-rose-600/25 transition-all"
                >
                  Use for This Order
                </button>
              </div>
            </form>
          )}
    </div>
  );


  return (
    <>
      {inline ? (
        modalContent
      ) : (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          {modalContent}
        </div>
      )}

      {/* Embedded Location Selector Modal for Map / Preset browsing */}
      <LocationSelectorModal
        isOpen={locationPickerOpen}
        onClose={() => setLocationPickerOpen(false)}
        currentLocation={{ addressText: addressText || 'Choutuppal, Telangana 508252', lat, lng }}
        onSelectLocation={handleLocationSelected}
      />
    </>
  );
}

