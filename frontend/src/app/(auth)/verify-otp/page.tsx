'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { verifyOTP } from '@/lib/api';
import { Smartphone, CheckCircle, ArrowRight, ShieldCheck, RefreshCw } from 'lucide-react';
import { sanitizePhoneInput, validatePhoneNumber } from '@/lib/phoneUtils';

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
    const phoneValidation = validatePhoneNumber(phone);
    if (!phoneValidation.isValid) {
      setError(phoneValidation.error || 'Please enter a valid mobile number');
      return;
    }
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
    <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6">
      <div className="bg-white p-8 sm:p-10 rounded-3xl border border-slate-200 w-full max-w-md space-y-6 shadow-xl">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-black text-white flex items-center justify-center mx-auto mb-4 shadow-md">
            <Smartphone className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">Mobile OTP Verification</h1>
          <p className="text-slate-600 text-xs sm:text-sm mt-2">
            Step 1 of 3: Enter the 6-digit OTP code sent to <strong className="text-slate-900">{phone}</strong>
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs text-center font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => {
                setError('');
                setPhone(sanitizePhoneInput(e.target.value));
              }}
              className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
              placeholder="+91..."
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">6-Digit OTP Code</label>
            <input
              type="text"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-center tracking-[0.5em] font-mono text-xl text-black focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
              placeholder="123456"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-black hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2"
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
