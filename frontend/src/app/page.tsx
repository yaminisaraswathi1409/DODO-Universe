'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserProfile } from '@/lib/api';
import { Layers, ShieldCheck, Cpu, Sparkles, MapPin, Zap, RefreshCw, LogIn, User, LogOut } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('uop_user');
      if (stored) {
        try {
          const user: UserProfile = JSON.parse(stored);
          if (user && (user.status === 'ACTIVE' || user.is_verified)) {
            setCurrentUser(user);
          }
        } catch (e) {}
      }
    }
  }, [router]);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('uop_user');
      localStorage.removeItem('uop_user_id');
      localStorage.removeItem('uop_phone');
    }
    setCurrentUser(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100 selection:bg-blue-500 selection:text-white">
      {/* Public Navigation Header: Logo | Categories | Opportunities | Services | Login | Sign Up */}
      <header className="sticky top-0 z-50 glass-panel border-b border-slate-800/80 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-tight text-white">DODO-Universe</span>
              <span className="text-xs text-blue-400 block font-medium uppercase tracking-widest">UOP Platform</span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
            <Link href="/categories" className="hover:text-blue-400 transition-colors">Categories</Link>
            <Link href="/opportunities" className="hover:text-blue-400 transition-colors">Opportunities</Link>
            <Link href="/categories" className="hover:text-blue-400 transition-colors">Services</Link>
            {currentUser ? (
              <Link href="/dashboard" className="text-blue-400 font-bold transition-colors flex items-center gap-1.5">
                <User className="w-4 h-4" />
                <span>My Dashboard</span>
              </Link>
            ) : (
              <>
                <Link href="/login" className="hover:text-blue-400 text-blue-400 font-bold transition-colors flex items-center gap-1.5">
                  <LogIn className="w-4 h-4" />
                  <span>Login</span>
                </Link>
                <Link href="/signup" className="hover:text-purple-400 text-purple-400 font-bold transition-colors flex items-center gap-1.5">
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
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/25"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>My Dashboard</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold border border-rose-500/30 flex items-center gap-1 transition-all"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  className="px-4 py-2 rounded-xl glass-panel text-slate-200 hover:text-white text-xs font-semibold border border-slate-700 flex items-center gap-1.5"
                >
                  <LogIn className="w-3.5 h-3.5 text-blue-400" />
                  <span>Login</span>
                </Link>
                <Link 
                  href="/signup" 
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs transition-all shadow-md flex items-center gap-1.5"
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
        {/* Ambient Gradient Glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/15 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute top-1/3 right-10 w-[400px] h-[400px] bg-purple-600/15 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-panel border border-blue-500/30 text-blue-400 text-xs font-semibold uppercase tracking-wider mb-8">
            <Sparkles className="w-4 h-4 text-blue-400 animate-pulse" />
            <span>Universal Opportunity Platform v1.0 • Pure Go & PostGIS Core</span>
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-tight text-white mb-8">
            One Engine connecting every <br />
            <span className="text-gradient">Need with every Offer</span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto leading-relaxed mb-12">
            Eliminate fragmented apps. UOP enables every human, equipment owner, driver, and business to act dynamically as both a <strong className="text-white">Customer</strong> and a <strong className="text-white">Provider</strong> through a voice-first AI ecosystem.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {currentUser ? (
              <Link
                href="/dashboard"
                className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:opacity-95 text-white font-bold text-base transition-all shadow-xl shadow-blue-600/30 flex items-center justify-center gap-3"
              >
                <User className="w-5 h-5 text-white" />
                <span>Go to My Dashboard ({currentUser.full_name})</span>
              </Link>
            ) : (
              <Link
                href="/signup"
                className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:opacity-95 text-white font-bold text-base transition-all shadow-xl shadow-purple-600/30 flex items-center justify-center gap-3"
              >
                <Zap className="w-5 h-5 text-white" />
                <span>Sign Up Now</span>
              </Link>
            )}

            <Link
              href="/categories"
              className="w-full sm:w-auto px-8 py-4 rounded-2xl glass-panel glass-panel-hover text-slate-200 font-semibold text-base flex items-center justify-center gap-2 border border-slate-700"
            >
              <Layers className="w-5 h-5 text-indigo-400" />
              <span>Browse Categories</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Voice-First Experience Demonstration */}
      <section id="voice-ai" className="py-20 px-6 relative border-t border-slate-800/80 bg-slate-950/40">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Natural Conversation</span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white mt-2">Voice-First Experience</h2>
            <p className="text-slate-400 mt-4 max-w-2xl mx-auto">
              No complicated forms required. Users state their request naturally in their native language while AI parses intent and matches nearby PostGIS providers.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-10 items-center">
            {/* Conversation Visualizer */}
            <div className="glass-panel p-8 rounded-3xl space-y-4 border border-slate-800">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-emerald-400">User</span>
                </div>
                <div className="bg-slate-800/80 p-4 rounded-2xl rounded-tl-none border border-slate-700/60 max-w-md">
                  <p className="text-sm text-slate-200 font-medium">&quot;I need a tractor tomorrow morning in Choutuppal.&quot;</p>
                </div>
              </div>

              <div className="flex items-start gap-4 flex-row-reverse">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center shrink-0">
                  <Cpu className="w-5 h-5 text-blue-400" />
                </div>
                <div className="bg-blue-950/60 p-4 rounded-2xl rounded-tr-none border border-blue-800/60 max-w-md text-right">
                  <p className="text-sm text-blue-200 font-medium">&quot;Got it! How many acres and what implement do you need?&quot;</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-emerald-400">User</span>
                </div>
                <div className="bg-slate-800/80 p-4 rounded-2xl rounded-tl-none border border-slate-700/60 max-w-md">
                  <p className="text-sm text-slate-200 font-medium">&quot;Three acres. Rotavator at 8 AM.&quot;</p>
                </div>
              </div>

              <div className="flex items-start gap-4 flex-row-reverse">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center shrink-0">
                  <Cpu className="w-5 h-5 text-blue-400" />
                </div>
                <div className="bg-blue-950/60 p-4 rounded-2xl rounded-tr-none border border-blue-800/60 max-w-md text-right">
                  <p className="text-sm text-blue-200 font-medium">&quot;Found 2 verified tractor owners within 8 km. Booking confirmed with 4.9★ owner!&quot;</p>
                </div>
              </div>
            </div>

            {/* Core Capability Badges */}
            <div className="space-y-6">
              <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex items-start gap-4">
                <div className="p-3 rounded-xl bg-blue-600/20 border border-blue-500/30 shrink-0">
                  <MapPin className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-white">PostGIS Radial Matching</h3>
                  <p className="text-sm text-slate-400 mt-1">Sub-second spatial queries (`ST_DWithin`) locate available providers within custom radius parameters.</p>
                </div>
              </div>

              <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex items-start gap-4">
                <div className="p-3 rounded-xl bg-purple-600/20 border border-purple-500/30 shrink-0">
                  <RefreshCw className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-white">Fluid Dual Identity</h3>
                  <p className="text-sm text-slate-400 mt-1">No split accounts. Rent out equipment in the morning, book medicine delivery in the afternoon.</p>
                </div>
              </div>

              <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex items-start gap-4">
                <div className="p-3 rounded-xl bg-emerald-600/20 border border-emerald-500/30 shrink-0">
                  <ShieldCheck className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-white">Trust & Accountability</h3>
                  <p className="text-sm text-slate-400 mt-1">Dynamic trust scores based on completion history, on-time delivery, and community feedback.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-800/80 py-8 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>© {new Date().getFullYear()} Universal Opportunity Platform (UOP). Pure Go & PostgreSQL PostGIS Backend.</div>
          <div className="flex gap-6">
            <Link href="/categories" className="hover:text-slate-300">Categories</Link>
            <Link href="/opportunities" className="hover:text-slate-300">Public Listings</Link>
            <Link href="/sitemap.xml" className="hover:text-slate-300">Sitemap</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
