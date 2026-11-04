'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Bell,
  MessageSquare,
  Smartphone,
  Shield,
  CheckCircle2,
  AlertCircle,
  Save,
  RefreshCw,
} from 'lucide-react';
import {
  NotificationPreference,
  getNotificationPreferences,
  updateNotificationPreferences,
} from '@/lib/api';

interface NotificationPreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationPreferencesModal({
  isOpen,
  onClose,
}: NotificationPreferencesModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [inApp, setInApp] = useState(true);
  const [sms, setSms] = useState(true);
  const [push, setPush] = useState(true);
  const [disabledCategories, setDisabledCategories] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadPreferences();
    }
  }, [isOpen]);

  const loadPreferences = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const pref = await getNotificationPreferences();
      if (pref) {
        setInApp(pref.in_app_enabled ?? true);
        setSms(pref.sms_enabled ?? true);
        setPush(pref.push_enabled ?? true);
        setDisabledCategories(pref.disabled_categories || []);
      }
    } catch {
      setErrorMsg('Failed to load preferences');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleCategory = (cat: string) => {
    if (disabledCategories.includes(cat)) {
      setDisabledCategories(disabledCategories.filter((c) => c !== cat));
    } else {
      setDisabledCategories([...disabledCategories, cat]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await updateNotificationPreferences({
        in_app_enabled: inApp,
        sms_enabled: sms,
        push_enabled: push,
        disabled_categories: disabledCategories,
      });
      if (res) {
        setSuccessMsg('Notification preferences saved successfully!');
        setTimeout(() => {
          setSuccessMsg('');
          onClose();
        }, 1200);
      } else {
        setErrorMsg('Failed to save preferences');
      }
    } catch {
      setErrorMsg('Error saving preferences');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6 relative max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-900">
              <Bell className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Notification Settings</h2>
          </div>
          <p className="text-xs text-slate-500">
            Control which channels and communication categories you receive.
          </p>
        </div>

        {/* Critical Safety Notice */}
        <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide">
              Critical Protection Exemption
            </h4>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              Safety alerts (SOS emergency notices, secure delivery OTPs, and escrow settlements)
              cannot be disabled to guarantee delivery handshakes and driver safety.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin text-slate-900" />
            <span className="text-xs font-medium">Loading preferences...</span>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Communication Channels */}
            <div className="space-y-3">
              <h3 className="text-xs font-extrabold uppercase text-slate-400 tracking-wider">
                Delivery Channels
              </h3>

              <div className="space-y-2">
                {/* In-App */}
                <label className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-200 hover:border-slate-300 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
                      <Bell className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-slate-900 block">In-App Inbox</span>
                      <span className="text-[11px] text-slate-500">Real-time alerts inside DODO dashboard</span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={inApp}
                    onChange={(e) => setInApp(e.target.checked)}
                    className="w-4 h-4 rounded text-black focus:ring-black border-slate-300 cursor-pointer"
                  />
                </label>

                {/* SMS */}
                <label className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-200 hover:border-slate-300 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-slate-900 block">SMS Gateway</span>
                      <span className="text-[11px] text-slate-500">Direct mobile phone SMS notifications</span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={sms}
                    onChange={(e) => setSms(e.target.checked)}
                    className="w-4 h-4 rounded text-black focus:ring-black border-slate-300 cursor-pointer"
                  />
                </label>

                {/* Push */}
                <label className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-200 hover:border-slate-300 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-slate-900 block">Push Notifications</span>
                      <span className="text-[11px] text-slate-500">Browser & device push banners</span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={push}
                    onChange={(e) => setPush(e.target.checked)}
                    className="w-4 h-4 rounded text-black focus:ring-black border-slate-300 cursor-pointer"
                  />
                </label>
              </div>
            </div>

            {/* Optional Notification Categories */}
            <div className="space-y-3">
              <h3 className="text-xs font-extrabold uppercase text-slate-400 tracking-wider">
                Optional Categories
              </h3>

              <div className="space-y-2">
                {[
                  {
                    key: 'MARKETING',
                    title: 'Offers & Catalog Promotions',
                    desc: 'New vendor offerings, bulk order discounts and market highlights',
                  },
                  {
                    key: 'STATUS_UPDATE',
                    title: 'Routine Transit Updates',
                    desc: 'Regular intermediate waypoint and driver progress updates',
                  },
                  {
                    key: 'INFO',
                    title: 'General Announcements',
                    desc: 'Platform system maintenance, feature updates, and surveys',
                  },
                ].map((cat) => {
                  const isEnabled = !disabledCategories.includes(cat.key);
                  return (
                    <label
                      key={cat.key}
                      className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-200 hover:border-slate-300 transition-colors cursor-pointer"
                    >
                      <div className="pr-4">
                        <span className="text-sm font-semibold text-slate-900 block">
                          {cat.title}
                        </span>
                        <span className="text-[11px] text-slate-500">{cat.desc}</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={() => handleToggleCategory(cat.key)}
                        className="w-4 h-4 rounded text-black focus:ring-black border-slate-300 cursor-pointer"
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Feedback Messages */}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="px-6 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-black transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Preferences</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

