'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { requestOTP, verifyOTP, UserProfile, getStoredUser, saveUserSession } from '@/lib/api';
import { ShieldAlert, KeyRound, ArrowRight, RefreshCw, ArrowLeft, Lock } from 'lucide-react';
import { sanitizePhoneInput, validatePhoneNumber } from '@/lib/phoneUtils';

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
      const user = getStoredUser();
      if (user && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
        if (window.history.length <= 1) {
          router.push('/admin/users');
        }
      }
    }
  }, [router]);

  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    const phoneValidation = validatePhoneNumber(phone);
    if (!phoneValidation.isValid) {
      setError(phoneValidation.error || 'Please enter a valid Admin phone number');
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

        saveUserSession(user);
        router.push('/admin/users');
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
    <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6 font-sans selection:bg-slate-900 selection:text-white">
      <div className="bg-white p-8 sm:p-10 rounded-3xl border border-slate-200 w-full max-w-md space-y-6 shadow-sm">
        <div>
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-black mb-4 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Main Platform</span>
          </Link>
          <div className="w-14 h-14 rounded-2xl bg-black flex items-center justify-center mx-auto mb-4 shadow-sm">
            <Lock className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 text-center">System Admin Authentication</h1>
          <p className="text-slate-500 text-xs sm:text-sm text-center mt-2">
            Restricted System Governance Access
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-900 text-xs text-center font-medium flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-slate-900" />
            <span>{error}</span>
          </div>
        )}

        {!otpSent ? (
          <form onSubmit={handleRequestOTP} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Admin Mobile Phone Number *</label>
              <div className="relative">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setError('');
                    setPhone(sanitizePhoneInput(e.target.value));
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-black font-mono"
                  placeholder="+919999999999"
                  required
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-2 font-mono">
                Super Admin Test Credential: <strong className="text-slate-900">+919999999999</strong>
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-sm transition-all shadow-sm flex items-center justify-center gap-2"
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
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Enter 6-Digit Admin OTP *</label>
              <div className="relative">
                <input
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-black font-mono tracking-widest text-center font-bold text-lg"
                  placeholder="123456"
                  maxLength={6}
                  required
                />
                <KeyRound className="w-4 h-4 text-slate-700 absolute left-3.5 top-3.5" />
              </div>
              {demoOtp && (
                <div className="p-3 mt-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 text-xs text-center font-mono font-semibold">
                  Development Mode OTP: <span className="text-slate-900 text-sm font-bold">{demoOtp}</span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-sm transition-all shadow-sm flex items-center justify-center gap-2"
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
              className="w-full text-center text-xs text-slate-600 hover:text-black mt-2 block"
            >
              ← Change Mobile Number
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
