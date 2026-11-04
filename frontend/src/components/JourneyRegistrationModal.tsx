'use client';

import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Calendar,
  Clock,
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Bike,
  Car,
  Footprints,
  Bus,
  ChevronRight,
  ShieldCheck,
  ArrowRight,
  Info,
} from 'lucide-react';
import LocationSelectorModal, { LocationData } from './LocationSelectorModal';
import { UserJourney, RegisterJourneyPayload, registerJourney, updateJourney } from '@/lib/api';

interface JourneyRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (journey: UserJourney) => void;
  initialJourney?: UserJourney | null;
}

// Supported backend travel modes with simple, friendly labels & icons
const TRAVEL_MODES = [
  { id: 'BIKE', label: 'Bike / Motorcycle', helper: '2-wheeler with storage', icon: Bike },
  { id: 'SCOOTER', label: 'Scooter', helper: 'Convenient for small packets', icon: Bike },
  { id: 'CAR', label: 'Car / Auto', helper: 'Spacious for multiple items', icon: Car },
  { id: 'BUS', label: 'Bus / Public Transit', helper: 'Travelling on standard route', icon: Bus },
  { id: 'WALK', label: 'Walking', helper: 'Short village / town distances', icon: Footprints },
];

const WEEK_DAYS = [
  { code: 'MON', label: 'Mon', full: 'Monday' },
  { code: 'TUE', label: 'Tue', full: 'Tuesday' },
  { code: 'WED', label: 'Wed', full: 'Wednesday' },
  { code: 'THU', label: 'Thu', full: 'Thursday' },
  { code: 'FRI', label: 'Fri', full: 'Friday' },
  { code: 'SAT', label: 'Sat', full: 'Saturday' },
  { code: 'SUN', label: 'Sun', full: 'Sunday' },
];

// Time conversion utilities between 24-hour (HH:mm) for input[type="time"] and readable 12-hour AM/PM format
function to24Hour(timeStr: string): string {
  if (!timeStr) return '';
  const trimmed = timeStr.trim().toUpperCase();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) {
    if (/^\d{2}:\d{2}$/.test(trimmed)) return trimmed;
    return '';
  }
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const meridian = match[3];

  if (meridian === 'PM' && hours < 12) hours += 12;
  if (meridian === 'AM' && hours === 12) hours = 0;

  return `${String(hours).padStart(2, '0')}:${minutes}`;
}

