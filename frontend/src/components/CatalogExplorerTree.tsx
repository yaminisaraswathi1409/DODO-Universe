'use client';

import React, { useState } from 'react';
import {
  VendorCatalogItem,
  AdditionalServiceItem,
} from '@/lib/api';
import {
  Folder,
  FolderPlus,
  Package,
  PackagePlus,
  ChevronRight,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Move,
  Edit2,
  Trash2,
  Eye,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Archive,
  Info,
  DollarSign,
  Layers,
} from 'lucide-react';

interface CatalogExplorerTreeProps {
  items: VendorCatalogItem[];
  onAddChildGrouping: (parent: VendorCatalogItem) => void;
  onAddChildOffering: (parent: VendorCatalogItem) => void;
  onEditNode: (item: VendorCatalogItem) => void;
  onMoveNode: (item: VendorCatalogItem) => void;
  onReorderNode: (item: VendorCatalogItem, direction: 'UP' | 'DOWN') => void;
  onArchiveNode: (item: VendorCatalogItem) => void;
  onPreviewNode: (item: VendorCatalogItem) => void;
}

export default function CatalogExplorerTree({
  items,
  onAddChildGrouping,
  onAddChildOffering,
  onEditNode,
  onMoveNode,
  onReorderNode,
  onArchiveNode,
  onPreviewNode,
}: CatalogExplorerTreeProps) {
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});

  // Build recursive tree from flat items
  const buildTree = (list: VendorCatalogItem[]): VendorCatalogItem[] => {
    const itemMap = new Map<string, VendorCatalogItem>();
    const roots: VendorCatalogItem[] = [];

    // Clone items and attach empty children
    list.forEach((item) => {
      itemMap.set(item.id, { ...item, children: [] });
    });

    list.forEach((item) => {
      const node = itemMap.get(item.id)!;
      if (item.parent_id && itemMap.has(item.parent_id)) {
        itemMap.get(item.parent_id)!.children!.push(node);
      } else {
        roots.push(node);
      }
    });

    // Sort children by display_order
    const sortTree = (nodes: VendorCatalogItem[]) => {
      nodes.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
      nodes.forEach((n) => {
        if (n.children && n.children.length > 0) {
          sortTree(n.children);
        }
      });
    };
    sortTree(roots);

    return roots;
  };

  const tree = buildTree(items);

  const toggleCollapse = (id: string) => {
    setCollapsedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderStatusBadge = (item: VendorCatalogItem) => {
    if (item.node_type === 'GROUPING') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
          <Folder className="w-2.5 h-2.5" />
          <span>GROUPING (NOT BOOKABLE)</span>
        </span>
      );
    }

    const st = item.status || 'PENDING_ADMIN_APPROVAL';
    switch (st) {
      case 'ACTIVE_IN_CATALOG':
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-2.5 h-2.5" />
            <span>APPROVED & LIVE</span>
          </span>
        );
      case 'PENDING_ADMIN_APPROVAL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200">
            <Clock className="w-2.5 h-2.5" />
            <span>PENDING APPROVAL</span>
          </span>
        );
      case 'CHANGES_REQUESTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-orange-50 text-orange-800 border border-orange-200">
            <AlertTriangle className="w-2.5 h-2.5" />
            <span>CHANGES REQUESTED</span>
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-red-50 text-red-800 border border-red-200">
            <XCircle className="w-2.5 h-2.5" />
            <span>REJECTED</span>
          </span>
        );
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-gray-100 text-gray-700 border border-gray-200">
            <span>DRAFT</span>
          </span>
        );
      case 'ARCHIVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-500 border border-slate-200">
            <Archive className="w-2.5 h-2.5" />
            <span>ARCHIVED</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
            <span>{st}</span>
          </span>
        );
    }
  };

  const renderTreeNode = (node: VendorCatalogItem, depth = 0) => {
    const isGrouping = node.node_type === 'GROUPING';
    const hasChildren = node.children && node.children.length > 0;
    const isCollapsed = !!collapsedNodes[node.id];

    return (
      <div key={node.id} className="space-y-2">
        <div
          className={`group flex flex-col md:flex-row md:items-center justify-between p-4 rounded-2xl border transition-all ${
            isGrouping
              ? 'bg-slate-50/80 border-slate-200/90 hover:border-slate-300'
              : 'bg-white border-slate-200 hover:border-black/30 hover:shadow-sm'
          }`}
          style={{ marginLeft: `${Math.min(depth * 24, 120)}px` }}
        >
          {/* Node Identity & Hierarchy Indicators */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleCollapse(node.id)}
                className="mt-1 p-1 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors"
                title={isCollapsed ? 'Expand branch' : 'Collapse branch'}
              >
                {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            ) : (
              <div className="w-6 h-6 mt-1 flex items-center justify-center text-slate-300">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {isGrouping ? (
                  <span className="p-1 rounded bg-amber-100 text-amber-800" title="Grouping Node">
                    <Folder className="w-4 h-4" />
                  </span>
                ) : (
                  <span className="p-1 rounded bg-blue-100 text-blue-800" title="Bookable Offering">
                    <Package className="w-4 h-4" />
                  </span>
                )}

                <h4 className="font-extrabold text-sm text-slate-900 truncate">{node.title}</h4>

                {renderStatusBadge(node)}

                {node.price_type === 'QUOTATION' && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-purple-50 text-purple-700 border border-purple-200">
                    QUOTATION ONLY
                  </span>
                )}

                <span className="text-[10px] text-slate-400 font-mono">
                  Level {node.level || depth}
                </span>
              </div>

              {node.description && (
                <p className="text-xs text-slate-500 mt-1 line-clamp-1">{node.description}</p>
              )}

              {/* Offering Pricing & Additional Services Preview */}
              {!isGrouping && (
                <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-600">
                  <span className="font-extrabold text-slate-900">
                    ₹{node.unit_price} <span className="text-[10px] text-slate-500 font-medium">/{node.price_unit || 'PIECE'}</span>
                  </span>
                  {node.min_order_quantity && node.min_order_quantity > 1 && (
                    <span className="text-slate-500">
                      MOQ: <span className="font-bold text-slate-800">{node.min_order_quantity.toLocaleString()}</span>
                    </span>
                  )}
                  {node.stock_quantity !== undefined && (
                    <span className="text-slate-500">
                      Stock: <span className="font-bold text-slate-800">{node.stock_quantity.toLocaleString()}</span>
                    </span>
                  )}

                  {/* Included Services Count */}
                  {Array.isArray(node.included_services) && node.included_services.length > 0 && (
                    <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                      {node.included_services.length} Included Svc
                    </span>
                  )}

                  {/* Optional Services Count */}
                  {Array.isArray(node.optional_services) && node.optional_services.length > 0 && (
                    <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold">
                      {node.optional_services.length} Optional Svc
                    </span>
                  )}
                </div>
              )}

              {/* Admin Feedback Alerts */}
              {node.status === 'CHANGES_REQUESTED' && node.change_request_notes && (
                <div className="mt-2 p-2.5 rounded-xl bg-orange-50 border border-orange-200 text-xs text-orange-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Admin Feedback:</span>
                    <span>{node.change_request_notes}</span>
                  </div>
                </div>
              )}

              {node.status === 'REJECTED' && node.rejection_reason && (
                <div className="mt-2 p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900 flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Rejection Reason:</span>
                    <span>{node.rejection_reason}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Node Actions Toolbar */}
          <div className="flex flex-wrap items-center gap-1.5 mt-3 md:mt-0 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100">
            {/* Add Child Actions */}
            <button
              type="button"
              onClick={() => onAddChildGrouping(node)}
              className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-bold flex items-center gap-1 transition-colors"
              title="Add Child Grouping Node"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[11px]">+Group</span>
            </button>

            <button
              type="button"
              onClick={() => onAddChildOffering(node)}
              className="p-1.5 rounded-lg bg-black text-white hover:bg-slate-800 text-xs font-bold flex items-center gap-1 transition-colors"
              title="Add Child Bookable Offering"
            >
              <PackagePlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[11px]">+Offering</span>
            </button>

            {/* Move Action */}
            <button
              type="button"
              onClick={() => onMoveNode(node)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-black transition-colors"
              title="Move Node to another Parent"
            >
              <Move className="w-3.5 h-3.5" />
            </button>

            {/* Reorder Actions */}
            <button
              type="button"
              onClick={() => onReorderNode(node, 'UP')}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-black transition-colors"
              title="Move Up in display order"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onReorderNode(node, 'DOWN')}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-black transition-colors"
              title="Move Down in display order"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>

            {/* Preview Action */}
            <button
              type="button"
              onClick={() => onPreviewNode(node)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-black transition-colors"
              title="Preview Customer Listing"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>

            {/* Edit Action */}
            <button
              type="button"
              onClick={() => onEditNode(node)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-black transition-colors"
              title="Edit Node"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>

            {/* Archive Action */}
            <button
              type="button"
              onClick={() => onArchiveNode(node)}
              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
              title="Archive Node"
            >
              <Archive className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Children Render with Recursion */}
        {hasChildren && !isCollapsed && (
          <div className="space-y-2 border-l-2 border-slate-200 ml-4 pl-2">
            {node.children!.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (items.length === 0) {
    return (
      <div className="p-12 text-center rounded-3xl bg-slate-50 border border-slate-200 space-y-3">
        <Folder className="w-10 h-10 text-slate-400 mx-auto" />
        <h3 className="font-extrabold text-slate-800 text-base">Your Catalog Tree is Empty</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          Start building your custom vendor hierarchy. Create grouping nodes to organize your products, or add bookable offerings directly.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tree.map((rootNode) => renderTreeNode(rootNode, 0))}
    </div>
  );
}

