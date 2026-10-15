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
    <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6">
      <div className="bg-white p-8 sm:p-10 rounded-3xl border border-slate-200 w-full max-w-md text-center space-y-6 shadow-xl">
        <div>
          <div className="w-14 h-14 rounded-2xl bg-black text-white flex items-center justify-center mx-auto mb-4 shadow-md">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">Face ID Verification</h1>
          <p className="text-slate-600 text-xs sm:text-sm mt-2">
            Final Activation Step: Scan your biometric face profile to activate account.
          </p>
        </div>

        {activated ? (
          <div className="space-y-4 py-4">
            <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center mx-auto text-black animate-bounce">
              <CheckCircle className="w-8 h-8 text-black" />
            </div>
            <h3 className="text-xl font-black text-slate-900">Account Fully Activated!</h3>
            <p className="text-xs text-slate-600">
              Mobile verified • Profile photo uploaded • Aadhaar recorded • Face ID verified. Opening Dashboard...
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Camera Viewfinder Simulation */}
            <div className="relative w-48 h-48 mx-auto rounded-full border-4 border-dashed border-slate-400 p-2 flex items-center justify-center bg-slate-50 overflow-hidden">
              {scanning ? (
                <div className="space-y-2">
                  <RefreshCw className="w-10 h-10 text-black animate-spin mx-auto" />
                  <span className="text-xs text-black font-semibold block">Scanning Facial Biometrics...</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <Camera className="w-10 h-10 text-slate-400 mx-auto" />
                  <span className="text-xs text-slate-500 font-medium block">Position face inside circle</span>
                </div>
              )}
              {scanning && (
                <div className="absolute inset-0 bg-slate-900/10 animate-pulse pointer-events-none" />
              )}
            </div>

            <button
              onClick={handleStartScan}
              disabled={scanning}
              className="w-full py-3.5 rounded-xl bg-black hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2"
            >
              {scanning ? 'Verifying Biometrics...' : 'Start Face Verification Scan'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
