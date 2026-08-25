'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { requestOTP, verifyOTP, UserProfile } from '@/lib/api';
import { ShieldAlert, KeyRound, ArrowRight, RefreshCw, ArrowLeft, Lock } from 'lucide-react';

export default function AdminLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('+919999999999');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [demoOtp, setDemoOtp] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('uop_user');
      if (stored) {
        try {
          const user: UserProfile = JSON.parse(stored);
          if (user && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
            router.replace('/admin/users');
          }
        } catch (e) {}
      }
    }
  }, [router]);

  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) {
      setError('Please enter a valid Admin phone number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await requestOTP(phone);
      setOtpSent(true);
      if (res?.dev_otp_code) {
        setDemoOtp(res.dev_otp_code);
        setOtpCode(res.dev_otp_code);
      } else {
        setOtpCode('123456');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to request Admin OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode) {
      setError('Please enter the 6-digit OTP code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const user: UserProfile | null = await verifyOTP(phone, otpCode);
      if (user) {
        // Enforce Admin Role Guard
        if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
          setError('Access Denied: You do not have administrator permissions.');
          setLoading(false);
          return;
        }

        if (typeof window !== 'undefined') {
          localStorage.setItem('uop_user', JSON.stringify(user));
          localStorage.setItem('uop_user_id', user.id);
          localStorage.setItem('uop_phone', user.phone || phone);
        }

        router.replace('/admin/users');
      } else {
        setError('Verification failed');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to verify OTP code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex items-center justify-center p-6 selection:bg-purple-500 selection:text-white">
      <div className="glass-panel p-8 sm:p-10 rounded-3xl border border-slate-800 w-full max-w-md space-y-6 shadow-2xl">
        <div>
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-4 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Main Platform</span>
          </Link>
          <div className="w-14 h-14 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7 text-purple-400" />
          </div>
          <h1 className="text-2xl font-extrabold text-white text-center">System Admin Authentication</h1>
          <p className="text-slate-400 text-xs sm:text-sm text-center mt-2">
            Restricted System Governance Access
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs text-center font-medium flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {!otpSent ? (
          <form onSubmit={handleRequestOTP} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Admin Mobile Phone Number *</label>
              <div className="relative">
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-900/80 border border-slate-800 text-white text-sm focus:outline-none focus:border-purple-500 font-mono"
                  placeholder="+919999999999"
                  required
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-2 font-mono">
                Super Admin Test Credential: <strong className="text-purple-300">+919999999999</strong>
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:opacity-95 text-white font-bold text-sm transition-all shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Requesting OTP...</span>
                </>
              ) : (
                <>
                  <span>Request Admin OTP</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOTP} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Enter 6-Digit Admin OTP *</label>
              <div className="relative">
                <input
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-900/80 border border-slate-800 text-white text-sm focus:outline-none focus:border-purple-500 font-mono tracking-widest text-center font-bold text-lg"
                  placeholder="123456"
                  maxLength={6}
                  required
                />
                <KeyRound className="w-4 h-4 text-purple-400 absolute left-3.5 top-3.5" />
              </div>
              {demoOtp && (
                <div className="p-3 mt-3 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs text-center font-mono font-semibold">
                  Development Mode OTP: <span className="text-white text-sm font-bold">{demoOtp}</span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:opacity-95 text-white font-bold text-sm transition-all shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verifying Admin Access...</span>
                </>
              ) : (
                <>
                  <span>Verify OTP & Enter Console</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setOtpSent(false)}
              className="w-full text-center text-xs text-slate-400 hover:text-white mt-2 block"
            >
              ← Change Mobile Number
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
