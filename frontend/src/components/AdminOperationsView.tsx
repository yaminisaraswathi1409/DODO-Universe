'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Users,
  Package,
  Truck,
  ShieldAlert,
  RefreshCw,
  Search,
  ExternalLink,
  MessageSquare,
  UserCheck,
  X,
  FileText,
  AlertOctagon,
  Eye,
} from 'lucide-react';
import {
  AdminDashboardMetrics,
  StuckOrderAlert,
  getAdminOperationsMetrics,
  getAdminStuckOrders,
  getAdminIncidents,
  actionAdminIncident,
  listUsers,
  suspendVendor,
  reactivateVendor,
  UserProfile,
} from '@/lib/api';

export default function AdminOperationsView() {
  const [activeSubTab, setActiveSubTab] = useState<'metrics' | 'stuck_orders' | 'incidents' | 'vendors'>('metrics');

  // Metrics State
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  // Stuck Orders State
  const [stuckOrders, setStuckOrders] = useState<StuckOrderAlert[]>([]);
  const [loadingStuckOrders, setLoadingStuckOrders] = useState(false);

  // Incidents State
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loadingIncidents, setLoadingIncidents] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<any | null>(null);
  const [incidentActionModal, setIncidentActionModal] = useState<'note' | 'resolve' | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resumeTransit, setResumeTransit] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');

  // Vendors Governance State
  const [vendorsList, setVendorsList] = useState<UserProfile[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [vendorSearch, setVendorSearch] = useState('');
  const [selectedVendorForSuspend, setSelectedVendorForSuspend] = useState<UserProfile | null>(null);
  const [suspensionReason, setSuspensionReason] = useState('');
  const [suspendingLoading, setSuspendingLoading] = useState(false);

  useEffect(() => {
    loadAllOperationsData();
  }, []);

  const loadAllOperationsData = async () => {
    loadMetrics();
    loadStuckOrders();
    loadIncidents();
    loadVendors();
  };

  const loadMetrics = async () => {
    setLoadingMetrics(true);
    try {
      const data = await getAdminOperationsMetrics();
      setMetrics(data);
    } catch {
      // keep state
    } finally {
      setLoadingMetrics(false);
    }
  };

  const loadStuckOrders = async () => {
    setLoadingStuckOrders(true);
    try {
      const data = await getAdminStuckOrders();
      setStuckOrders(data || []);
    } catch {
      // keep state
    } finally {
      setLoadingStuckOrders(false);
    }
  };

  const loadIncidents = async () => {
    setLoadingIncidents(true);
    try {
      const data = await getAdminIncidents();
      setIncidents(data || []);
    } catch {
      // keep state
    } finally {
      setLoadingIncidents(false);
    }
  };

  const loadVendors = async () => {
    setLoadingVendors(true);
    try {
      const allUsers = await listUsers();
      const vendors = allUsers.filter((u) => u.role === 'VENDOR' || u.role === 'TRANSPORT_PROVIDER');
      setVendorsList(vendors);
    } catch {
      // keep state
    } finally {
      setLoadingVendors(false);
    }
  };

  const handleAcknowledgeIncident = async (incidentId: string) => {
    setActionLoading(true);
    try {
      const ok = await actionAdminIncident(incidentId, { action: 'ACKNOWLEDGE' });
      if (ok) {
        setActionMessage('Incident acknowledged and assigned.');
        loadIncidents();
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddIncidentNote = async () => {
    if (!selectedIncident || !noteContent.trim()) return;
    setActionLoading(true);
    try {
      const ok = await actionAdminIncident(selectedIncident.id, {
        action: 'ADD_NOTE',
        note: noteContent,
      });
      if (ok) {
        setIncidentActionModal(null);
        setNoteContent('');
        loadIncidents();
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolveIncident = async () => {
    if (!selectedIncident || !resolutionNotes.trim()) return;
    setActionLoading(true);
    try {
      const ok = await actionAdminIncident(selectedIncident.id, {
        action: 'RESOLVE',
        resolution_notes: resolutionNotes,
        resume_transit: resumeTransit,
      });
      if (ok) {
        setIncidentActionModal(null);
        setResolutionNotes('');
        loadIncidents();
        loadStuckOrders();
        loadMetrics();
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuspendVendor = async () => {
    if (!selectedVendorForSuspend || !suspensionReason.trim()) return;
    setSuspendingLoading(true);
    try {
      const ok = await suspendVendor(selectedVendorForSuspend.id, suspensionReason);
      if (ok) {
        setSelectedVendorForSuspend(null);
        setSuspensionReason('');
        loadVendors();
        loadMetrics();
      }
    } finally {
      setSuspendingLoading(false);
    }
  };

  const handleReactivateVendor = async (vendorId: string) => {
    try {
      const ok = await reactivateVendor(vendorId, 'Administrative review restored account');
      if (ok) {
        loadVendors();
        loadMetrics();
      }
    } catch {
      // handle err
    }
  };

  const filteredVendors = vendorsList.filter((v) => {
    const q = vendorSearch.toLowerCase();
    return (
      v.full_name?.toLowerCase().includes(q) ||
      v.phone?.toLowerCase().includes(q) ||
      v.id?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase bg-slate-900 text-white tracking-wider">
              OPERATIONS & GOVERNANCE
            </span>
            <span className="text-xs text-slate-500 font-mono">PHASE 7 REAL-TIME</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 pt-1">
            Operations & Escalation Command
          </h1>
          <p className="text-xs text-slate-500">
            Real-time platform metrics, delayed order alerts, SOS emergency coordination, and vendor standing governance.
          </p>
        </div>

        <button
          onClick={loadAllOperationsData}
          className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs border border-slate-200 flex items-center gap-2 transition-all self-start sm:self-auto"
        >
          <RefreshCw className="w-4 h-4 text-slate-800" />
          <span>Refresh All</span>
        </button>
      </div>

      {/* Sub-Tabs Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        {[
          { id: 'metrics', label: 'Platform Metrics', icon: Activity },
          {
            id: 'stuck_orders',
            label: `Stuck Orders (${stuckOrders.length})`,
            icon: Clock,
            badge: stuckOrders.length > 0,
          },
          {
            id: 'incidents',
            label: `SOS Incidents (${incidents.filter((i) => i.status !== 'RESOLVED').length})`,
            icon: ShieldAlert,
            badge: incidents.filter((i) => i.status !== 'RESOLVED').length > 0,
          },
          { id: 'vendors', label: 'Vendor Governance', icon: UserCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all ${
                isActive
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              )}
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* 1. PLATFORM METRICS SUB-TAB                                               */}
      {/* ========================================================================= */}
      {activeSubTab === 'metrics' && (
        <div className="space-y-6">
          {loadingMetrics ? (
            <div className="p-12 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-slate-900" />
              <span>Gathering live operational metrics...</span>
            </div>
          ) : (
            <>
              {/* Metric Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
                    <Users className="w-4 h-4" />
                  </div>
                  <span className="text-2xl font-extrabold text-slate-900 block">
                    {metrics?.active_users_count ?? 0}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">
                    Customers
                  </span>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
                    <Package className="w-4 h-4" />
                  </div>
                  <span className="text-2xl font-extrabold text-slate-900 block">
                    {metrics?.active_vendors_count ?? 0}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">
                    Active Vendors
                  </span>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
                    <Truck className="w-4 h-4" />
                  </div>
                  <span className="text-2xl font-extrabold text-slate-900 block">
                    {metrics?.active_drivers_count ?? 0}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">
                    Drivers & Transport
                  </span>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center">
                    <Clock className="w-4 h-4" />
                  </div>
                  <span className="text-2xl font-extrabold text-amber-900 block">
                    {metrics?.stuck_orders_count ?? 0}
                  </span>
                  <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide block">
                    Stuck Orders
                  </span>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
                  <div className="w-9 h-9 rounded-xl bg-red-50 text-red-700 flex items-center justify-center">
                    <AlertOctagon className="w-4 h-4" />
                  </div>
                  <span className="text-2xl font-extrabold text-red-900 block">
                    {metrics?.active_incidents_count ?? 0}
                  </span>
                  <span className="text-[11px] font-semibold text-red-700 uppercase tracking-wide block">
                    Active SOS
                  </span>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                    <FileText className="w-4 h-4" />
                  </div>
                  <span className="text-2xl font-extrabold text-slate-900 block">
                    {metrics?.pending_catalog_approvals ?? 0}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">
                    Pending Catalog
                  </span>
                </div>
              </div>

              {/* Order Status Distribution */}
              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Live Opportunity & Order States
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {metrics?.orders_by_status &&
                    Object.entries(metrics.orders_by_status).map(([st, cnt]) => (
                      <div
                        key={st}
                        className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1"
                      >
                        <span className="text-xs font-bold text-slate-700 block truncate">
                          {st}
                        </span>
                        <span className="text-xl font-extrabold text-slate-900 block">
                          {cnt}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. STUCK ORDERS MONITOR SUB-TAB                                           */}
      {/* ========================================================================= */}
      {activeSubTab === 'stuck_orders' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold">Inactivity & Delay Threshold Policy</span>
              <p className="text-[11px] text-amber-800">
                Orders delayed beyond stage thresholds generate operational warnings. In accordance with platform governance,
                delayed orders require manual intervention and are never cancelled automatically without administrative review.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
            {loadingStuckOrders ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                Scanning active orders for delay thresholds...
              </div>
            ) : stuckOrders.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                <h4 className="text-sm font-bold text-slate-900">All Order Lifecycles On Schedule</h4>
                <p className="text-xs text-slate-500">
                  No orders have exceeded stage delay thresholds at this time.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-extrabold uppercase">
                    <tr>
                      <th className="p-4">Order / Title</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Vendor</th>
                      <th className="p-4">Customer</th>
                      <th className="p-4">Elapsed / Threshold</th>
                      <th className="p-4">Severity</th>
                      <th className="p-4">Recommendation</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stuckOrders.map((alert) => (
                      <tr key={alert.opportunity_id} className="hover:bg-slate-50/50">
                        <td className="p-4">
                          <span className="font-bold text-slate-900 block truncate max-w-[180px]">
                            {alert.title}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {alert.opportunity_id.substring(0, 8)}...
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="px-2.5 py-1 rounded-full font-bold text-[10px] bg-slate-100 text-slate-800 border border-slate-200">
                            {alert.status}
                          </span>
                        </td>
                        <td className="p-4 font-medium text-slate-700">{alert.vendor_name}</td>
                        <td className="p-4 font-medium text-slate-700">{alert.customer_name}</td>
                        <td className="p-4">
                          <span className="font-bold text-slate-900">
                            {alert.duration_hours.toFixed(1)} hrs
                          </span>
                          <span className="text-slate-400 block text-[10px]">
                            limit: {alert.threshold_hours} hrs
                          </span>
                        </td>
                        <td className="p-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-full font-extrabold text-[10px] uppercase ${
                              alert.severity === 'CRITICAL'
                                ? 'bg-red-100 text-red-800 border border-red-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {alert.severity}
                          </span>
                        </td>
                        <td className="p-4 text-slate-600 max-w-[220px]">
                          {alert.recommendation}
                        </td>
                        <td className="p-4 text-right">
                          <Link
                            href={`/order/${alert.opportunity_id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white font-semibold text-xs hover:bg-black transition-all"
                          >
                            <span>Inspect</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. ACTIVE SOS INCIDENTS SUB-TAB                                           */}
      {/* ========================================================================= */}
      {activeSubTab === 'incidents' && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
            {loadingIncidents ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                Loading emergency incidents...
              </div>
            ) : incidents.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                <h4 className="text-sm font-bold text-slate-900">No Active Emergency Incidents</h4>
                <p className="text-xs text-slate-500">
                  All logistics transports are operating normally without SOS alerts.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {incidents.map((inc) => {
                  const isResolved = inc.status === 'RESOLVED';
                  return (
                    <div key={inc.id} className="p-6 space-y-4 hover:bg-slate-50/50">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2.5 py-0.5 rounded-full font-extrabold text-[10px] uppercase ${
                                isResolved
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-red-100 text-red-800 border border-red-200 animate-pulse'
                              }`}
                            >
                              {inc.status}
                            </span>
                            <span className="font-extrabold text-sm text-slate-900">
                              {inc.incident_type}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600">{inc.description}</p>
                        </div>

                        {/* Actions */}
                        {!isResolved && (
                          <div className="flex items-center gap-2 shrink-0">
                            {!inc.handler_id && (
                              <button
                                onClick={() => handleAcknowledgeIncident(inc.id)}
                                disabled={actionLoading}
                                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold transition-all"
                              >
                                Acknowledge
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setSelectedIncident(inc);
                                setIncidentActionModal('note');
                              }}
                              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border border-slate-200 flex items-center gap-1.5 transition-all"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>Add Note</span>
                            </button>
                            <button
                              onClick={() => {
                                setSelectedIncident(inc);
                                setIncidentActionModal('resolve');
                              }}
                              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all"
                            >
                              Resolve Incident
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Details Box */}
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">
                            Reporter
                          </span>
                          <span className="font-semibold text-slate-900">{inc.reporter_name}</span>
                          <span className="text-slate-500 block text-[11px]">{inc.reporter_phone}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">
                            Location
                          </span>
                          <span className="font-medium text-slate-800 block truncate">
                            {inc.address_text || `${inc.latitude.toFixed(4)}, ${inc.longitude.toFixed(4)}`}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">
                            Handler
                          </span>
                          <span className="font-semibold text-slate-900">
                            {inc.handler_name || 'Unassigned'}
                          </span>
                        </div>
                      </div>

                      {/* Internal Notes */}
                      {inc.internal_notes && Array.isArray(inc.internal_notes) && inc.internal_notes.length > 0 && (
                        <div className="space-y-1.5 pl-2 border-l-2 border-slate-200">
                          <span className="text-[10px] font-bold uppercase text-slate-400">
                            Internal Operations Notes
                          </span>
                          {inc.internal_notes.map((n: any, idx: number) => (
                            <p key={idx} className="text-xs text-slate-700">
                              <span className="font-semibold text-slate-900">{n.author_name}:</span> {n.note}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. VENDOR GOVERNANCE SUB-TAB                                              */}
      {/* ========================================================================= */}
      {activeSubTab === 'vendors' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center gap-3">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search vendor by name, phone or ID..."
              value={vendorSearch}
              onChange={(e) => setVendorSearch(e.target.value)}
              className="w-full text-xs text-slate-900 focus:outline-none"
            />
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
            {loadingVendors ? (
              <div className="p-12 text-center text-slate-500 text-xs">Loading vendors...</div>
            ) : filteredVendors.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs">No vendors found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-extrabold uppercase">
                    <tr>
                      <th className="p-4">Vendor</th>
                      <th className="p-4">Role</th>
                      <th className="p-4">Phone</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Suspension Details</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredVendors.map((v) => {
                      const isSuspended = v.is_suspended || v.status === 'SUSPENDED';
                      return (
                        <tr key={v.id} className="hover:bg-slate-50/50">
                          <td className="p-4 font-bold text-slate-900">{v.full_name}</td>
                          <td className="p-4 text-slate-500">{v.role}</td>
                          <td className="p-4 text-slate-600">{v.phone}</td>
                          <td className="p-4">
                            <span
                              className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase ${
                                isSuspended
                                  ? 'bg-red-100 text-red-800 border border-red-200'
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              {isSuspended ? 'SUSPENDED' : 'ACTIVE'}
                            </span>
                          </td>
                          <td className="p-4 text-slate-600 max-w-[200px]">
                            {isSuspended ? v.suspension_reason || 'Administrative suspension' : '-'}
                          </td>
                          <td className="p-4 text-right">
                            {isSuspended ? (
                              <button
                                onClick={() => handleReactivateVendor(v.id)}
                                className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-all"
                              >
                                Reactivate
                              </button>
                            ) : (
                              <button
                                onClick={() => setSelectedVendorForSuspend(v)}
                                className="px-3 py-1.5 rounded-xl bg-red-600 text-white font-bold text-xs hover:bg-red-700 transition-all"
                              >
                                Suspend Vendor
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUSPENSION MODAL (Mandatory Reason Required)                              */}
      {/* ========================================================================= */}
      {selectedVendorForSuspend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 border border-slate-200 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-base text-slate-900">
                Suspend Vendor: {selectedVendorForSuspend.full_name}
              </h3>
              <button
                onClick={() => setSelectedVendorForSuspend(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Suspended vendors cannot receive new orders or create catalog offerings. Pre-existing confirmed orders remain active and will be fulfilled.
            </p>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-800">
                Mandatory Governance Reason *
              </label>
              <textarea
                rows={3}
                placeholder="Explain the specific reason for suspension..."
                value={suspensionReason}
                onChange={(e) => setSuspensionReason(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-black focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setSelectedVendorForSuspend(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                disabled={!suspensionReason.trim() || suspendingLoading}
                onClick={handleSuspendVendor}
                className="px-5 py-2 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50 transition-all"
              >
                {suspendingLoading ? 'Suspending...' : 'Confirm Suspension'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* INCIDENT NOTE / RESOLVE MODAL                                             */}
      {/* ========================================================================= */}
      {incidentActionModal && selectedIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 border border-slate-200 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-base text-slate-900">
                {incidentActionModal === 'note' ? 'Add Internal Operations Note' : 'Resolve SOS Incident'}
              </h3>
              <button
                onClick={() => setIncidentActionModal(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {incidentActionModal === 'note' ? (
              <div className="space-y-3">
                <textarea
                  rows={4}
                  placeholder="Record investigation notes, roadside assistance contact, or driver communications..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-black focus:outline-none"
                />
                <button
                  disabled={!noteContent.trim() || actionLoading}
                  onClick={handleAddIncidentNote}
                  className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-black transition-all"
                >
                  Save Note
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-800">Resolution Summary *</label>
                  <textarea
                    rows={3}
                    placeholder="Details on repair completion, roadside help, or replacement vehicle dispatch..."
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-black focus:outline-none"
                  />
                </div>

                <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={resumeTransit}
                    onChange={(e) => setResumeTransit(e.target.checked)}
                    className="w-4 h-4 rounded text-black focus:ring-black border-slate-300"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Resume Transit Immediately</span>
                    <span className="text-[11px] text-slate-500">Restores order status from INCIDENT_SUSPENDED to IN_TRANSIT</span>
                  </div>
                </label>

                <button
                  disabled={!resolutionNotes.trim() || actionLoading}
                  onClick={handleResolveIncident}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-all"
                >
                  {actionLoading ? 'Resolving...' : 'Confirm Resolution'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

