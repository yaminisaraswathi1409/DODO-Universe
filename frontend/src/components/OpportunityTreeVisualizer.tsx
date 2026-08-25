'use client';

import React from 'react';
import { Network, AlertTriangle, Truck, UserCheck, Wrench, PackageCheck, CheckCircle, Clock } from 'lucide-react';
import { OpportunityTreeNode } from '@/lib/api';

interface OpportunityTreeVisualizerProps {
  tree: OpportunityTreeNode | null;
  onRefresh?: () => void;
}

export default function OpportunityTreeVisualizer({ tree }: OpportunityTreeVisualizerProps) {
  if (!tree || !tree.opportunity) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 text-center text-slate-400">
        <Network className="w-10 h-10 mx-auto text-slate-600 mb-3 animate-pulse" />
        <p className="text-sm">No connected opportunity tree loaded.</p>
      </div>
    );
  }

  const renderNodeIcon = (title: string, status: string) => {
    if (status === 'INCIDENT_SUSPENDED') return <AlertTriangle className="w-5 h-5 text-amber-400 animate-bounce" />;
    if (title.includes('Transport')) return <Truck className="w-5 h-5 text-indigo-400" />;
    if (title.includes('Driver')) return <UserCheck className="w-5 h-5 text-emerald-400" />;
    if (title.includes('Repair')) return <Wrench className="w-5 h-5 text-rose-400" />;
    if (title.includes('Parts')) return <PackageCheck className="w-5 h-5 text-purple-400" />;
    return <Network className="w-5 h-5 text-indigo-400" />;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'INCIDENT_SUSPENDED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center space-x-1"><AlertTriangle className="w-3 h-3" /><span>Transit Suspended (SOS)</span></span>;
      case 'COMPLETED':
      case 'REPAIR_COMPLETED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center space-x-1"><CheckCircle className="w-3 h-3" /><span>Resolved</span></span>;
      case 'OPEN_NEED':
      case 'PENDING_MATCHING':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center space-x-1"><Clock className="w-3 h-3" /><span>Matching Active</span></span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-700 text-slate-300">{status}</span>;
    }
  };

  const renderTreeNode = (node: OpportunityTreeNode, depth = 0) => {
    const opp = node.opportunity;
    const isRoot = depth === 0;

    return (
      <div key={opp.id} className="relative pl-6 border-l-2 border-slate-700/60 my-3">
        <div className={`rounded-2xl p-4 border transition-all ${
          opp.status === 'INCIDENT_SUSPENDED'
            ? 'bg-amber-950/30 border-amber-500/50 shadow-lg shadow-amber-500/10'
            : isRoot
            ? 'bg-indigo-950/40 border-indigo-500/40 shadow-lg shadow-indigo-500/10'
            : 'bg-slate-800/60 border-slate-700/80 hover:border-slate-600'
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-700">
                {renderNodeIcon(opp.title, opp.status)}
              </div>
              <div>
                <span className="text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase">
                  {isRoot ? 'ROOT NODE #9001' : `CHILD NODE #${opp.id.slice(0, 8)}`}
                </span>
                <h4 className="text-sm font-bold text-white leading-tight">{opp.title}</h4>
              </div>
            </div>
            {getStatusBadge(opp.status)}
          </div>

          <p className="text-xs text-slate-300 line-clamp-2">{opp.description}</p>

          {node.manifest && (
            <div className="mt-3 p-2.5 bg-slate-900/80 rounded-xl border border-slate-700 text-xs flex justify-between items-center text-slate-300">
              <span>Manifest: <strong className="text-indigo-400">{node.manifest.manifest_number}</strong></span>
              <span className="font-mono text-[11px] bg-slate-800 px-2 py-0.5 rounded text-amber-300">{node.manifest.routing_barcode}</span>
            </div>
          )}

          {node.incident && (
            <div className="mt-3 p-3 bg-rose-950/40 rounded-xl border border-rose-500/30 text-xs text-rose-300">
              <div className="flex items-center space-x-2 font-bold mb-1">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>Highway SOS Breakdown Alert</span>
              </div>
              <p className="text-slate-300 text-[11px]">{node.incident.description}</p>
              <div className="mt-2 text-[10px] font-mono text-amber-300">
                GPS Telemetry: {node.incident.lat}, {node.incident.lng} (No Movement Alert Raised)
              </div>
            </div>
          )}
        </div>

        {node.children && node.children.length > 0 && (
          <div className="mt-2 space-y-2">
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Opportunity Ancestry Tree</h3>
            <p className="text-xs text-slate-400">PostgreSQL Graph of Multi-Layer Cascading Dependencies</p>
          </div>
        </div>
      </div>

      <div className="pr-2">
        {renderTreeNode(tree)}
      </div>
    </div>
  );
}
