'use client';

import React, { useState, useEffect } from 'react';
import {
  UserProfile,
  VendorCategoryApproval,
  getAdminCategoryApprovals,
  reviewCategoryApproval,
} from '@/lib/api';
import {
  ShieldAlert,
  CheckCircle,
  AlertTriangle,
  XCircle,
  PauseCircle,
  Clock,
  RefreshCw,
  X,
  History,
  FileCheck,
  User,
  Package,
  Layers,
  ChevronDown,
  ChevronUp,
  MessageSquare,
} from 'lucide-react';

interface AdminCategoryReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onRefresh?: () => void;
}

export default function AdminCategoryReviewModal({
  isOpen,
  onClose,
  currentUser,
  onRefresh,
}: AdminCategoryReviewModalProps) {
  const [approvals, setApprovals] = useState<VendorCategoryApproval[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Review Action Modal/Drawer State
  const [reviewingApp, setReviewingApp] = useState<VendorCategoryApproval | null>(null);
  const [reviewAction, setReviewAction] = useState<'APPROVE' | 'REJECT' | 'REQUEST_CHANGES' | 'SUSPEND' | null>(null);
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [submittingReview, setSubmittingReview] = useState<boolean>(false);

  // History expanded state
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const fetchApprovals = async () => {
    setLoading(true);
    setError(null);
    try {
      const filter = statusFilter === 'ALL' ? undefined : statusFilter;
      const data = await getAdminCategoryApprovals(filter);
      setApprovals(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch category approval applications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchApprovals();
    }
  }, [isOpen, statusFilter]);

  const handleStartReview = (app: VendorCategoryApproval, action: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES' | 'SUSPEND') => {
    setReviewingApp(app);
    setReviewAction(action);
    setReviewNotes('');
  };

  const handleExecuteReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingApp || !reviewAction) return;

    if (reviewAction === 'REQUEST_CHANGES' && !reviewNotes.trim()) {
      setError('Please provide feedback explaining what changes are requested.');
      return;
    }
    if (reviewAction === 'REJECT' && !reviewNotes.trim()) {
      setError('Please provide a reason for rejection.');
      return;
    }

    setSubmittingReview(true);
    setError(null);
    try {
      const adminId = currentUser?.id || '00000000-0000-0000-0000-000000000001';
      await reviewCategoryApproval(reviewingApp.id, {
        admin_id: adminId,
        action: reviewAction,
        notes: reviewNotes.trim(),
      });

      setSuccessMsg(`Application marked as ${reviewAction} successfully.`);
      setTimeout(() => setSuccessMsg(null), 3000);
      setReviewingApp(null);
      setReviewAction(null);
      await fetchApprovals();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to review category application');
    } finally {
      setSubmittingReview(false);
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span>Active</span>
          </span>
        );
      case 'PENDING_APPROVAL':
        return (
          <span className="px-2.5 py-1 rounded-full bg-sky-50 text-sky-800 border border-sky-200 text-[11px] font-bold flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-sky-600" />
            <span>Pending Review</span>
          </span>
        );
      case 'CHANGES_REQUESTED':
        return (
          <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-300 text-[11px] font-bold flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>Changes Requested</span>
          </span>
        );
      case 'REJECTED':
        return (
          <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200 text-[11px] font-bold flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            <span>Rejected</span>
          </span>
        );
      case 'SUSPENDED':
        return (
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-300 text-[11px] font-bold flex items-center gap-1">
            <PauseCircle className="w-3.5 h-3.5 text-slate-600" />
            <span>Suspended</span>
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">
            {status}
          </span>
        );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-black text-white flex items-center justify-center shadow-sm">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">
                Admin Vendor Category Governance Review
              </h2>
              <p className="text-xs text-slate-500">
                Approve, reject, request changes, or suspend category authorizations for vendors.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchApprovals}
              className="p-2 rounded-xl text-slate-600 hover:bg-slate-200 transition-colors"
              title="Refresh applications"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="px-6 py-3 border-b border-slate-100 bg-white flex items-center gap-2 overflow-x-auto">
          {['ALL', 'PENDING_APPROVAL', 'CHANGES_REQUESTED', 'ACTIVE', 'REJECTED', 'SUSPENDED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                statusFilter === st
                  ? 'bg-black text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st === 'ALL' ? 'All Applications' : st.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Alerts */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Review Action Drawer */}
        {reviewingApp && reviewAction && (
          <div className="mx-6 mt-4 p-5 rounded-3xl bg-slate-50 border border-slate-300 space-y-4 shadow-inner">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-black" />
                <h3 className="font-extrabold text-sm text-slate-900">
                  {reviewAction === 'APPROVE' && 'Confirm Approval'}
                  {reviewAction === 'REQUEST_CHANGES' && 'Request Changes from Vendor'}
                  {reviewAction === 'REJECT' && 'Reject Category Application'}
                  {reviewAction === 'SUSPEND' && 'Suspend Vendor Category Authorization'}
                  : <span className="underline">{reviewingApp.category?.name}</span> for {reviewingApp.vendor?.full_name || 'Vendor'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setReviewingApp(null);
                  setReviewAction(null);
                }}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleExecuteReview} className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  {reviewAction === 'APPROVE' && 'Approval Note (Optional)'}
                  {reviewAction === 'REQUEST_CHANGES' && 'Feedback & Required Changes (Mandatory) *'}
                  {reviewAction === 'REJECT' && 'Reason for Rejection (Mandatory) *'}
                  {reviewAction === 'SUSPEND' && 'Reason for Suspension *'}
                </label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={3}
                  required={reviewAction === 'REQUEST_CHANGES' || reviewAction === 'REJECT'}
                  placeholder={
                    reviewAction === 'REQUEST_CHANGES'
                      ? 'Specify what documents or asset updates the vendor needs to submit...'
                      : reviewAction === 'REJECT'
                      ? 'State the compliance or qualification grounds for rejection...'
                      : 'Add notes for the audit trail...'
                  }
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-black font-medium"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setReviewingApp(null);
                    setReviewAction(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReview}
                  className={`px-5 py-2 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50 ${
                    reviewAction === 'APPROVE'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : reviewAction === 'REQUEST_CHANGES'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : reviewAction === 'REJECT'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-slate-800 hover:bg-slate-900'
                  }`}
                >
                  {submittingReview ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileCheck className="w-3.5 h-3.5" />}
                  <span>Confirm {reviewAction.replace('_', ' ')}</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Content List */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {loading ? (
            <div className="py-16 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
              <span>Loading category applications...</span>
            </div>
          ) : approvals.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-xs">
              No vendor category applications matching status filter: {statusFilter}.
            </div>
          ) : (
            <div className="space-y-4">
              {approvals.map((app) => {
                const isHistoryOpen = expandedHistoryId === app.id;

                return (
                  <div
                    key={app.id}
                    className="p-5 rounded-3xl bg-white border border-slate-200 hover:border-slate-300 transition-all shadow-sm space-y-3"
                  >
                    {/* Top Row: Vendor & Category Header */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-slate-600" />
                          <h4 className="font-extrabold text-sm text-slate-900">
                            {app.vendor?.full_name || 'Vendor Profile'}
                          </h4>
                          <span className="text-[11px] text-slate-400 font-mono">
                            ({app.vendor?.phone || app.vendor_id})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <Layers className="w-3.5 h-3.5 text-black" />
                          <span className="font-bold text-slate-800">{app.category?.name || app.category_id}</span>
                          <span className="text-[10px] text-slate-400 font-mono">({app.category?.slug})</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {renderStatusBadge(app.status)}
                      </div>
                    </div>

                    {/* Middle Row: Asset Details */}
                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 grid md:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                          Primary Canonical Asset
                        </span>
                        <div className="font-bold text-slate-800 mt-0.5">
                          {app.canonical_asset?.title || app.canonical_asset_id}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          Type: {app.canonical_asset?.asset_type || 'N/A'} &bull; Status: {app.canonical_asset?.status || 'N/A'}
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                          Secondary Assets (Preserved)
                        </span>
                        <div className="font-medium text-slate-700 mt-0.5">
                          {app.secondary_asset_ids && app.secondary_asset_ids.length > 0 ? (
                            <span>{app.secondary_asset_ids.length} linked assets</span>
                          ) : (
                            <span className="text-slate-400">None specified</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Display feedback if changes requested or rejected */}
                    {app.change_request_notes && (
                      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                        <span className="font-bold">Latest Change Request Notes: </span>
                        {app.change_request_notes}
                      </div>
                    )}
                    {app.rejection_reason && (
                      <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900">
                        <span className="font-bold">Rejection Reason: </span>
                        {app.rejection_reason}
                      </div>
                    )}

                    {/* Action Bar */}
                    <div className="pt-2 flex items-center justify-between border-t border-slate-100 text-xs">
                      <button
                        onClick={() => setExpandedHistoryId(isHistoryOpen ? null : app.id)}
                        className="flex items-center gap-1.5 text-slate-500 hover:text-black font-semibold text-[11px] transition-colors"
                      >
                        <History className="w-3.5 h-3.5" />
                        <span>Audit Log ({app.history?.length || 0})</span>
                        {isHistoryOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>

                      <div className="flex items-center gap-2">
                        {app.status !== 'ACTIVE' && (
                          <button
                            onClick={() => handleStartReview(app, 'APPROVE')}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition-colors"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>Approve</span>
                          </button>
                        )}

                        {app.status !== 'CHANGES_REQUESTED' && (
                          <button
                            onClick={() => handleStartReview(app, 'REQUEST_CHANGES')}
                            className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition-colors"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Request Changes</span>
                          </button>
                        )}

                        {app.status !== 'REJECTED' && (
                          <button
                            onClick={() => handleStartReview(app, 'REJECT')}
                            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        )}

                        {app.status === 'ACTIVE' && (
                          <button
                            onClick={() => handleStartReview(app, 'SUSPEND')}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition-colors"
                          >
                            <PauseCircle className="w-3.5 h-3.5" />
                            <span>Suspend</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Audit History Drawer */}
                    {isHistoryOpen && (
                      <div className="mt-2 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                        <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                          <History className="w-3 h-3" />
                          <span>Audit Trail History</span>
                        </div>
                        {(!app.history || app.history.length === 0) ? (
                          <p className="text-[11px] text-slate-400">No recorded audit history entries.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {app.history.map((entry, idx) => (
                              <div
                                key={entry.id || idx}
                                className="p-2 rounded-xl bg-white border border-slate-200 text-xs flex items-center justify-between"
                              >
                                <div>
                                  <span className="font-bold text-slate-800">{entry.action}</span>
                                  <span className="text-[10px] text-slate-400 ml-2 font-mono">
                                    {entry.previous_status} &rarr; {entry.new_status}
                                  </span>
                                  {entry.notes && (
                                    <p className="text-[11px] text-slate-600 mt-0.5">{entry.notes}</p>
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-400 font-mono shrink-0">
                                  {new Date(entry.created_at).toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-[11px] text-slate-500">
          <span>
            Vendor category governance enforces that vendors must hold an ACTIVE approval before publishing catalog items.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
