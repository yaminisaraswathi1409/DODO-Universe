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
      <div className="bg-white border border-slate-200 rounded-3xl p-8 text-center text-slate-500 shadow-sm">
        <Network className="w-10 h-10 mx-auto text-slate-400 mb-3" />
        <p className="text-sm">No connected opportunity tree loaded.</p>
      </div>
    );
  }

  const renderNodeIcon = (title: string, status: string) => {
    if (status === 'INCIDENT_SUSPENDED') return <AlertTriangle className="w-5 h-5 text-black" />;
    if (title.includes('Transport')) return <Truck className="w-5 h-5 text-slate-700" />;
    if (title.includes('Driver')) return <UserCheck className="w-5 h-5 text-slate-700" />;
    if (title.includes('Repair')) return <Wrench className="w-5 h-5 text-slate-700" />;
    if (title.includes('Parts')) return <PackageCheck className="w-5 h-5 text-slate-700" />;
    return <Network className="w-5 h-5 text-slate-700" />;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'INCIDENT_SUSPENDED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-900 text-white flex items-center space-x-1"><AlertTriangle className="w-3 h-3 text-white" /><span>Transit Suspended (SOS)</span></span>;
      case 'COMPLETED':
      case 'REPAIR_COMPLETED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-black text-white flex items-center space-x-1"><CheckCircle className="w-3 h-3 text-white" /><span>Resolved</span></span>;
      case 'OPEN_NEED':
      case 'PENDING_MATCHING':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300 flex items-center space-x-1"><Clock className="w-3 h-3" /><span>Matching Active</span></span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">{status}</span>;
    }
  };

  const renderTreeNode = (node: OpportunityTreeNode, depth = 0) => {
    const opp = node.opportunity;
    const isRoot = depth === 0;

    return (
      <div key={opp.id} className="relative pl-6 border-l-2 border-slate-300 my-3">
        <div className={`rounded-2xl p-4 border transition-all ${
          opp.status === 'INCIDENT_SUSPENDED'
            ? 'bg-slate-50 border-black ring-1 ring-black'
            : isRoot
            ? 'bg-slate-50 border-slate-900'
            : 'bg-white border-slate-200 hover:border-slate-400'
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-white border border-slate-300">
                {renderNodeIcon(opp.title, opp.status)}
              </div>
              <div>
                <span className="text-[10px] font-mono font-bold tracking-wider text-slate-500 uppercase">
                  {isRoot ? 'ROOT NODE #9001' : `CHILD NODE #${opp.id.slice(0, 8)}`}
                </span>
                <h4 className="text-sm font-bold text-slate-900 leading-tight">{opp.title}</h4>
              </div>
            </div>
            {getStatusBadge(opp.status)}
          </div>

          <p className="text-xs text-slate-600 line-clamp-2">{opp.description}</p>

          {node.manifest && (
            <div className="mt-3 p-2.5 bg-slate-100 rounded-xl border border-slate-200 text-xs flex justify-between items-center text-slate-700">
              <span>Manifest: <strong className="text-slate-900">{node.manifest.manifest_number}</strong></span>
              <span className="font-mono text-[11px] bg-white px-2 py-0.5 rounded text-black border border-slate-300">{node.manifest.routing_barcode}</span>
            </div>
          )}

          {node.incident && (
            <div className="mt-3 p-3 bg-slate-100 rounded-xl border border-slate-300 text-xs text-slate-900">
              <div className="flex items-center space-x-2 font-bold mb-1">
                <AlertTriangle className="w-4 h-4 text-slate-900" />
                <span>Highway SOS Breakdown Alert</span>
              </div>
              <p className="text-slate-600 text-[11px]">{node.incident.description}</p>
              <div className="mt-2 text-[10px] font-mono text-black font-bold">
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
    <div className="bg-white border border-slate-200 rounded-3xl p-6 text-slate-900 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-black text-white rounded-xl">
            <Network className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Opportunity Ancestry Tree</h3>
            <p className="text-xs text-slate-500">PostgreSQL Graph of Multi-Layer Cascading Dependencies</p>
          </div>
        </div>
      </div>

      <div className="pr-2">
        {renderTreeNode(tree)}
      </div>
    </div>
  );
}
