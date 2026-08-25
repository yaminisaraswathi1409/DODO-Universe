'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signupUser, verifyOTP, UserProfile } from '@/lib/api';
import { UserPlus, Smartphone, Mail, User, ArrowRight, ShieldCheck, RefreshCw, Zap } from 'lucide-react';

export default function UserSignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('+91');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'DETAILS' | 'OTP'>('DETAILS');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [demoOtp, setDemoOtp] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('uop_user');
      if (stored) {
        try {
          const user: UserProfile = JSON.parse(stored);
          if (user && (user.status === 'ACTIVE' || user.is_verified)) {
            router.replace('/dashboard');
          }
        } catch (e) {}
      }
    }
  }, [router]);

  const routeUserByStatus = (user: UserProfile) => {
    if (user.status === 'ACTIVE' || user.is_verified) {
      router.replace('/dashboard');
    } else if (user.status === 'PROFILE_COMPLETED') {
      router.replace('/verify-face');
    } else {
      router.replace('/complete-profile');
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Please enter your full name');
      return;
    }
    if (!phone || phone.length < 10) {
      setError('Please enter a valid mobile phone number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res: any = await signupUser({
        full_name: fullName,
        phone: phone,
        email: email,
      });

      const devCode = res?.dev_otp_code || res?.user?.otp_code || '123456';
      setDemoOtp(devCode);
      setStep('OTP');
    } catch (err: any) {
      setError(err.message || 'Failed to create signup invitation. Please try again.');
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
        throw new Error('OTP Verification failed.');
      }

      // Save local user session
      if (typeof window !== 'undefined') {
        localStorage.setItem('uop_user', JSON.stringify(user));
        localStorage.setItem('uop_phone', phone);
      }

      // Route newly registered PENDING user to /complete-profile
      routeUserByStatus(user);
    } catch (err: any) {
      setError(err.message || 'Invalid or expired OTP code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex items-center justify-center p-6 selection:bg-purple-500 selection:text-white">
      <div className="glass-panel p-8 sm:p-10 rounded-3xl border border-slate-800 w-full max-w-md space-y-6 shadow-2xl">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-500 to-blue-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-purple-500/30">
            <UserPlus className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-white">Create DODO-Universe Account</h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1.5">
            Join the Universal Opportunity Platform. Enter your details to get started.
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs text-center font-medium">
            {error}
          </div>
        )}

        {demoOtp && step === 'OTP' && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs text-center font-mono">
            Demo Signup OTP Code Dispatched: <strong className="text-sm underline">{demoOtp}</strong>
          </div>
        )}

        {step === 'DETAILS' ? (
          <form onSubmit={handleSignupSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Full Name *</label>
              <div className="relative">
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-900/80 border border-slate-800 text-white text-sm focus:outline-none focus:border-purple-500"
                  placeholder="e.g. Alice Smith"
                  required
                />
                <User className="w-4 h-4 text-purple-400 absolute left-3.5 top-3.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Mobile Phone Number *</label>
              <div className="relative">
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-900/80 border border-slate-800 text-white text-sm focus:outline-none focus:border-purple-500"
                  placeholder="+919876543210"
                  required
                />
                <Smartphone className="w-4 h-4 text-purple-400 absolute left-3.5 top-3.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Email Address (Optional)</label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-900/80 border border-slate-800 text-white text-sm focus:outline-none focus:border-purple-500"
                  placeholder="alice@example.com"
                />
                <Mail className="w-4 h-4 text-purple-400 absolute left-3.5 top-3.5" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:opacity-95 disabled:opacity-50 text-white font-bold text-sm transition-all shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Registering...</span>
                </>
              ) : (
                <>
                  <span>Create Account & Send OTP</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="pt-4 border-t border-slate-800 text-center space-y-2">
              <p className="text-xs text-slate-400">
                Already have an account?{' '}
                <Link href="/login" className="text-purple-400 font-semibold hover:underline">
                  Log in here →
                </Link>
              </p>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerifyOTP} className="space-y-4">
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 text-center">
              Enter the 6-digit verification code sent to <strong className="text-purple-300">{phone}</strong>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">6-Digit OTP Code</label>
              <input
                type="text"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center tracking-[0.5em] font-mono text-xl text-purple-400 focus:outline-none focus:border-purple-500"
                placeholder="123456"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:opacity-95 disabled:opacity-50 text-white font-bold text-sm transition-all shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verifying Code...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Verify Mobile & Continue Onboarding</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setStep('DETAILS')}
              className="w-full text-xs text-slate-400 hover:text-white font-medium py-1 text-center"
            >
              ← Edit Signup Details
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
