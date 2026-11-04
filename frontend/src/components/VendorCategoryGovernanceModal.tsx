'use client';

import React, { useState, useEffect } from 'react';
import {
  UserProfile,
  Category,
  UserServiceAsset,
  VendorCategoryApproval,
  getVendorCategoryApprovals,
  applyForCategory,
  resubmitCategoryApplication,
} from '@/lib/api';
import {
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  Clock,
  XCircle,
  PauseCircle,
  Plus,
  RefreshCw,
  X,
  History,
  FileText,
  Layers,
  ChevronDown,
  ChevronUp,
  Send,
  Edit3,
} from 'lucide-react';

interface VendorCategoryGovernanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  categories: Category[];
  userAssets: UserServiceAsset[];
  onRefresh?: () => void;
}

export default function VendorCategoryGovernanceModal({
  isOpen,
  onClose,
  currentUser,
  categories,
  userAssets,
  onRefresh,
}: VendorCategoryGovernanceModalProps) {
  const [approvals, setApprovals] = useState<VendorCategoryApproval[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // New Application Form State
  const [showApplyForm, setShowApplyForm] = useState<boolean>(false);
  const [selectedCatId, setSelectedCatId] = useState<string>('');
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [selectedSecondaryAssetIds, setSelectedSecondaryAssetIds] = useState<string[]>([]);
  const [applyNotes, setApplyNotes] = useState<string>('');
  const [submittingApply, setSubmittingApply] = useState<boolean>(false);

  // Resubmission State for CHANGES_REQUESTED
  const [resubmittingApp, setResubmittingApp] = useState<VendorCategoryApproval | null>(null);
  const [resubmitAssetId, setResubmitAssetId] = useState<string>('');
  const [resubmitSecondaryAssetIds, setResubmitSecondaryAssetIds] = useState<string[]>([]);
  const [resubmitNotes, setResubmitNotes] = useState<string>('');
  const [submittingResubmit, setSubmittingResubmit] = useState<boolean>(false);

  // History expanded state
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const fetchApprovals = async () => {
    if (!currentUser) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getVendorCategoryApprovals(currentUser.id);
      setApprovals(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch category approvals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && currentUser) {
      fetchApprovals();
    }
  }, [isOpen, currentUser]);

  // Leaf categories only (cannot apply for grouping categories)
  const selectableCategories = categories.filter((c) => c.is_selectable !== false);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!selectedCatId) {
      setError('Please select a leaf category');
      return;
    }
    if (!selectedAssetId) {
      setError('Please select a verified asset belonging to your account');
      return;
    }

    setSubmittingApply(true);
    setError(null);
    try {
      await applyForCategory({
        vendor_id: currentUser.id,
        category_id: selectedCatId,
        asset_id: selectedAssetId,
        secondary_asset_ids: selectedSecondaryAssetIds,
        notes: applyNotes,
      });

      setSuccessMsg('Category application submitted successfully for Admin review.');
      setTimeout(() => setSuccessMsg(null), 4000);
      setShowApplyForm(false);
      setSelectedCatId('');
      setSelectedAssetId('');
      setSelectedSecondaryAssetIds([]);
      setApplyNotes('');
      await fetchApprovals();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to submit application');
    } finally {
      setSubmittingApply(false);
    }
  };

  const handleStartResubmit = (app: VendorCategoryApproval) => {
    setResubmittingApp(app);
    setResubmitAssetId(app.canonical_asset_id);
    setResubmitSecondaryAssetIds(app.secondary_asset_ids || []);
    setResubmitNotes('');
  };

  const handleResubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !resubmittingApp) return;
    if (!resubmitAssetId) {
      setError('Please select a canonical asset for resubmission');
      return;
    }

    setSubmittingResubmit(true);
    setError(null);
    try {
      await resubmitCategoryApplication(resubmittingApp.id, {
        vendor_id: currentUser.id,
        asset_id: resubmitAssetId,
        secondary_asset_ids: resubmitSecondaryAssetIds,
        notes: resubmitNotes,
      });

      setSuccessMsg('Category application resubmitted successfully for Admin re-evaluation.');
      setTimeout(() => setSuccessMsg(null), 4000);
      setResubmittingApp(null);
      await fetchApprovals();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to resubmit application');
    } finally {
      setSubmittingResubmit(false);
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span>Active &amp; Approved</span>
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
          <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-300 text-[11px] font-bold flex items-center gap-1 animate-pulse">
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
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-black text-white flex items-center justify-center shadow-sm">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">
                Vendor Category Governance &amp; Approvals
              </h2>
              <p className="text-xs text-slate-500">
                Manage your authorized business categories, view approval history, and resubmit change requests.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!showApplyForm && !resubmittingApp && (
              <button
                onClick={() => setShowApplyForm(true)}
                className="px-3 py-1.5 rounded-xl bg-black hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Apply for Category</span>
              </button>
            )}
            <button
              onClick={fetchApprovals}
              className="p-2 rounded-xl text-slate-600 hover:bg-slate-200 transition-colors"
              title="Refresh"
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

        {/* Main Content Area */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {/* New Application Form Drawer */}
          {showApplyForm && (
            <div className="p-5 rounded-3xl bg-slate-50 border border-slate-300 space-y-4 shadow-inner">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-black" />
                  <h3 className="font-extrabold text-sm text-slate-900">
                    Apply for Platform Category Authorization
                  </h3>
                </div>
                <button
                  onClick={() => setShowApplyForm(false)}
                  className="text-slate-400 hover:text-slate-600 text-xs"
                >
                  Cancel
                </button>
              </div>

              <form onSubmit={handleApply} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Category Selection */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                      Target Leaf Category <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={selectedCatId}
                      onChange={(e) => setSelectedCatId(e.target.value)}
                      required
                      className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-xs font-medium text-slate-900 focus:outline-none focus:border-black"
                    >
                      <option value="">Select a category...</option>
                      {selectableCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.slug})
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Only verified leaf categories can be selected for vendor authorization.
                    </p>
                  </div>

                  {/* Canonical Asset Selection */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                      Primary Canonical Asset <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={selectedAssetId}
                      onChange={(e) => setSelectedAssetId(e.target.value)}
                      required
                      className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-xs font-medium text-slate-900 focus:outline-none focus:border-black"
                    >
                      <option value="">Select an asset belonging to you...</option>
                      {userAssets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.title} ({a.asset_type}) — Status: {a.status}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Must be a valid asset registered under your vendor account.
                    </p>
                  </div>
                </div>

                {/* Secondary Assets Multi-selection */}
                {userAssets.length > 1 && (
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                      Secondary Assets (Optional — Preserved safely)
                    </label>
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-white rounded-xl border border-slate-200">
                      {userAssets
                        .filter((a) => a.id !== selectedAssetId)
                        .map((a) => {
                          const isChecked = selectedSecondaryAssetIds.includes(a.id);
                          return (
                            <label
                              key={a.id}
                              className={`px-3 py-1.5 rounded-lg border text-xs flex items-center gap-2 cursor-pointer transition-colors ${
                                isChecked
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedSecondaryAssetIds((prev) => [...prev, a.id]);
                                  } else {
                                    setSelectedSecondaryAssetIds((prev) => prev.filter((id) => id !== a.id));
                                  }
                                }}
                                className="w-3.5 h-3.5 rounded text-black"
                              />
                              <span>{a.title}</span>
                            </label>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Application Notes */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Application Notes / Experience Details
                  </label>
                  <textarea
                    value={applyNotes}
                    onChange={(e) => setApplyNotes(e.target.value)}
                    rows={2}
                    placeholder="Provide details about your experience, equipment, or service capacity..."
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-black"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowApplyForm(false)}
                    className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingApply}
                    className="px-5 py-2 rounded-xl bg-black hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50"
                  >
                    {submittingApply ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>Submit Application</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Resubmission Drawer for CHANGES_REQUESTED */}
          {resubmittingApp && (
            <div className="p-5 rounded-3xl bg-amber-50/70 border border-amber-300 space-y-4 shadow-inner">
              <div className="flex items-center justify-between border-b border-amber-200 pb-3">
                <div className="flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-amber-800" />
                  <h3 className="font-extrabold text-sm text-amber-950">
                    Resubmit Application: {resubmittingApp.category?.name || 'Category'}
                  </h3>
                </div>
                <button
                  onClick={() => setResubmittingApp(null)}
                  className="text-slate-400 hover:text-slate-600 text-xs"
                >
                  Cancel
                </button>
              </div>

              {/* Display Admin's feedback */}
              {resubmittingApp.change_request_notes && (
                <div className="p-3.5 rounded-2xl bg-amber-100 border border-amber-300 text-xs text-amber-950 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-900">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Admin Feedback / Changes Requested:</span>
                  </div>
                  <p className="font-medium pl-5">{resubmittingApp.change_request_notes}</p>
                </div>
              )}

              <form onSubmit={handleResubmit} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Canonical Asset Selection */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                      Updated Primary Canonical Asset <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={resubmitAssetId}
                      onChange={(e) => setResubmitAssetId(e.target.value)}
                      required
                      className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-xs font-medium text-slate-900 focus:outline-none focus:border-amber-600"
                    >
                      <option value="">Select an asset belonging to you...</option>
                      {userAssets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.title} ({a.asset_type}) — Status: {a.status}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Resubmission Response Notes */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                      Your Response / Notes to Admin
                    </label>
                    <input
                      type="text"
                      value={resubmitNotes}
                      onChange={(e) => setResubmitNotes(e.target.value)}
                      placeholder="Explain how you addressed the requested changes..."
                      className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-600"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setResubmittingApp(null)}
                    className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingResubmit}
                    className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50"
                  >
                    {submittingResubmit ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>Resubmit Application</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Existing Approvals List */}
          {loading ? (
            <div className="py-16 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
              <span>Loading your category authorizations...</span>
            </div>
          ) : approvals.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-xs space-y-3">
              <Layers className="w-8 h-8 text-slate-300 mx-auto" />
              <p>You haven&apos;t submitted any category authorization applications yet.</p>
              <button
                onClick={() => setShowApplyForm(true)}
                className="px-4 py-2 rounded-xl bg-black text-white font-bold text-xs hover:bg-slate-800 transition-colors shadow-sm"
              >
                Apply for Your First Category
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {approvals.map((app) => {
                const isChangesRequested = app.status === 'CHANGES_REQUESTED';
                const isHistoryOpen = expandedHistoryId === app.id;

                return (
                  <div
                    key={app.id}
                    className={`p-4 rounded-3xl border transition-all ${
                      isChangesRequested
                        ? 'bg-amber-50/40 border-amber-300 shadow-sm'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {/* Top Row: Category Name & Badges */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-0.5 truncate">
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-sm text-slate-900 truncate">
                            {app.category?.name || 'Category'}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-mono">
                            slug: {app.category?.slug}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Canonical Asset: <span className="font-semibold text-slate-800">{app.canonical_asset?.title || app.canonical_asset_id}</span>
                          {app.secondary_asset_ids && app.secondary_asset_ids.length > 0 && (
                            <span className="ml-2 font-mono text-[10px] text-slate-500">
                              (+{app.secondary_asset_ids.length} secondary assets)
                            </span>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {renderStatusBadge(app.status)}
                        {isChangesRequested && (
                          <button
                            onClick={() => handleStartResubmit(app)}
                            className="px-3 py-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold flex items-center gap-1 shadow-sm transition-colors"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit &amp; Resubmit</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Prominent Warning Box if Changes Requested */}
                    {isChangesRequested && app.change_request_notes && (
                      <div className="mt-3 p-3 rounded-2xl bg-amber-100 border border-amber-300 text-xs text-amber-950 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold text-amber-900">Action Required — Changes Requested:</div>
                          <p className="mt-0.5 font-medium">{app.change_request_notes}</p>
                        </div>
                      </div>
                    )}

                    {/* Rejection Note */}
                    {app.status === 'REJECTED' && app.rejection_reason && (
                      <div className="mt-3 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                        <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold">Rejection Reason:</div>
                          <p className="mt-0.5">{app.rejection_reason}</p>
                        </div>
                      </div>
                    )}

                    {/* Bottom Row: Audit History Toggle */}
                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                      <div>
                        Submitted on: {new Date(app.created_at).toLocaleDateString()}
                        {app.approved_at && (
                          <span className="ml-2 text-emerald-600 font-semibold">
                            &bull; Approved: {new Date(app.approved_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => setExpandedHistoryId(isHistoryOpen ? null : app.id)}
                        className="flex items-center gap-1 text-slate-600 hover:text-black font-semibold transition-colors"
                      >
                        <History className="w-3.5 h-3.5" />
                        <span>Audit Log ({app.history?.length || 0})</span>
                        {isHistoryOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {/* Audit History Drawer */}
                    {isHistoryOpen && (
                      <div className="mt-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                        <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                          <History className="w-3 h-3" />
                          <span>Complete Decision &amp; Submission History</span>
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
            Only approved categories allow publishing marketplace catalog items and fulfilling opportunities.
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
