'use client';

import React, { useState, useEffect } from 'react';
import {
  Compass,
  MapPin,
  Clock,
  Calendar,
  Bike,
  Car,
  Footprints,
  Bus,
  Plus,
  Play,
  Pause,
  Trash2,
  Edit3,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { UserJourney, getUserJourneys, setJourneyStatus } from '@/lib/api';
import JourneyRegistrationModal from './JourneyRegistrationModal';

const TRAVEL_MODE_ICONS: Record<string, any> = {
  BIKE: Bike,
  SCOOTER: Bike,
  CAR: Car,
  BUS: Bus,
  WALK: Footprints,
};

interface MyJourneysViewProps {
  currentUser?: any;
}

export default function MyJourneysView({ currentUser }: MyJourneysViewProps = {}) {
  const [journeys, setJourneys] = useState<UserJourney[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [actionSuccessMsg, setActionSuccessMsg] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedJourney, setSelectedJourney] = useState<UserJourney | null>(null);

  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchJourneys = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await getUserJourneys();
      setJourneys(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load registered journeys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJourneys();
  }, []);

  const handleStatusChange = async (id: string, action: 'PAUSE' | 'RESUME' | 'CANCEL') => {
    if (action === 'CANCEL' && !confirm('Are you sure you want to cancel this journey route?')) {
      return;
    }

    setActionLoadingId(id);
    setActionSuccessMsg('');
    try {
      await setJourneyStatus(id, action);
      setActionSuccessMsg(`Journey ${action.toLowerCase()}d successfully.`);
      await fetchJourneys();
      setTimeout(() => setActionSuccessMsg(''), 3000);
    } catch (err: any) {
      alert(err.message || `Failed to ${action.toLowerCase()} journey`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleEdit = (journey: UserJourney) => {
    setSelectedJourney(journey);
    setIsModalOpen(true);
  };

  const handleOpenNew = () => {
    setSelectedJourney(null);
    setIsModalOpen(true);
  };

  const handleModalSuccess = () => {
    fetchJourneys();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Header */}
      <div className="p-6 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest border border-emerald-500/30">
              Community Travel & Earn
            </span>
          </div>
          <h2 className="text-xl font-black tracking-tight text-white">My Travel Routes</h2>
          <p className="text-xs text-slate-300 font-medium max-w-xl">
            Register where you travel regularly or occasionally (e.g. Lingotam ↔ Choutuppal). DODO will find optional delivery requests along your route.
          </p>
        </div>

        <button
          onClick={handleOpenNew}
          className="px-5 py-3 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-extrabold text-xs flex items-center gap-2 shadow-lg hover:shadow-xl transition-all flex-none"
        >
          <Plus className="w-4 h-4 text-emerald-600" />
          <span>Register Your Travel</span>
        </button>
      </div>

      {/* Action Success Alert */}
      {actionSuccessMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3 text-xs font-bold animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-none" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* Error Alert */}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-3 text-xs font-bold animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-none" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Journeys List */}
      {loading ? (
        <div className="p-12 text-center flex flex-col items-center justify-center space-y-3 bg-white rounded-3xl border border-slate-200">
          <RefreshCw className="w-8 h-8 text-black animate-spin" />
          <p className="text-xs font-semibold text-slate-500">Loading your travel routes...</p>
        </div>
      ) : journeys.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 space-y-4">
          <div className="w-14 h-14 rounded-3xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
            <Compass className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-extrabold text-slate-900">No Travel Routes Registered Yet</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              You haven&apos;t registered any travel routes yet. Tell us where you travel (daily or single trips) so DODO can find matching delivery requests along your way.
            </p>
          </div>
          <button
            onClick={handleOpenNew}
            className="px-5 py-2.5 rounded-xl bg-black text-white text-xs font-bold hover:bg-slate-800 transition-all inline-flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Register Your Travel Route</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {journeys.map((j) => {
            const IconComponent = TRAVEL_MODE_ICONS[j.travel_mode] || Bike;
            const isPaused = j.status === 'PAUSED' || !j.is_active;
            const isCancelled = j.status === 'CANCELLED';
            const isActive = (j.status === 'OPEN' || j.status === 'ACTIVE') && j.is_active;
            const isActionLoading = actionLoadingId === j.id;

            return (
              <div
                key={j.id}
                className={`p-5 rounded-3xl border transition-all flex flex-col justify-between space-y-4 bg-white ${
                  isCancelled
                    ? 'border-slate-200 opacity-60 bg-slate-50'
                    : isPaused
                    ? 'border-amber-200 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-md'
                }`}
              >
                {/* Top Row: Badges */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${
                        isActive
                          ? 'bg-emerald-100 text-emerald-800'
                          : isPaused
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isActive ? 'bg-emerald-600' : isPaused ? 'bg-amber-600' : 'bg-slate-500'
                        }`}
                      />
                      <span>{isActive ? 'Active & Matching' : isPaused ? 'Paused' : 'Cancelled'}</span>
                    </span>

                    <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[10px] font-extrabold flex items-center gap-1">
                      <IconComponent className="w-3 h-3 text-slate-600" />
                      <span>{j.travel_mode}</span>
                    </span>
                  </div>

                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                    {j.journey_type === 'RECURRING' ? j.travel_frequency : 'ONE-TIME'}
                  </span>
                </div>

                {/* Route Visualizer */}
                <div className="space-y-2 py-1">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center gap-1 mt-1">
                      <span className="w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-emerald-100" />
                      <div className="w-0.5 h-6 bg-slate-200" />
                      <span className="w-3 h-3 rounded-full bg-rose-500 ring-4 ring-rose-100" />
                    </div>
                    <div className="flex-1 space-y-2.5">
                      <div>
                        <span className="text-[10px] uppercase font-extrabold text-slate-400 block tracking-wider">
                          Starting Point
                        </span>
                        <p className="text-xs font-bold text-slate-800 leading-tight">
                          {j.origin_address || 'Starting Point'}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-extrabold text-slate-400 block tracking-wider">
                          Destination
                        </span>
                        <p className="text-xs font-bold text-slate-800 leading-tight">
                          {j.destination_address || 'Destination'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Details Footer: Days & Times & Detour */}
                <div className="pt-3 border-t border-slate-100 space-y-2 text-[11px] text-slate-600">
                  {j.journey_type === 'RECURRING' && j.available_days && j.available_days.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 flex-none" />
                      <span className="font-bold text-slate-700">Days:</span>
                      <div className="flex items-center gap-1">
                        {j.available_days.map((d) => (
                          <span
                            key={d}
                            className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-extrabold"
                          >
                            {d}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-500 gap-1 pt-0.5">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Leave: {j.departure_window_start || 'Flexible'}{j.departure_window_end ? ` – ${j.departure_window_end}` : ''}</span>
                    </div>
                    <div className="font-semibold text-slate-700">
                      Detour: Up to {j.max_detour_km || 2} km (+{j.max_detour_minutes || 10} min)
                    </div>
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleEdit(j)}
                      disabled={isCancelled || isActionLoading}
                      className="text-xs font-bold text-slate-600 hover:text-black flex items-center gap-1 disabled:opacity-40"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit Route</span>
                    </button>

                    {isActive && (
                      <a
                        href="/dashboard?tab=matching"
                        className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold flex items-center gap-1 transition-colors"
                        title="View delivery offers matching this route"
                      >
                        <Compass className="w-3 h-3 text-emerald-600" />
                        <span>View Offers</span>
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isActive ? (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(j.id, 'PAUSE')}
                        disabled={isActionLoading}
                        className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40"
                      >
                        {isActionLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Pause className="w-3 h-3" />}
                        <span>Pause</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(j.id, 'RESUME')}
                        disabled={isCancelled || isActionLoading}
                        className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40"
                      >
                        {isActionLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                        <span>Resume</span>
                      </button>
                    )}

                    {!isCancelled && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(j.id, 'CANCEL')}
                        disabled={isActionLoading}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40"
                        title="Cancel Journey"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal for Creating or Editing Journey */}
      <JourneyRegistrationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialJourney={selectedJourney}
        onSuccess={handleModalSuccess}
      />
    </div>
  );
}
