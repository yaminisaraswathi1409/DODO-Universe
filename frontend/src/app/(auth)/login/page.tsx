'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { requestOTP, verifyOTP, UserProfile } from '@/lib/api';
import { Smartphone, ShieldCheck, ArrowRight, RefreshCw, Zap, ShieldAlert } from 'lucide-react';

export default function UserLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('+919876543210');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'PHONE' | 'OTP'>('PHONE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [demoOtp, setDemoOtp] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('uop_user');
      if (stored) {
        try {
          const user: UserProfile = JSON.parse(stored);
          if (user && (user.status === 'ACTIVE' || user.is_verified || user.role)) {
            if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
              router.replace('/admin/users');
            } else {
              router.replace('/dashboard');
            }
          }
        } catch (e) {}
      }
    }
  }, [router]);

  const routeUserByStatus = (user: UserProfile) => {
    // CASE 1: Admin users route to Admin Dashboard
    if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
      router.replace('/admin/users');
      return;
    }

    // CASE 2: Suspended / Deactivated Users
    if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
      setError('Your account has been deactivated or suspended by system administration. Please contact support.');
      return;
    }

    // CASE 3: Existing users logging in go directly to User Dashboard
    router.replace('/dashboard');
  };

  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) {
      setError('Please enter a valid mobile number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res: any = await requestOTP(phone);
      const devCode = res?.dev_otp_code || res?.otp_code || '123456';
      setDemoOtp(devCode);
      setStep('OTP');
    } catch (err: any) {
      setError(err.message || 'Failed to request OTP code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length < 6) {
      setError('Please enter a valid 6-digit OTP code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const user = await verifyOTP(phone, otp);
      if (!user) {
        throw new Error('Verification failed.');
      }

      // Check for suspended/deactivated user status
      if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
        setError('Your account has been deactivated or suspended by system administration. Access denied.');
        setLoading(false);
        return;
      }

      // Save local user session
      if (typeof window !== 'undefined') {
        localStorage.setItem('uop_user', JSON.stringify(user));
        localStorage.setItem('uop_phone', phone);
      }

      routeUserByStatus(user);
    } catch (err: any) {
      setError(err.message || 'Invalid or expired OTP code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex items-center justify-center p-6 selection:bg-blue-500 selection:text-white">
      <div className="glass-panel p-8 sm:p-10 rounded-3xl border border-slate-800 w-full max-w-md space-y-6 shadow-2xl">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/30">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-white">User Login</h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1.5">
            Enter your mobile number to receive your OTP code.
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs text-center font-medium flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {demoOtp && step === 'OTP' && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs text-center font-mono">
            Demo OTP Code Dispatched: <strong className="text-sm underline">{demoOtp}</strong>
          </div>
        )}

        {step === 'PHONE' ? (
          <form onSubmit={handleRequestOTP} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Mobile Phone Number</label>
              <div className="relative">
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-900/80 border border-slate-800 text-white text-sm focus:outline-none focus:border-blue-500 font-mono"
                  placeholder="+919876543210"
                  required
                />
                <Smartphone className="w-4 h-4 text-blue-400 absolute left-3.5 top-3.5" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-sm transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Sending OTP...</span>
                </>
              ) : (
                <>
                  <span>Request Login OTP</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="pt-4 border-t border-slate-800 text-center space-y-2">
              <p className="text-xs text-slate-400">
                Don&apos;t have an account?{' '}
                <Link href="/signup" className="text-purple-400 font-semibold hover:underline">
                  Sign up here →
                </Link>
              </p>
              <div className="pt-1">
                <span className="text-xs text-slate-500">System Administrator? </span>
                <Link href="/admin/login" className="text-xs text-purple-400 font-semibold hover:underline">
                  Admin Portal Login →
                </Link>
              </div>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerifyOTP} className="space-y-4">
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
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-sm transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verifying Code...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Verify OTP & Log In</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setStep('PHONE')}
              className="w-full text-xs text-slate-400 hover:text-white font-medium py-1"
            >
              ← Change Mobile Number
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
