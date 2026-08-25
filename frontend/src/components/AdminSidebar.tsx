'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { UserProfile } from '@/lib/api';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Package,
  Layers,
  FileCheck,
  GitMerge,
  CreditCard,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Shield,
} from 'lucide-react';

interface AdminSidebarProps {
  children: React.ReactNode;
}

export default function AdminSidebar({ children }: AdminSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentTab = searchParams ? searchParams.get('tab') : 'dashboard';

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
    router.push('/admin/login');
  };

  const navItems = [
    {
      label: 'Dashboard',
      href: '/admin/users?tab=dashboard',
      icon: LayoutDashboard,
      isActive: currentTab === 'dashboard',
    },
    {
      label: 'Users',
      href: '/admin/users?tab=users',
      icon: Users,
      isActive: currentTab === 'users',
    },
    {
      label: 'Service Providers',
      href: '/admin/users?tab=service_approvals',
      icon: UserCheck,
      isActive: currentTab === 'service_approvals',
    },
    {
      label: 'Opportunities / Orders',
      href: '/admin/users?tab=opportunities',
      icon: Package,
      isActive: currentTab === 'opportunities',
    },
    {
      label: 'Categories',
      href: '/admin/users?tab=categories',
      icon: Layers,
      isActive: currentTab === 'categories',
    },
    {
      label: 'Verification Requirements',
      href: '/admin/users?tab=requirements',
      icon: FileCheck,
      isActive: currentTab === 'requirements',
    },
    {
      label: 'Order Workflows',
      href: '/admin/users?tab=workflows',
      icon: GitMerge,
      isActive: currentTab === 'workflows',
    },
    {
      label: 'Payments / Escrow',
      href: '/admin/users?tab=escrow',
      icon: CreditCard,
      isActive: currentTab === 'escrow',
    },
    {
      label: 'Reports',
      href: '/admin/users?tab=reports',
      icon: BarChart3,
      isActive: currentTab === 'reports',
    },
    {
      label: 'Settings',
      href: '/admin/users?tab=settings',
      icon: Settings,
      isActive: currentTab === 'settings',
    },
  ];

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col md:flex-row font-sans selection:bg-purple-500 selection:text-white">
      {/* Mobile Top Navbar with Hamburger Toggle */}
      <div className="md:hidden sticky top-0 z-40 bg-[#0d1322]/95 backdrop-blur-md border-b border-purple-500/20 px-4 py-3 flex items-center justify-between">
        <Link href="/admin/users" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="font-extrabold text-base text-white tracking-tight">Admin Console</span>
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

      {/* Mobile Slide-Out Drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-72 bg-[#0d1322] border-r border-purple-500/20 p-5 flex flex-col justify-between z-10">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <Link href="/admin/users" className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <span className="font-extrabold text-base text-white block leading-none">Admin Console</span>
                    <span className="text-[10px] text-purple-400 font-mono">DODO-Universe</span>
                  </div>
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
                <div className="p-3 rounded-2xl bg-purple-950/30 border border-purple-500/30 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400 font-bold">
                    {currentUser.full_name?.charAt(0) || 'A'}
                  </div>
                  <div className="overflow-hidden">
                    <div className="text-xs font-bold text-white truncate">{currentUser.full_name}</div>
                    <div className="text-[10px] text-purple-300 font-mono">ROLE: {currentUser.role || 'ADMIN'}</div>
                  </div>
                </div>
              )}

              <nav className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                        item.isActive
                          ? 'bg-purple-600 text-white font-bold shadow-lg shadow-purple-600/25'
                          : 'text-slate-400 hover:text-white hover:bg-slate-900/80'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </div>
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
                <span>Logout Admin</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Fixed Left Sidebar */}
      <aside
        className={`hidden md:flex flex-col justify-between fixed top-0 bottom-0 left-0 z-30 bg-[#0d1322] border-r border-purple-500/20 transition-all duration-300 ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Header & Logo */}
        <div className="p-5 space-y-6">
          <div className="flex items-center justify-between">
            <Link href="/admin/users" className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/30 shrink-0">
                <Shield className="w-5 h-5 text-white" />
              </div>
              {!collapsed && (
                <div>
                  <span className="font-extrabold text-base text-white tracking-tight block leading-none">Admin Console</span>
                  <span className="text-[10px] text-purple-400 font-bold uppercase tracking-widest block mt-0.5">Governance</span>
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

          {/* Admin Profile Summary */}
          {currentUser && !collapsed && (
            <div className="p-3 rounded-2xl bg-purple-950/20 border border-purple-500/30 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-300 font-bold text-sm shrink-0">
                {currentUser.full_name?.charAt(0) || 'A'}
              </div>
              <div className="overflow-hidden">
                <div className="text-xs font-bold text-white truncate">{currentUser.full_name}</div>
                <div className="text-[10px] text-purple-400 font-mono truncate">{currentUser.role || 'SUPER_ADMIN'}</div>
              </div>
            </div>
          )}

          {/* Navigation Items */}
          <nav className="space-y-1 max-h-[62vh] overflow-y-auto pr-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    item.isActive
                      ? 'bg-purple-600 text-white font-bold shadow-lg shadow-purple-600/25'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900/80'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4.5 h-4.5 shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Logout Footer */}
        <div className="p-5 border-t border-slate-800/80">
          <button
            type="button"
            onClick={handleLogout}
            title={collapsed ? 'Logout' : undefined}
            className="w-full px-3.5 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold flex items-center justify-center gap-3 transition-all"
          >
            <LogOut className="w-4.5 h-4.5 shrink-0" />
            {!collapsed && <span>Logout Admin</span>}
          </button>
        </div>
      </aside>

      {/* Main Admin View Container */}
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
