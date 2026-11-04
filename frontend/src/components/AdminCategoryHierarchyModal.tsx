'use client';

import React, { useState, useEffect } from 'react';
import {
  Category,
  getCategoryHierarchyTree,
  updateCategoryParent,
  toggleCategorySelectable,
} from '@/lib/api';
import {
  FolderTree,
  Folder,
  Tag,
  ChevronRight,
  ChevronDown,
  X,
  CheckCircle,
  AlertTriangle,
  Move,
  ToggleLeft,
  ToggleRight,
  Layers,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

interface AdminCategoryHierarchyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshCategories?: () => void;
}

export default function AdminCategoryHierarchyModal({
  isOpen,
  onClose,
  onRefreshCategories,
}: AdminCategoryHierarchyModalProps) {
  const [tree, setTree] = useState<Category[]>([]);
  const [allFlatCategories, setAllFlatCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Expanded nodes map
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Reparenting state
  const [reparentingCat, setReparentingCat] = useState<Category | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string>('ROOT');
  const [savingReparent, setSavingReparent] = useState<boolean>(false);

  const fetchTree = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCategoryHierarchyTree();
      setTree(data);

      // Flatten tree for parent selection dropdown
      const flat: Category[] = [];
      const flatten = (nodes: Category[]) => {
        for (const n of nodes) {
          flat.push(n);
          if (n.children && n.children.length > 0) {
            flatten(n.children);
          }
        }
      };
      flatten(data);
      setAllFlatCategories(flat);

      // Auto-expand root nodes
      const exp: Record<string, boolean> = {};
      data.forEach((r) => {
        exp[r.id] = true;
      });
      setExpanded(exp);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch category hierarchy');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTree();
    }
  }, [isOpen]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleToggleSelectable = async (cat: Category) => {
    const nextState = !cat.is_selectable;
    try {
      await toggleCategorySelectable(cat.id, nextState);
      setSuccessMsg(`Category "${cat.name}" is now ${nextState ? 'SELECTABLE (Leaf)' : 'GROUPING ONLY (Non-selectable)'}`);
      setTimeout(() => setSuccessMsg(null), 3000);
      await fetchTree();
      if (onRefreshCategories) onRefreshCategories();
    } catch (err: any) {
      setError(err.message || 'Failed to toggle selectability');
    }
  };

  const handleSaveParent = async () => {
    if (!reparentingCat) return;
    setSavingReparent(true);
    setError(null);
    try {
      const parentId = selectedParentId === 'ROOT' ? null : selectedParentId;
      await updateCategoryParent(reparentingCat.id, parentId, 0);
      setSuccessMsg(`Successfully updated hierarchy for "${reparentingCat.name}" and all descendants.`);
      setTimeout(() => setSuccessMsg(null), 3000);
      setReparentingCat(null);
      await fetchTree();
      if (onRefreshCategories) onRefreshCategories();
    } catch (err: any) {
      setError(err.message || 'Failed to reparent category');
    } finally {
      setSavingReparent(false);
    }
  };

  // Helper to determine if target candidate parent would cause a cycle
  const isInvalidParentCandidate = (targetParent: Category, currentCat: Category): boolean => {
    if (targetParent.id === currentCat.id) return true; // Self-parenting
    if (targetParent.path && targetParent.path.includes(currentCat.id)) return true; // Descendant
    return false;
  };

  const renderCategoryNode = (cat: Category, depth: number = 0) => {
    const hasChildren = cat.children && cat.children.length > 0;
    const isExpanded = !!expanded[cat.id];
    const isLeaf = cat.is_selectable;

    return (
      <div key={cat.id} className="space-y-1">
        <div
          className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
            isLeaf
              ? 'bg-white border-slate-200 hover:border-slate-300'
              : 'bg-slate-50 border-slate-300 font-semibold text-slate-900'
          }`}
          style={{ marginLeft: `${depth * 24}px` }}
        >
          {/* Left info */}
          <div className="flex items-center gap-2.5 truncate">
            {hasChildren ? (
              <button
                onClick={() => toggleExpand(cat.id)}
                className="p-1 rounded hover:bg-slate-200 text-slate-600 transition-colors"
                title={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            ) : (
              <div className="w-6 flex justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              </div>
            )}

            {isLeaf ? (
              <Tag className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <Folder className="w-4 h-4 text-amber-600 shrink-0" />
            )}

            <div className="truncate">
              <div className="flex items-center gap-2 truncate">
                <span className="text-xs font-bold text-slate-900 truncate">{cat.name}</span>
                <span className="text-[10px] text-slate-400 font-mono">({cat.slug})</span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono truncate">
                Level {cat.level || 1} &bull; Path: {cat.path || cat.id}
              </div>
            </div>
          </div>

          {/* Right badges & actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Selectable Badge */}
            <button
              onClick={() => handleToggleSelectable(cat)}
              className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border flex items-center gap-1.5 transition-colors ${
                isLeaf
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
              }`}
              title="Click to toggle whether vendors can select this category"
            >
              {isLeaf ? <ToggleRight className="w-3.5 h-3.5 text-emerald-600" /> : <ToggleLeft className="w-3.5 h-3.5 text-amber-600" />}
              <span>{isLeaf ? 'Selectable Leaf' : 'Grouping Only'}</span>
            </button>

            {/* Reparent Button */}
            <button
              onClick={() => {
                setReparentingCat(cat);
                setSelectedParentId(cat.parent_id || 'ROOT');
              }}
              className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold border border-slate-300 flex items-center gap-1 transition-colors"
              title="Move or change parent category"
            >
              <Move className="w-3 h-3 text-slate-600" />
              <span>Move / Reparent</span>
            </button>
          </div>
        </div>

        {/* Children recursive */}
        {hasChildren && isExpanded && (
          <div className="space-y-1">
            {cat.children!.map((child) => renderCategoryNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-black text-white flex items-center justify-center shadow-sm">
              <FolderTree className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">
                Platform Category Hierarchy Management
              </h2>
              <p className="text-xs text-slate-500">
                Multi-level unlimited depth hierarchy, atomic path recalculation &amp; leaf selectability governance.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchTree}
              className="p-2 rounded-xl text-slate-600 hover:bg-slate-200 transition-colors"
              title="Refresh hierarchy"
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

        {/* Reparenting Drawer / Modal Area */}
        {reparentingCat && (
          <div className="mx-6 mt-4 p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Move className="w-4 h-4 text-indigo-700" />
                <h4 className="text-xs font-bold text-indigo-950">
                  Reparent Category: <span className="font-extrabold">{reparentingCat.name}</span>
                </h4>
              </div>
              <button
                onClick={() => setReparentingCat(null)}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                Cancel
              </button>
            </div>

            <p className="text-[11px] text-indigo-800">
              Moving this category will atomically update its level, path, and all descendant category paths. Self-parenting and cycles are strictly blocked.
            </p>

            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Choose New Parent
                </label>
                <select
                  value={selectedParentId}
                  onChange={(e) => setSelectedParentId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-medium text-slate-900 focus:outline-none focus:border-indigo-600"
                >
                  <option value="ROOT">[Top-Level Root Grouping / Standalone]</option>
                  {allFlatCategories.map((c) => {
                    const isSelfOrDescendant = isInvalidParentCandidate(c, reparentingCat);
                    return (
                      <option
                        key={c.id}
                        value={c.id}
                        disabled={isSelfOrDescendant}
                      >
                        {isSelfOrDescendant ? `🚫 (Invalid / Cycle) ` : ''}
                        {c.name} ({c.is_selectable ? 'Leaf' : 'Grouping'}) — Level {c.level || 1}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="self-end">
                <button
                  onClick={handleSaveParent}
                  disabled={savingReparent}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50"
                >
                  {savingReparent ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                  <span>Save Parent</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tree Container */}
        <div className="flex-1 p-6 overflow-y-auto space-y-2">
          {loading ? (
            <div className="py-16 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
              <span>Loading platform category hierarchy...</span>
            </div>
          ) : tree.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-xs">
              No categories found.
            </div>
          ) : (
            tree.map((root) => renderCategoryNode(root, 0))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 text-amber-600" />
              <span>Grouping Category (Non-selectable by vendors)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-emerald-600" />
              <span>Selectable Leaf Category</span>
            </span>
          </div>
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
