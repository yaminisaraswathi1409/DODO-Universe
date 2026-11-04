'use client';

import React, { useState, useEffect } from 'react';
import {
  FileText,
  RefreshCw,
  Search,
  Filter,
  User,
  Shield,
  Clock,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { AdminAuditLog, getAdminAuditLogs } from '@/lib/api';

export default function AdminAuditLogsView() {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [entityFilter, setEntityFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState<AdminAuditLog | null>(null);

  const pageSize = 20;

  useEffect(() => {
    loadLogs();
  }, [page, entityFilter]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await getAdminAuditLogs({
        entityType: entityFilter || undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      setLogs(res.logs || []);
      setTotal(res.total || 0);
    } catch {
      // keep state
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase bg-slate-900 text-white tracking-wider">
              GOVERNANCE & AUDIT
            </span>
            <span className="text-xs text-slate-500 font-mono">ACCOUNTABILITY TRAIL</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 pt-1">
            Platform Audit Trail
          </h1>
          <p className="text-xs text-slate-500">
            Immutable log of administrative interventions, vendor standing modifications, and incident escalations.
          </p>
        </div>

        <button
          onClick={loadLogs}
          className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs border border-slate-200 flex items-center gap-2 transition-all self-start sm:self-auto"
        >
          <RefreshCw className="w-4 h-4 text-slate-800" />
          <span>Refresh Logs</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: '', label: 'All Entities' },
            { id: 'VENDOR', label: 'Vendors' },
            { id: 'INCIDENT', label: 'Incidents' },
            { id: 'OPPORTUNITY', label: 'Opportunities' },
            { id: 'CATEGORY', label: 'Categories' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => {
                setEntityFilter(f.id);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                entityFilter === f.id
                  ? 'bg-black text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <span className="text-xs font-semibold text-slate-500">Total Events: {total}</span>
      </div>

      {/* Audit Logs Table */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-slate-900" />
            <span>Retrieving audit records...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <FileText className="w-10 h-10 text-slate-400 mx-auto" />
            <h4 className="text-sm font-bold text-slate-900">No Audit Events Logged</h4>
            <p className="text-xs text-slate-500">
              Administrative governance events will be recorded here automatically.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-extrabold uppercase">
                <tr>
                  <th className="p-4">Action</th>
                  <th className="p-4">Entity</th>
                  <th className="p-4">Actor</th>
                  <th className="p-4">Reason / Notes</th>
                  <th className="p-4">Timestamp</th>
                  <th className="p-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/50">
                    <td className="p-4">
                      <span className="px-2.5 py-1 rounded-full font-bold text-[10px] bg-slate-100 text-slate-900 border border-slate-200">
                        {l.action}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="font-semibold text-slate-800">{l.entity_type}</span>
                      {l.entity_id && (
                        <span className="text-[10px] text-slate-400 block font-mono">
                          {l.entity_id.substring(0, 8)}...
                        </span>
                      )}
                    </td>
                    <td className="p-4 font-medium text-slate-700">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-[10px] font-mono">
                        {l.actor_role}
                      </span>
                    </td>
                    <td className="p-4 text-slate-600 max-w-[280px] truncate">{l.reason || '-'}</td>
                    <td className="p-4 text-slate-500 font-mono text-[11px]">
                      {new Date(l.created_at).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => setSelectedLog(l)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] inline-flex items-center gap-1 transition-all"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > pageSize && (
          <div className="flex items-center justify-between p-4 border-t border-slate-100 text-xs">
            <span className="text-slate-500">
              Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-medium flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>
              <span className="font-bold text-slate-800">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-medium flex items-center gap-1"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Inspect Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 border border-slate-200 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-base text-slate-900">Audit Event Details</h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-2xl">
                <div>
                  <span className="text-slate-400 font-bold block uppercase text-[10px]">Action</span>
                  <span className="font-extrabold text-slate-900">{selectedLog.action}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block uppercase text-[10px]">Actor Role</span>
                  <span className="font-bold text-slate-900">{selectedLog.actor_role}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block uppercase text-[10px]">Entity Type</span>
                  <span className="font-bold text-slate-900">{selectedLog.entity_type}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block uppercase text-[10px]">Timestamp</span>
                  <span className="text-slate-700">{new Date(selectedLog.created_at).toLocaleString()}</span>
                </div>
              </div>

              <div>
                <span className="text-slate-400 font-bold block uppercase text-[10px]">Reason</span>
                <p className="p-3 bg-slate-50 rounded-xl text-slate-800 font-medium">
                  {selectedLog.reason || 'No explicit reason specified'}
                </p>
              </div>

              {selectedLog.metadata && (
                <div>
                  <span className="text-slate-400 font-bold block uppercase text-[10px]">Metadata</span>
                  <pre className="p-3 bg-slate-950 text-slate-100 rounded-xl overflow-x-auto text-[11px] font-mono">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

