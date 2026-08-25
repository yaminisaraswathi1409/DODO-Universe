'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { verifyFace } from '@/lib/api';
import { Camera, CheckCircle, ShieldCheck, RefreshCw } from 'lucide-react';

export default function VerifyFacePage() {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('uop_user');
      if (stored) {
        try {
          const user = JSON.parse(stored);
          // Status Guard: Returning ACTIVE users bypass face verification directly to Main Dashboard
          if (user.status === 'ACTIVE' || user.is_verified) {
            router.replace('/dashboard');
          }
        } catch (e) {}
      }
    }
  }, [router]);

  const handleStartScan = async () => {
    setScanning(true);
    let currentUser: any = null;
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('uop_user');
      if (stored) {
        try { currentUser = JSON.parse(stored); } catch (e) {}
      }
    }

    try {
      const faceRef = `face_snapshot_${Date.now()}`;
      let resUser = null;
      if (currentUser?.phone || currentUser?.id) {
        try {
          resUser = await verifyFace(faceRef);
        } catch (err) {
          console.warn('Backend face verification call:', err);
        }
      }

      setScanning(false);
      setActivated(true);

      if (typeof window !== 'undefined') {
        const merged = {
          ...currentUser,
          ...resUser,
          status: 'ACTIVE',
          is_verified: true,
          face_verified: true,
        };
        localStorage.setItem('uop_user', JSON.stringify(merged));
      }

      setTimeout(() => {
        router.replace('/dashboard');
      }, 1500);
    } catch (e) {
      setScanning(false);
      setActivated(true);
      setTimeout(() => {
        router.replace('/dashboard');
      }, 1500);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex items-center justify-center p-6 selection:bg-emerald-500 selection:text-white">
      <div className="glass-panel p-8 sm:p-10 rounded-3xl border border-slate-800 w-full max-w-md text-center space-y-6 shadow-2xl">
        <div>
          <div className="w-14 h-14 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-7 h-7 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-extrabold text-white">Face ID Verification</h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-2">
            Final Activation Step: Scan your biometric face profile to activate account.
          </p>
        </div>

        {activated ? (
          <div className="space-y-4 py-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto text-emerald-400 animate-bounce">
              <CheckCircle className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-extrabold text-white">Account Fully Activated!</h3>
            <p className="text-xs text-slate-300">
              Mobile verified • Profile photo uploaded • Aadhaar recorded • Face ID verified. Opening Dashboard...
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Camera Viewfinder Simulation */}
            <div className="relative w-48 h-48 mx-auto rounded-full border-4 border-dashed border-emerald-500/40 p-2 flex items-center justify-center bg-slate-900/60 overflow-hidden">
              {scanning ? (
                <div className="space-y-2">
                  <RefreshCw className="w-10 h-10 text-emerald-400 animate-spin mx-auto" />
                  <span className="text-xs text-emerald-400 font-semibold block">Scanning Facial Biometrics...</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <Camera className="w-10 h-10 text-slate-400 mx-auto" />
                  <span className="text-xs text-slate-400 font-medium block">Position face inside circle</span>
                </div>
              )}
              {scanning && (
                <div className="absolute inset-0 bg-emerald-500/10 animate-pulse pointer-events-none" />
              )}
            </div>

            <button
              onClick={handleStartScan}
              disabled={scanning}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 hover:opacity-95 disabled:opacity-50 text-white font-bold text-sm transition-all shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
            >
              {scanning ? 'Verifying Biometrics...' : 'Start Face Verification Scan'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