function to12Hour(time24: string): string {
  if (!time24) return '';
  const match = time24.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return time24;
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const meridian = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${meridian}`;
}

export default function JourneyRegistrationModal({
  isOpen,
  onClose,
  onSuccess,
  initialJourney,
}: JourneyRegistrationModalProps) {
  const isEditing = Boolean(initialJourney);

  // Section C: Locations
  const [originAddress, setOriginAddress] = useState('');
  const [originLat, setOriginLat] = useState<number | null>(null);
  const [originLng, setOriginLng] = useState<number | null>(null);

  const [destAddress, setDestAddress] = useState('');
  const [destLat, setDestLat] = useState<number | null>(null);
  const [destLng, setDestLng] = useState<number | null>(null);

  // Section B: Frequency (Regularly vs Just Once)
  const [frequencyType, setFrequencyType] = useState<'REGULAR' | 'ONE_TIME'>('REGULAR');
  const [regularPattern, setRegularPattern] = useState<'DAILY' | 'WEEKDAYS' | 'WEEKENDS' | 'CUSTOM'>('DAILY');
  const [selectedDays, setSelectedDays] = useState<string[]>(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);

  // Section D: Travel Method
  const [travelMode, setTravelMode] = useState<string>('BIKE');

  // Section E: Departure Time (stored in 24h for time input, e.g. "08:00")
  const [depEarliest, setDepEarliest] = useState('');
  const [depLatest, setDepLatest] = useState('');

  // Section F: Arrival Time (stored in 24h for time input, e.g. "09:30")
  const [arrEarliest, setArrEarliest] = useState('');
  const [arrLatest, setArrLatest] = useState('');

  // Section G: Detour Preferences
  const [extraDistanceKM, setExtraDistanceKM] = useState(2.0);
  const [extraTimeMinutes, setExtraTimeMinutes] = useState(10);

  // Map Picker State
  const [mapPickerTarget, setMapPickerTarget] = useState<'ORIGIN' | 'DEST' | null>(null);

  // Submission & Feedback State
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Initialize or pre-populate form
  useEffect(() => {
    if (!isOpen) return;

    if (initialJourney) {
      setOriginAddress(initialJourney.origin_address || '');
      setOriginLat(initialJourney.origin_lat || 17.215);
      setOriginLng(initialJourney.origin_lng || 78.912);

      setDestAddress(initialJourney.destination_address || '');
      setDestLat(initialJourney.destination_lat || 17.25);
      setDestLng(initialJourney.destination_lng || 78.95);

      setTravelMode(initialJourney.travel_mode || 'BIKE');

      if (initialJourney.journey_type === 'ONE_TIME') {
        setFrequencyType('ONE_TIME');
      } else {
        setFrequencyType('REGULAR');
        const freq = initialJourney.travel_frequency || 'DAILY';
        if (freq === 'WEEKDAYS') setRegularPattern('WEEKDAYS');
        else if (freq === 'WEEKENDS') setRegularPattern('WEEKENDS');
        else if (freq === 'CUSTOM') setRegularPattern('CUSTOM');
        else setRegularPattern('DAILY');
      }

      if (initialJourney.available_days && initialJourney.available_days.length > 0) {
        setSelectedDays(initialJourney.available_days);
      } else {
        setSelectedDays(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
      }

      // Time inputs in 24h format
      setDepEarliest(to24Hour(initialJourney.departure_window_start || ''));
      setDepLatest(to24Hour(initialJourney.departure_window_end || ''));
      setArrEarliest(to24Hour(initialJourney.arrival_window_start || ''));
      setArrLatest(to24Hour(initialJourney.arrival_window_end || ''));

      setExtraDistanceKM(initialJourney.max_detour_km || 2.0);
      setExtraTimeMinutes(initialJourney.max_detour_minutes || 10);
    } else {
      // Clean, friendly empty state with Lingotam/Choutuppal defaults for coordinates
      setOriginAddress('Lingotam Village, Telangana');
      setOriginLat(17.215);
      setOriginLng(78.912);

      setDestAddress('Choutuppal Town, Telangana');
      setDestLat(17.25);
      setDestLng(78.95);

      setFrequencyType('REGULAR');
      setRegularPattern('DAILY');
      setSelectedDays(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
      setTravelMode('BIKE');

      // Do NOT silently insert default times if the user has not selected them
      setDepEarliest('08:00');
      setDepLatest('09:00');
      setArrEarliest('09:30');
      setArrLatest('10:00');

      setExtraDistanceKM(2.0);
      setExtraTimeMinutes(10);
    }

    setErrorMsg('');
    setSuccessMsg('');
  }, [initialJourney, isOpen]);

  // Recurrence pattern selection handlers
  const handlePatternChange = (pattern: 'DAILY' | 'WEEKDAYS' | 'WEEKENDS' | 'CUSTOM') => {
    setRegularPattern(pattern);
    if (pattern === 'DAILY') {
      setSelectedDays(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
    } else if (pattern === 'WEEKDAYS') {
      setSelectedDays(['MON', 'TUE', 'WED', 'THU', 'FRI']);
    } else if (pattern === 'WEEKENDS') {
      setSelectedDays(['SAT', 'SUN']);
    }
  };

  const handleToggleDay = (code: string) => {
    setRegularPattern('CUSTOM');
    if (selectedDays.includes(code)) {
      if (selectedDays.length === 1) return; // Keep at least one day selected
      setSelectedDays(selectedDays.filter((d) => d !== code));
    } else {
      setSelectedDays([...selectedDays, code]);
    }
  };

  const handleLocationPicked = (loc: LocationData) => {
    if (mapPickerTarget === 'ORIGIN') {
      setOriginAddress(loc.addressText);
      setOriginLat(loc.lat);
      setOriginLng(loc.lng);
    } else if (mapPickerTarget === 'DEST') {
      setDestAddress(loc.addressText);
      setDestLat(loc.lat);
      setDestLng(loc.lng);
    }
    setMapPickerTarget(null);
  };

  // Comprehensive Form Validation
  const validateForm = (): string | null => {
    if (!originAddress.trim()) {
      return 'Please enter where you are starting your journey.';
    }
    if (!destAddress.trim()) {
      return 'Please enter where you are going.';
    }
    if (frequencyType === 'REGULAR' && selectedDays.length === 0) {
      return 'Please choose at least one day you travel on this route.';
    }
    if (!depEarliest) {
      return 'Please choose the earliest time you might leave.';
    }
    if (!depLatest) {
      return 'Please choose the latest time you might leave.';
    }
    if (depLatest < depEarliest) {
      return 'Latest departure time cannot be earlier than earliest departure time.';
    }
    if (arrEarliest && arrLatest && arrLatest < arrEarliest) {
      return 'Latest arrival time cannot be earlier than earliest arrival time.';
    }
    if (arrEarliest && depEarliest && arrEarliest < depEarliest) {
      return 'Expected arrival time appears earlier than departure time. If your trip is completed within the same day, please make sure arrival is after departure.';
    }
    if (extraDistanceKM <= 0 || extraDistanceKM > 50) {
      return 'Extra distance detour must be between 0.5 km and 50 km.';
    }
    if (extraTimeMinutes <= 0 || extraTimeMinutes > 180) {
      return 'Extra time detour must be between 5 and 180 minutes.';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const validationError = validateForm();
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    setSubmitting(true);
    try {
      // Convert 24-hour picker times to human-readable format for backend metadata
      const depStartFormatted = to12Hour(depEarliest);
      const depEndFormatted = to12Hour(depLatest);
      const arrStartFormatted = arrEarliest ? to12Hour(arrEarliest) : '';
      const arrEndFormatted = arrLatest ? to12Hour(arrLatest) : '';

      const payload: RegisterJourneyPayload = {
        origin_address: originAddress.trim(),
        origin_lat: originLat ?? 17.215,
        origin_lng: originLng ?? 78.912,
        destination_address: destAddress.trim(),
        destination_lat: destLat ?? 17.25,
        destination_lng: destLng ?? 78.95,
        travel_mode: travelMode,
        journey_type: frequencyType === 'ONE_TIME' ? 'ONE_TIME' : 'RECURRING',
        travel_frequency: frequencyType === 'ONE_TIME' ? 'ONE_TIME' : regularPattern,
        available_days: frequencyType === 'REGULAR' ? selectedDays : undefined,
        departure_window_start: depStartFormatted,
        departure_window_end: depEndFormatted,
        arrival_window_start: arrStartFormatted,
        arrival_window_end: arrEndFormatted,
        max_detour_km: extraDistanceKM,
        max_detour_minutes: extraTimeMinutes,
      };

      let result: UserJourney;
      if (isEditing && initialJourney) {
        result = await updateJourney(initialJourney.id, payload);
        setSuccessMsg('Your travel route has been updated successfully!');
      } else {
        result = await registerJourney(payload);
        setSuccessMsg('Your travel route has been saved successfully!');
      }

      // Notify parent view to immediately refresh the list
      if (onSuccess) {
        onSuccess(result);
      }

      // Gracefully close modal after confirmation
      setTimeout(() => {
        onClose();
      }, 1400);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not save your travel route. Please check your network and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-3xl shadow-2xl my-6 overflow-hidden text-slate-900 flex flex-col">
        {/* ========================================================================= */}
        {/* Section A — Heading                                                       */}
        {/* ========================================================================= */}
        <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-gradient-to-r from-slate-50 via-white to-slate-50">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
              {isEditing ? 'Update Your Travel Route' : 'Register Your Travel'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
              Tell us where you&apos;re going. DODO can help find delivery requests along your route.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-full text-slate-400 hover:text-black hover:bg-slate-100 transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-7 overflow-y-auto max-h-[78vh]">
          {/* Validation & Server Alerts */}
          {errorMsg && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3 text-xs sm:text-sm font-semibold animate-in fade-in">
              <AlertCircle className="w-5 h-5 flex-none text-rose-600 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-start gap-3 text-xs sm:text-sm font-semibold animate-in fade-in">
              <CheckCircle2 className="w-5 h-5 flex-none text-emerald-600 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* ========================================================================= */}
          {/* Section B — Travel Frequency                                              */}
          {/* ========================================================================= */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-extrabold text-slate-900">
                How often do you travel this route?
              </label>
              <p className="text-xs text-slate-500 mt-0.5">
                Choose whether this is a routine trip or a single upcoming journey.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Card 1: Regularly */}
              <button
                type="button"
                onClick={() => setFrequencyType('REGULAR')}
                className={`p-4 rounded-2xl border-2 text-left transition-all flex items-start gap-3.5 ${
                  frequencyType === 'REGULAR'
                    ? 'border-slate-900 bg-slate-50/70 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    frequencyType === 'REGULAR' ? 'bg-black text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-black text-slate-900">Regularly</div>
                  <div className="text-xs text-slate-600 mt-0.5 leading-snug">
                    I travel this route on selected days.
                  </div>
                </div>
              </button>

              {/* Card 2: Just Once */}
              <button
                type="button"
                onClick={() => setFrequencyType('ONE_TIME')}
                className={`p-4 rounded-2xl border-2 text-left transition-all flex items-start gap-3.5 ${
                  frequencyType === 'ONE_TIME'
                    ? 'border-slate-900 bg-slate-50/70 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    frequencyType === 'ONE_TIME' ? 'bg-black text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <ArrowRight className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-black text-slate-900">Just Once</div>
                  <div className="text-xs text-slate-600 mt-0.5 leading-snug">
                    I am making a single trip.
                  </div>
                </div>
              </button>
            </div>

            {/* Recurrence Sub-Options (Only shown when Regularly is selected) */}
            {frequencyType === 'REGULAR' && (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 animate-in fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700">Which days do you travel?</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handlePatternChange('DAILY')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                        regularPattern === 'DAILY'
                          ? 'bg-black text-white'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Every Day
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePatternChange('WEEKDAYS')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                        regularPattern === 'WEEKDAYS'
                          ? 'bg-black text-white'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Weekdays (Mon–Fri)
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePatternChange('WEEKENDS')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                        regularPattern === 'WEEKENDS'
                          ? 'bg-black text-white'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Weekends (Sat–Sun)
                    </button>
                  </div>
                </div>

                {/* Day-by-Day Selector Pills */}
                <div className="grid grid-cols-7 gap-1.5 pt-1">
                  {WEEK_DAYS.map((day) => {
                    const isSelected = selectedDays.includes(day.code);
                    return (
                      <button
                        key={day.code}
                        type="button"
                        onClick={() => handleToggleDay(day.code)}
                        title={day.full}
                        className={`py-2 text-center text-xs font-black rounded-xl transition-all border ${
                          isSelected
                            ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* Section C — Starting Point and Destination                                */}
          {/* ========================================================================= */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Starting Point */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                    <span>Where are you starting?</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setMapPickerTarget('ORIGIN')}
                    className="text-xs font-bold text-slate-900 hover:underline flex items-center gap-1"
                  >
                    <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Pick on Map</span>
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={originAddress}
                  onChange={(e) => setOriginAddress(e.target.value)}
                  placeholder="e.g. Lingotam Village, Ramalayam Temple"
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-medium text-slate-900 focus:bg-white focus:border-black focus:outline-none transition-all placeholder:text-slate-400"
                />
                <p className="text-[11px] text-slate-500 px-1">
                  Your general neighbourhood or landmark. Exact home addresses remain private.
                </p>
              </div>

              {/* Destination */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                    <span>Where are you going?</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setMapPickerTarget('DEST')}
                    className="text-xs font-bold text-slate-900 hover:underline flex items-center gap-1"
                  >
                    <MapPin className="w-3.5 h-3.5 text-rose-600" />
                    <span>Pick on Map</span>
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={destAddress}
                  onChange={(e) => setDestAddress(e.target.value)}
                  placeholder="e.g. Choutuppal Bus Stand, Highway Junction"
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-medium text-slate-900 focus:bg-white focus:border-black focus:outline-none transition-all placeholder:text-slate-400"
                />
                <p className="text-[11px] text-slate-500 px-1">
                  The town, village, or area you are heading to.
                </p>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* Section D — Travel Method                                                 */}
          {/* ========================================================================= */}
          <div className="space-y-2.5">
            <div>
              <label className="block text-sm font-extrabold text-slate-900">
                How will you travel?
              </label>
              <p className="text-xs text-slate-500 mt-0.5">
                Select the vehicle or method you will be using for this route.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {TRAVEL_MODES.map((mode) => {
                const IconComponent = mode.icon;
                const isSelected = travelMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setTravelMode(mode.id)}
                    className={`p-3.5 rounded-2xl border-2 text-center transition-all flex flex-col items-center justify-center gap-2 ${
                      isSelected
                        ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <IconComponent className="w-6 h-6" />
                    <span className="text-xs font-bold">{mode.label.split('/')[0].trim()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* Section E — Departure Time                                                */}
          {/* ========================================================================= */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="space-y-0.5">
              <label className="block text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-slate-700" />
                <span>When do you expect to leave?</span>
              </label>
              <p className="text-xs text-slate-600">
                Choose the earliest and latest times you might start your trip.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Earliest Departure</label>
                <input
                  type="time"
                  required
                  value={depEarliest}
                  onChange={(e) => setDepEarliest(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm font-bold text-slate-900 focus:outline-none focus:border-black shadow-sm"
                />
                {depEarliest && (
                  <span className="text-[11px] font-semibold text-slate-500 block">
                    Starting from ~{to12Hour(depEarliest)}
                  </span>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Latest Departure</label>
                <input
                  type="time"
                  required
                  value={depLatest}
                  onChange={(e) => setDepLatest(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm font-bold text-slate-900 focus:outline-none focus:border-black shadow-sm"
                />
                {depLatest && (
                  <span className="text-[11px] font-semibold text-slate-500 block">
                    Leaving by ~{to12Hour(depLatest)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* Section F — Arrival Time                                                  */}
          {/* ========================================================================= */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="space-y-0.5">
              <label className="block text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-slate-700" />
                <span>When do you expect to reach your destination?</span>
              </label>
              <p className="text-xs text-slate-600">
                An approximate time helps DODO find deliveries that fit your trip. Your arrival time does not need to be exact.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Earliest Arrival</label>
                <input
                  type="time"
                  value={arrEarliest}
                  onChange={(e) => setArrEarliest(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm font-bold text-slate-900 focus:outline-none focus:border-black shadow-sm"
                />
                {arrEarliest && (
                  <span className="text-[11px] font-semibold text-slate-500 block">
                    Reaching around {to12Hour(arrEarliest)}
                  </span>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Latest Arrival</label>
                <input
                  type="time"
                  value={arrLatest}
                  onChange={(e) => setArrLatest(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm font-bold text-slate-900 focus:outline-none focus:border-black shadow-sm"
                />
                {arrLatest && (
                  <span className="text-[11px] font-semibold text-slate-500 block">
                    Reaching by {to12Hour(arrLatest)}
                  </span>
                )}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-600 flex items-start gap-2">
              <Info className="w-4 h-4 text-slate-500 flex-none mt-0.5" />
              <span>
                <strong>Example:</strong> You expect to arrive between 9:30 AM and 10:00 AM. This is an estimated range for matching same-day requests, not a strict appointment.
              </span>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* Section G — Detour Preferences                                            */}
          {/* ========================================================================= */}
          <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-4">
            <div className="space-y-0.5">
              <label className="block text-sm font-black text-slate-900">
                Would you be willing to take a small detour?
              </label>
              <p className="text-xs text-slate-700">
                Choose how far out of your way you&apos;re comfortable travelling to deliver an item.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-1">
              {/* Extra Distance */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-bold text-slate-800">
                  <span>Extra distance</span>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 font-extrabold text-xs">
                    up to {extraDistanceKM} km
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="15.0"
                  step="0.5"
                  value={extraDistanceKM}
                  onChange={(e) => setExtraDistanceKM(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
                <p className="text-[11px] text-slate-600 leading-snug">
                  How many kilometres off your direct road you can ride or drive.
                </p>
              </div>

              {/* Extra Time */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-bold text-slate-800">
                  <span>Extra time</span>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 font-extrabold text-xs">
                    up to {extraTimeMinutes} minutes
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="60"
                  step="5"
                  value={extraTimeMinutes}
                  onChange={(e) => setExtraTimeMinutes(parseInt(e.target.value, 10))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
                <p className="text-[11px] text-slate-600 leading-snug">
                  The extra minutes you are comfortable spending to hand over a package.
                </p>
              </div>
            </div>
          </div>

          {/* Voluntary Acceptance Notice */}
          <div className="p-3.5 rounded-2xl bg-slate-100 border border-slate-200 flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 text-slate-700 flex-none mt-0.5" />
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              <strong>Your Choice Always:</strong> Delivery requests are voluntary. You will see the package details, exact detour, and payment amount before deciding whether to accept.
            </p>
          </div>

          {/* ========================================================================= */}
          {/* Section H — Primary Action                                                */}
          {/* ========================================================================= */}
          <div className="pt-2 flex flex-col-reverse sm:flex-row items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-3 rounded-2xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-black hover:bg-slate-800 text-white text-sm font-extrabold flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Saving Your Travel Route...</span>
                </>
              ) : (
                <>
                  <span>Save My Travel Route</span>
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Location Selector Modal for Map-Assisted Location Picking */}
        {mapPickerTarget && (
          <LocationSelectorModal
            isOpen={true}
            onClose={() => setMapPickerTarget(null)}
            currentLocation={{
              addressText: mapPickerTarget === 'ORIGIN' ? originAddress : destAddress,
              lat: (mapPickerTarget === 'ORIGIN' ? originLat : destLat) ?? 17.25,
              lng: (mapPickerTarget === 'ORIGIN' ? originLng : destLng) ?? 78.95,
            }}
            onSelectLocation={handleLocationPicked}
          />
        )}
      </div>
    </div>
  );
}
