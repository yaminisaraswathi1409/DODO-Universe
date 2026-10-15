'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserProfile, getStoredUser, clearUserSession } from '@/lib/api';
import { Layers, ShieldCheck, Cpu, Sparkles, MapPin, Zap, RefreshCw, LogIn, User, LogOut } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    const user = getStoredUser();
    if (user && (user.status === 'ACTIVE' || user.is_verified || user.role)) {
      setCurrentUser(user);
    }
  }, [router]);

  const handleLogout = () => {
    clearUserSession();
    setCurrentUser(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans selection:bg-slate-900 selection:text-white">
      {/* Public Navigation Header: Logo | Categories | Opportunities | Services | Login | Sign Up */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center shadow-sm">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-tight text-slate-900">DODO-Universe</span>
              <span className="text-xs text-slate-500 block font-medium uppercase tracking-widest">UOP Platform</span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
            <Link href="/categories" className="hover:text-black transition-colors">Categories</Link>
            <Link href="/opportunities" className="hover:text-black transition-colors">Opportunities</Link>
            <Link href="/categories" className="hover:text-black transition-colors">Services</Link>
            {currentUser ? (
              <Link href="/dashboard" className="text-black font-extrabold transition-colors flex items-center gap-1.5">
                <User className="w-4 h-4" />
                <span>My Dashboard</span>
              </Link>
            ) : (
              <>
                <Link href="/login" className="hover:text-black text-slate-800 font-bold transition-colors flex items-center gap-1.5">
                  <LogIn className="w-4 h-4" />
                  <span>Login</span>
                </Link>
                <Link href="/signup" className="hover:text-black text-black font-extrabold transition-colors flex items-center gap-1.5">
                  <User className="w-4 h-4" />
                  <span>Sign Up</span>
                </Link>
              </>
            )}
          </nav>

          <div className="flex items-center gap-4">
            {currentUser ? (
              <div className="flex items-center gap-3">
                <Link
                  href="/dashboard"
                  className="px-4 py-2 rounded-xl bg-black hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>My Dashboard</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold border border-slate-200 flex items-center gap-1 transition-all"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  className="px-4 py-2 rounded-xl bg-white text-slate-800 hover:text-black text-xs font-semibold border border-slate-300 hover:bg-slate-50 flex items-center gap-1.5"
                >
                  <LogIn className="w-3.5 h-3.5 text-slate-900" />
                  <span>Login</span>
                </Link>
                <Link 
                  href="/signup" 
                  className="px-4 py-2 rounded-xl bg-black hover:bg-slate-800 text-white font-semibold text-xs transition-all shadow-sm flex items-center gap-1.5"
                >
                  <span>Sign Up</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-20 pb-28 px-6 overflow-hidden">
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 border border-slate-200 text-slate-800 text-xs font-semibold uppercase tracking-wider mb-8">
            <Sparkles className="w-4 h-4 text-slate-900" />
            <span>Universal Opportunity Platform v1.0 • Pure Go & PostGIS Core</span>
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-tight text-slate-900 mb-8">
            One Engine connecting every <br />
            <span className="text-black underline underline-offset-8 decoration-slate-300">Need with every Offer</span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed mb-12">
            Eliminate fragmented apps. UOP enables every human, equipment owner, driver, and business to act dynamically as both a <strong className="text-slate-900">Customer</strong> and a <strong className="text-slate-900">Provider</strong> through a voice-first AI ecosystem.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {currentUser ? (
              <Link
                href="/dashboard"
                className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-black hover:bg-slate-800 text-white font-bold text-base transition-all shadow-sm flex items-center justify-center gap-3"
              >
                <User className="w-5 h-5 text-white" />
                <span>Go to My Dashboard ({currentUser.full_name})</span>
              </Link>
            ) : (
              <Link
                href="/signup"
                className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-black hover:bg-slate-800 text-white font-bold text-base transition-all shadow-sm flex items-center justify-center gap-3"
              >
                <Zap className="w-5 h-5 text-white" />
                <span>Sign Up Now</span>
              </Link>
            )}

            <Link
              href="/categories"
              className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-white hover:bg-slate-50 text-slate-900 font-semibold text-base flex items-center justify-center gap-2 border border-slate-300 shadow-sm"
            >
              <Layers className="w-5 h-5 text-slate-900" />
              <span>Browse Categories</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Voice-First Experience Demonstration */}
      <section id="voice-ai" className="py-20 px-6 relative border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Natural Conversation</span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-slate-900 mt-2">Voice-First Experience</h2>
            <p className="text-slate-600 mt-4 max-w-2xl mx-auto">
              No complicated forms required. Users state their request naturally in their native language while AI parses intent and matches nearby PostGIS providers.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-10 items-center">
            {/* Conversation Visualizer */}
            <div className="bg-slate-50 p-8 rounded-3xl space-y-4 border border-slate-200 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-slate-900">User</span>
                </div>
                <div className="bg-white p-4 rounded-2xl rounded-tl-none border border-slate-200 shadow-sm max-w-md">
                  <p className="text-sm text-slate-900 font-medium">&quot;I need a tractor tomorrow morning in Choutuppal.&quot;</p>
                </div>
              </div>

              <div className="flex items-start gap-4 flex-row-reverse">
                <div className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center shrink-0">
                  <Cpu className="w-5 h-5 text-white" />
                </div>
                <div className="bg-black text-white p-4 rounded-2xl rounded-tr-none max-w-md text-right shadow-sm">
                  <p className="text-sm font-medium">&quot;Got it! How many acres and what implement do you need?&quot;</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-slate-900">User</span>
                </div>
                <div className="bg-white p-4 rounded-2xl rounded-tl-none border border-slate-200 shadow-sm max-w-md">
                  <p className="text-sm text-slate-900 font-medium">&quot;Three acres. Rotavator at 8 AM.&quot;</p>
                </div>
              </div>

              <div className="flex items-start gap-4 flex-row-reverse">
                <div className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center shrink-0">
                  <Cpu className="w-5 h-5 text-white" />
                </div>
                <div className="bg-black text-white p-4 rounded-2xl rounded-tr-none max-w-md text-right shadow-sm">
                  <p className="text-sm font-medium">&quot;Found 2 verified tractor owners within 8 km. Booking confirmed with 4.9★ owner!&quot;</p>
                </div>
              </div>
            </div>

            {/* Core Capability Badges */}
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
                <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 shrink-0">
                  <MapPin className="w-6 h-6 text-slate-900" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-900">PostGIS Radial Matching</h3>
                  <p className="text-sm text-slate-600 mt-1">Sub-second spatial queries (`ST_DWithin`) locate available providers within custom radius parameters.</p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
                <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 shrink-0">
                  <RefreshCw className="w-6 h-6 text-slate-900" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-900">Fluid Dual Identity</h3>
                  <p className="text-sm text-slate-600 mt-1">No split accounts. Rent out equipment in the morning, book medicine delivery in the afternoon.</p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
                <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 shrink-0">
                  <ShieldCheck className="w-6 h-6 text-slate-900" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-900">Trust & Accountability</h3>
                  <p className="text-sm text-slate-600 mt-1">Dynamic trust scores based on completion history, on-time delivery, and community feedback.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto bg-white border-t border-slate-200 py-8 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>© {new Date().getFullYear()} Universal Opportunity Platform (UOP). Pure Go & PostgreSQL PostGIS Backend.</div>
          <div className="flex gap-6">
            <Link href="/categories" className="hover:text-black font-semibold">Categories</Link>
            <Link href="/opportunities" className="hover:text-black font-semibold">Public Listings</Link>
            <Link href="/sitemap.xml" className="hover:text-black font-semibold">Sitemap</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
