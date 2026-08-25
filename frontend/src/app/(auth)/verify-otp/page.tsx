'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { verifyOTP } from '@/lib/api';
import { Smartphone, CheckCircle, ArrowRight, ShieldCheck, RefreshCw } from 'lucide-react';

export default function VerifyOTPPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('+919876543210');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('uop_user');
      if (stored) {
        try {
          const user = JSON.parse(stored);
          if (user && (user.status === 'ACTIVE' || user.is_verified)) {
            router.replace('/dashboard');
          }
        } catch (e) {}
      }
    }
  }, [router]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length < 6) {
      setError('Please enter a valid 6-digit OTP code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const user = await verifyOTP(phone, otp);
      if (typeof window !== 'undefined' && user) {
        localStorage.setItem('uop_user', JSON.stringify(user));
      }
      
      // Dynamic Status Router
      if (user && (user.status === 'ACTIVE' || user.is_verified)) {
        router.replace('/dashboard');
      } else if (user && user.status === 'PROFILE_COMPLETED') {
        router.replace('/verify-face');
      } else {
        router.replace('/complete-profile');
      }
    } catch (err: any) {
      setError(err.message || 'OTP verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex items-center justify-center p-6">
      <div className="glass-panel p-8 sm:p-10 rounded-3xl border border-slate-800 w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mx-auto mb-4">
            <Smartphone className="w-7 h-7 text-blue-400" />
          </div>
          <h1 className="text-2xl font-extrabold text-white">Mobile OTP Verification</h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-2">
            Step 1 of 3: Enter the 6-digit OTP code sent to <strong className="text-slate-200">{phone}</strong>
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs text-center font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Phone Number</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-slate-900/80 border border-slate-800 text-white text-sm focus:outline-none focus:border-blue-500"
              placeholder="+91..."
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">6-Digit OTP Code</label>
            <input
              type="text"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center tracking-[0.5em] font-mono text-xl text-blue-400 focus:outline-none focus:border-blue-500"
              placeholder="123456"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm transition-all shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Verifying OTP...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Verify & Continue</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
