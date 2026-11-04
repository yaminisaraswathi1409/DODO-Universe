'use client';

import React from 'react';
import { FormSubmission } from '@/lib/formsApi';
import { CheckCircle, AlertCircle, Clock, XCircle, FileText, Download } from 'lucide-react';

interface FormSubmissionReviewProps {
  submission: FormSubmission;
  onApprove?: () => void;
  onReject?: (reason: string) => void;
  onRequestChanges?: (notes: string) => void;
  isAdmin?: boolean;
}

export default function FormSubmissionReview({
  submission,
  onApprove,
  onReject,
  onRequestChanges,
  isAdmin = false,
}: FormSubmissionReviewProps) {
  const schema = submission.schema_snapshot || {};
  const fields = schema.fields || [];

  const getStatusBadge = () => {
    switch (submission.status) {
      case 'APPROVED':
        return (
          <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            Approved
          </span>
        );
      case 'CHANGES_REQUESTED':
        return (
          <span className="px-2.5 py-1 rounded-full bg-orange-100 text-orange-800 text-xs font-bold flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-orange-600" />
            Changes Requested
          </span>
        );
      case 'REJECTED':
        return (
          <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 text-xs font-bold flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            Rejected
          </span>
        );
      case 'DRAFT':
        return (
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-bold flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-600" />
            Draft
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-bold flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            Submitted
          </span>
        );
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-base font-extrabold text-slate-900">
            {schema.title || 'Form Submission'}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Schema Version {submission.schema_version} • Submitted on{' '}
            {new Date(submission.created_at).toLocaleDateString()}
          </p>
        </div>
        {getStatusBadge()}
      </div>

      {/* Answers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(submission.answers || {}).map(([key, val]) => {
          const fieldDef = fields.find((f: any) => f.key === key);
          const label = fieldDef?.label || key;
          const isFile =
            typeof val === 'string' &&
            (val.startsWith('/uploads/') || val.startsWith('http://') || val.startsWith('https://'));

          return (
            <div key={key} className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 space-y-1">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                {label}
              </span>
              {isFile ? (
                <a
                  href={val}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1.5 truncate"
                >
                  <FileText className="w-4 h-4 shrink-0 text-blue-500" />
                  <span className="truncate">{val}</span>
                </a>
              ) : (
                <p className="text-xs font-extrabold text-slate-800 break-words">
                  {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {submission.review_notes && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs">
          <span className="font-extrabold text-amber-900 block mb-1">Admin Feedback:</span>
          <p className="text-amber-800">{submission.review_notes}</p>
        </div>
      )}
    </div>
  );
}

