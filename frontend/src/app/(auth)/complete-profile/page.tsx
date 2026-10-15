'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { completeProfile } from '@/lib/api';
import { Camera, ArrowRight, UserCheck, MapPin, RefreshCw, FileText } from 'lucide-react';

export default function CompleteProfilePage() {
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState('https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400');
  const [bio, setBio] = useState('Experienced equipment owner and farm provider.');
  const [addressText, setAddressText] = useState('Choutuppal, Telangana, India');
  const [aadhaarNumber, setAadhaarNumber] = useState('1234-5678-9012');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('uop_user');
      if (stored) {
        try {
          const user = JSON.parse(stored);
          // Status Guard: Returning ACTIVE users bypass profile completion directly to Main Dashboard
          if (user.status === 'ACTIVE' || user.is_verified) {
            router.replace('/dashboard');
          }
        } catch (e) {}
      }
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let currentUser: any = null;
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('uop_user');
        if (stored) {
          try {
            currentUser = JSON.parse(stored);
          } catch (e) {}
        }
      }

      const updatedUser = await completeProfile({
        avatar_url: avatarUrl,
        bio: bio,
        address_text: addressText,
        aadhaar_number: aadhaarNumber,
        ...(currentUser?.phone ? { phone: currentUser.phone } : {}),
      } as any);

      if (typeof window !== 'undefined') {
        const merged = { ...currentUser, ...updatedUser, status: 'PROFILE_COMPLETED', avatar_url: avatarUrl, aadhaar_number: aadhaarNumber, address_text: addressText };
        localStorage.setItem('uop_user', JSON.stringify(merged));
      }
      
      // Redirect to Final Activation Step: Face Verification
      router.replace('/verify-face');
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6">
      <div className="bg-white p-8 sm:p-10 rounded-3xl border border-slate-200 w-full max-w-lg space-y-6 shadow-xl">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-black text-white flex items-center justify-center mx-auto mb-4 shadow-md">
            <UserCheck className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">Complete Profile Details</h1>
          <p className="text-slate-600 text-xs sm:text-sm mt-2">
            Step 2 of 3: Provide a profile photo, address, and Aadhaar number before final face verification activation.
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs text-center font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Profile Photo Preview */}
          <div className="text-center">
            <div className="relative w-24 h-24 mx-auto mb-3">
              <img
                src={avatarUrl}
                alt="Profile Avatar"
                className="w-24 h-24 rounded-full object-cover border-2 border-slate-900 shadow-md"
              />
              <div className="absolute bottom-0 right-0 p-2 bg-black rounded-full text-white shadow-md">
                <Camera className="w-4 h-4" />
              </div>
            </div>
            <span className="text-xs text-slate-600 font-semibold uppercase tracking-wider">Passport-size Photo / URL *</span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Profile Photo URL *</label>
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Aadhaar Identity Number (Optional - Required for Providers)</label>
            <div className="relative">
              <input
                type="text"
                value={aadhaarNumber}
                onChange={(e) => setAadhaarNumber(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black font-mono"
                placeholder="1234-5678-9012 (Optional)"
              />
              <FileText className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Primary Address / PostGIS Location *</label>
            <div className="relative">
              <input
                type="text"
                value={addressText}
                onChange={(e) => setAddressText(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
                required
              />
              <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Bio / Overview (Optional)</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={2}
              className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black resize-none"
              placeholder="Describe your services or background..."
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Saving Profile...</span>
              </>
            ) : (
              <>
                <span>Proceed to Face Verification</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
