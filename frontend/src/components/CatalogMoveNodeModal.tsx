'use client';

import React, { useState } from 'react';
import {
  VendorCatalogItem,
  moveCatalogNode,
} from '@/lib/api';
import {
  X,
  Move,
  Folder,
  Package,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

interface CatalogMoveNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  vendorUserId: string;
  nodeToMove: VendorCatalogItem | null;
  allItems: VendorCatalogItem[];
}

export default function CatalogMoveNodeModal({
  isOpen,
  onClose,
  onSuccess,
  vendorUserId,
  nodeToMove,
  allItems,
}: CatalogMoveNodeModalProps) {
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [displayOrder, setDisplayOrder] = useState<number>(0);
  const [moving, setMoving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen || !nodeToMove) return null;

  // Filter out the node itself and any of its descendants to prevent cycles
  const isDescendant = (candidate: VendorCatalogItem, targetNode: VendorCatalogItem): boolean => {
    if (candidate.id === targetNode.id) return true;
    if (candidate.path && targetNode.id && candidate.path.includes(targetNode.id)) return true;
    return false;
  };

  const eligibleParents = allItems.filter(
    (item) => !isDescendant(item, nodeToMove)
  );

  const handleMoveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMoving(true);
    setErrorMsg('');

    try {
      await moveCatalogNode(
        nodeToMove.id,
        vendorUserId,
        selectedParentId,
        displayOrder
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to move catalog node');
    } finally {
      setMoving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-black text-white">
              <Move className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-extrabold text-base text-slate-900">Move Catalog Node</h3>
              <p className="text-xs text-slate-500">Reparent &quot;{nodeToMove.title}&quot; in catalog tree</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-200 text-slate-400 hover:text-black transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleMoveSubmit} className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block">
              Choose New Parent Node
            </label>

            <div className="max-h-60 overflow-y-auto space-y-1.5 border border-slate-200 rounded-2xl p-2 bg-slate-50/50">
              {/* Root option */}
              <button
                type="button"
                onClick={() => setSelectedParentId(null)}
                className={`w-full p-3 rounded-xl border text-left flex items-center justify-between text-xs transition-all ${
                  selectedParentId === null
                    ? 'border-black bg-black text-white'
                    : 'border-slate-200 bg-white hover:border-slate-300 text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Folder className="w-4 h-4" />
                  <span className="font-bold">Root (Level 0 - Top of Catalog)</span>
                </div>
                {selectedParentId === null && <CheckCircle2 className="w-4 h-4 text-white" />}
              </button>

              {eligibleParents.map((parent) => {
                const isSelected = selectedParentId === parent.id;
                const isGrp = parent.node_type === 'GROUPING';
                return (
                  <button
                    key={parent.id}
                    type="button"
                    onClick={() => setSelectedParentId(parent.id)}
                    className={`w-full p-3 rounded-xl border text-left flex items-center justify-between text-xs transition-all ${
                      isSelected
                        ? 'border-black bg-black text-white'
                        : 'border-slate-200 bg-white hover:border-slate-300 text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {isGrp ? <Folder className="w-4 h-4 shrink-0 text-amber-500" /> : <Package className="w-4 h-4 shrink-0 text-blue-500" />}
                      <span className="font-bold truncate">{parent.title}</span>
                      <span className={`text-[10px] ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>
                        (Level {parent.level || 0})
                      </span>
                    </div>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-white shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Display Order Position
            </label>
            <input
              type="number"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-black focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={moving}
              className="flex-1 py-2.5 rounded-xl bg-black text-white text-xs font-bold hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {moving ? 'Moving...' : 'Confirm Move'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

