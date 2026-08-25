'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { UserProfile } from '@/lib/api';
import {
  Home,
  Package,
  FileText,
  ShoppingBag,
  MessageSquare,
  Bell,
  User,
  MapPin,
  HelpCircle,
  CheckCircle2,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Zap,
  ShieldCheck,
} from 'lucide-react';

interface UserSidebarProps {
  children: React.ReactNode;
}

export default function UserSidebar({ children }: UserSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentTab = searchParams ? searchParams.get('tab') : null;

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('uop_user');
      if (stored) {
        try {
          setCurrentUser(JSON.parse(stored));
        } catch {
          // ignore
        }
      }
    }
  }, []);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('uop_user');
      localStorage.removeItem('uop_token');
      localStorage.removeItem('uop_phone');
    }
    router.push('/login');
  };

  const navItems = [
    {
      label: 'Home / Dashboard',
      href: '/dashboard',
      icon: Home,
      isActive: pathname === '/dashboard' && (!currentTab || currentTab === 'dashboard'),
    },
    {
      label: 'Marketplace',
      href: '/opportunities',
      icon: ShoppingBag,
      isActive: pathname === '/opportunities',
    },
    {
      label: 'My Orders',
      href: '/dashboard?tab=orders',
      icon: Package,
      isActive: pathname === '/dashboard' && currentTab === 'orders',
    },
    {
      label: 'Accepted Orders',
      href: '/dashboard?tab=accepted',
      icon: CheckCircle2,
      isActive: pathname === '/dashboard' && (currentTab === 'accepted' || currentTab === 'requests'),
    },
    {
      label: 'Services I Provide',
      href: '/dashboard?tab=services',
      icon: ShieldCheck,
      isActive: pathname === '/dashboard' && currentTab === 'services',
    },
    {
      label: 'Saved Addresses',
      href: '/dashboard?tab=addresses',
      icon: MapPin,
      isActive: pathname === '/dashboard' && currentTab === 'addresses',
    },
    {
      label: 'Messages',
      href: '/dashboard?tab=messages',
      icon: MessageSquare,
      isActive: pathname === '/dashboard' && currentTab === 'messages',
      badge: '3',
    },
    {
      label: 'Notifications',
      href: '/dashboard?tab=notifications',
      icon: Bell,
      isActive: pathname === '/dashboard' && currentTab === 'notifications',
      badge: '2',
    },
    {
      label: 'Profile',
      href: '/dashboard?tab=profile',
      icon: User,
      isActive: pathname === '/dashboard' && currentTab === 'profile',
    },
    {
      label: 'Help & Support',
      href: '/dashboard?tab=support',
      icon: HelpCircle,
      isActive: pathname === '/dashboard' && currentTab === 'support',
    },
  ];


  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col md:flex-row font-sans selection:bg-blue-500 selection:text-white">
      {/* Mobile Top Navigation Bar with Hamburger Toggle */}
      <div className="md:hidden sticky top-0 z-40 bg-[#0d1322]/95 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-extrabold text-base text-white tracking-tight">DODO-Universe</span>
        </Link>

        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-colors"
          aria-label="Toggle Navigation Menu"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Slide-Out Drawer & Backdrop */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-72 bg-[#0d1322] border-r border-slate-800 p-5 flex flex-col justify-between z-10">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <Link href="/dashboard" className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-extrabold text-base text-white">DODO-Universe</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {currentUser && (
                <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold">
                    {currentUser.full_name?.charAt(0) || 'U'}
                  </div>
                  <div className="overflow-hidden">
                    <div className="text-xs font-bold text-white truncate">{currentUser.full_name}</div>
                    <div className="text-[10px] text-slate-400 truncate">{currentUser.phone}</div>
                  </div>
                </div>
              )}

              <nav className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                        item.isActive
                          ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-600/20'
                          : 'text-slate-400 hover:text-white hover:bg-slate-900/80'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-mono font-bold">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full px-3.5 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold flex items-center gap-3 transition-all"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Fixed Left Sidebar */}
      <aside
        className={`hidden md:flex flex-col justify-between fixed top-0 bottom-0 left-0 z-30 bg-[#0d1322] border-r border-slate-800/80 transition-all duration-300 ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Header & Logo */}
        <div className="p-5 space-y-6">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30 shrink-0">
                <Zap className="w-5 h-5 text-white" />
              </div>
              {!collapsed && (
                <div>
                  <span className="font-extrabold text-lg text-white tracking-tight block leading-none">DODO</span>
                  <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest block mt-0.5">User Portal</span>
                </div>
              )}
            </Link>

            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              className="p-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
              title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          {/* User Profile Card */}
          {currentUser && !collapsed && (
            <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-sm shrink-0">
                {currentUser.full_name?.charAt(0) || 'U'}
              </div>
              <div className="overflow-hidden">
                <div className="text-xs font-bold text-white truncate">{currentUser.full_name}</div>
                <div className="text-[10px] text-slate-400 truncate">{currentUser.phone}</div>
              </div>
            </div>
          )}

          {/* Navigation Menu */}
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    item.isActive
                      ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-600/25'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900/80'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4.5 h-4.5 shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </div>
                  {!collapsed && item.badge && (
                    <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-mono font-bold">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer Logout Button */}
        <div className="p-5 border-t border-slate-800/80">
          <button
            type="button"
            onClick={handleLogout}
            title={collapsed ? 'Logout' : undefined}
            className="w-full px-3.5 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold flex items-center justify-center gap-3 transition-all"
          >
            <LogOut className="w-4.5 h-4.5 shrink-0" />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content View Container */}
      <main
        className={`flex-1 transition-all duration-300 ${
          collapsed ? 'md:ml-20' : 'md:ml-64'
        }`}
      >
        {children}
      </main>
    </div>
  );
}
