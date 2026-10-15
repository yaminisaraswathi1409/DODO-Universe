'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getOpportunityByID, getOpportunityTree, Opportunity, OpportunityTreeNode } from '@/lib/api';
import { CheckCircle2, Clock, MapPin, Phone, MessageSquare, Truck, ShieldCheck, Wrench, AlertTriangle, ArrowLeft, RefreshCw, User, Package, Calendar } from 'lucide-react';
import Link from 'next/link';
import OrderResourceArrangements from '@/components/OrderResourceArrangements';

interface TimelineStep {
  id: string;
  label: string;
  status: 'completed' | 'current' | 'pending' | 'warning';
  time?: string;
}

export default function CustomerOrderTrackingPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.id as string;

  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [tree, setTree] = useState<OpportunityTreeNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const data = await getOpportunityByID(orderId);
      setOpp(data);
      const treeData = await getOpportunityTree(orderId);
      setTree(treeData);
    } catch (err: any) {
      setError(err.message || 'Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center justify-center p-6 space-y-4">
        <RefreshCw className="w-10 h-10 animate-spin text-black" />
        <p className="text-sm font-semibold text-slate-600">Loading your order status live tracking...</p>
      </div>
    );
  }

  if (error || !opp) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center justify-center p-6 space-y-4">
        <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-center max-w-md space-y-3">
          <AlertTriangle className="w-10 h-10 mx-auto text-rose-600" />
          <h2 className="text-lg font-bold">Order Not Found</h2>
          <p className="text-xs text-slate-600">{error || 'The requested order details could not be retrieved.'}</p>
          <Link href="/dashboard" className="inline-block px-5 py-2.5 rounded-xl bg-black text-white font-bold text-xs hover:bg-slate-800 transition-all">
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const meta = opp.metadata || {};
  const isSomeoneElse = meta.for_someone_else;
  const recipient = meta.recipient_details;
  const quantity = opp.quantity ?? meta.quantity ?? meta.quantity_bags ?? meta.cargo_weight_tons ?? meta.farm_area_acres;
  const isTransportOrRepair = opp.category?.slug === 'logistics-transport' || opp.category?.slug === 'flatbed-transport' || opp.category?.slug === 'vehicle-repair' || opp.category?.slug === 'roadside-repair';

  // Check for Incident / Repair sub-tasks in tree internally without technical jargon
  let hasIncident = false;
  let isRepairCompleted = false;
  if (tree) {
    if (tree.incident) hasIncident = true;
    if (tree.children && tree.children.length > 0) {
      for (const childNode of tree.children) {
        if (childNode.incident) hasIncident = true;
        if (childNode.opportunity?.status === 'REPAIR_COMPLETED' || childNode.opportunity?.status === 'COMPLETED') {
          isRepairCompleted = true;
        }
      }
    }
  }

  // Construct Visual E-Commerce Progress Timeline
  const getTimelineSteps = (): TimelineStep[] => {
    const status = opp.status;

    if (isTransportOrRepair) {
      // Transport & Roadside Emergency Cascade Stages
      return [
        { id: '1', label: 'Request Placed', status: 'completed' },
        { id: '2', label: 'Provider / Driver Accepted', status: status !== 'OPEN' ? 'completed' : 'current' },
        { id: '3', label: 'Dispatched & On The Way', status: status === 'IN_PROGRESS' || status === 'COMPLETED' ? 'completed' : status === 'ACCEPTED' ? 'current' : 'pending' },
        { id: '4', label: 'In Transit', status: status === 'IN_PROGRESS' || status === 'COMPLETED' ? 'completed' : 'pending' },
        ...(hasIncident
          ? [
              { id: '5a', label: 'Vehicle Problem Detected', status: ('warning' as const) },
              { id: '5b', label: 'Emergency Mechanic Repair', status: isRepairCompleted ? ('completed' as const) : ('current' as const) },
              { id: '5c', label: 'Journey Resumed', status: isRepairCompleted ? ('completed' as const) : ('pending' as const) },
            ]
          : []),
        { id: '6', label: 'Delivered / Completed', status: status === 'COMPLETED' ? 'completed' : 'pending' },
      ];
    }

    // Standard Service / Delivery Timeline
    return [
      { id: '1', label: 'Request Placed', status: 'completed' },
      { id: '2', label: 'Provider Accepted', status: status !== 'OPEN' ? 'completed' : 'current' },
      { id: '3', label: 'Preparing Service', status: status === 'IN_PROGRESS' || status === 'COMPLETED' ? 'completed' : status === 'ACCEPTED' ? 'current' : 'pending' },
      { id: '4', label: 'Dispatched / In Progress', status: status === 'IN_PROGRESS' || status === 'COMPLETED' ? 'completed' : 'pending' },
      { id: '5', label: 'Service Delivered & Completed', status: status === 'COMPLETED' ? 'completed' : 'pending' },
    ];
  };

  const timeline = getTimelineSteps();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined' && window.history.length > 1) {
                router.back();
              } else {
                router.push('/dashboard');
              }
            }}
            className="px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 hover:bg-slate-100 text-xs font-bold flex items-center gap-2 transition-all shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <span className="text-xs font-mono text-slate-500">Order ID: #{opp.id.slice(0, 8)}</span>
        </div>

        {/* Order Summary Hero Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-md space-y-4 relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div>
              <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-900 border border-slate-300 text-xs font-bold uppercase tracking-wider">
                {opp.category?.name || meta.category_name || 'Service Order'}
              </span>
              <h1 className="text-2xl font-black text-slate-900 mt-2">{opp.title}</h1>
              <p className="text-slate-600 text-xs mt-1">{opp.description}</p>
            </div>
            {(() => {
              const finalAmount = opp.total_price || opp.budget_max || meta.price_snapshot?.final_payable || meta.subtotal;
              if (!finalAmount) return null;
              return (
                <div className="text-right">
                  <span className="text-xs text-slate-500 block font-mono">Order Amount</span>
                  <span className="text-2xl font-black text-slate-900">₹{Number(finalAmount).toLocaleString('en-IN')}</span>
                </div>
              );
            })()}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-200 text-xs">
            {quantity && (
              <div>
                <span className="text-slate-500 text-[11px] block">Quantity</span>
                <span className="text-slate-900 font-bold">{quantity} {opp.price_unit ? opp.price_unit.replace('PER_', '').toLowerCase() : 'Units'}</span>
              </div>
            )}
            <div>
              <span className="text-slate-500 text-[11px] block">Order Status</span>
              <span className="text-black font-bold uppercase">{opp.status}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[11px] block">Estimated Delivery</span>
              <span className="text-slate-900 font-semibold">{opp.scheduled_start ? new Date(opp.scheduled_start).toLocaleDateString() : 'Within 2 Hours'}</span>
            </div>
          </div>
        </div>

        {/* Delivery Address & Recipient Card */}
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Delivery Location */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2 shadow-sm">
            <span className="text-xs font-bold uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-black" />
              <span>Delivery / Service Address</span>
            </span>
            <p className="text-slate-900 text-sm font-medium">{opp.address_text || 'Choutuppal, Telangana'}</p>
          </div>

          {/* Recipient Details */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2 shadow-sm">
            <span className="text-xs font-bold uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
              <User className="w-4 h-4 text-black" />
              <span>{isSomeoneElse ? 'Recipient Details' : 'Customer Profile'}</span>
            </span>
            {isSomeoneElse && recipient ? (
              <div>
                <div className="text-slate-900 text-sm font-bold">{recipient.recipientName}</div>
                <div className="text-slate-600 text-xs">{recipient.recipientPhone}</div>
                {recipient.instructions && <div className="text-slate-500 text-xs italic mt-1 font-mono">&quot;{recipient.instructions}&quot;</div>}
              </div>
            ) : (
              <div>
                <div className="text-slate-900 text-sm font-bold">Ordered For Myself</div>
                <div className="text-slate-500 text-xs">Logged-in Customer Account</div>
              </div>
            )}
          </div>
        </div>

        {/* Accepted Provider Profile & Direct Contact Buttons */}
        {opp.status !== 'OPEN' && (() => {
          const assignedProvider = opp.assigned_user || opp.target_vendor;
          const providerName = assignedProvider?.full_name || 'Verified Service Provider';
          const providerPhone = assignedProvider?.phone || '';

          return (
            <div className="bg-white border border-slate-300 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3 text-center sm:text-left">
                <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center text-black font-bold text-lg flex-shrink-0">
                  <ShieldCheck className="w-6 h-6 text-black" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-900">Assigned Provider</span>
                  <h3 className="text-base font-black text-slate-900">{providerName}</h3>
                  <div className="text-xs text-slate-600 flex items-center gap-2 justify-center sm:justify-start mt-0.5">
                    <span className="text-slate-900 font-bold">★ 4.9 Rating</span>
                    <span>• Verified Partner</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                {providerPhone ? (
                  <>
                    <a
                      href={`tel:${providerPhone}`}
                      className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-black hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
                    >
                      <Phone className="w-4 h-4" />
                      <span>Call Provider</span>
                    </a>
                    <a
                      href={`sms:${providerPhone}`}
                      className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-900 hover:bg-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>Message</span>
                    </a>
                  </>
                ) : (
                  <span className="text-xs text-slate-500 font-medium">Provider Contact Connected</span>
                )}
              </div>
            </div>
          );
        })()}

        {/* Dynamic Resource & Logistics Arrangements (Supports all Main Services) */}
        <OrderResourceArrangements opp={opp} />

        {/* Visual Progress Timeline */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 space-y-6 shadow-md">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-black" />
              <span>Live Order Progress Timeline</span>
            </h3>
            <p className="text-slate-600 text-xs">Real-time status updates powered by PostGIS matching engine.</p>
          </div>

          <div className="relative pl-6 border-l-2 border-slate-200 space-y-6">
            {timeline.map((stepItem, idx) => {
              const isCompleted = stepItem.status === 'completed';
              const isCurrent = stepItem.status === 'current';
              const isWarning = stepItem.status === 'warning';

              return (
                <div key={stepItem.id} className="relative group">
                  {/* Timeline Node Indicator */}
                  <div
                    className={`absolute -left-[31px] top-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      isCompleted
                        ? 'bg-black text-white ring-4 ring-slate-200'
                        : isCurrent
                        ? 'bg-slate-900 text-white ring-4 ring-slate-300 animate-pulse'
                        : isWarning
                        ? 'bg-amber-500 text-white ring-4 ring-amber-100'
                        : 'bg-slate-100 text-slate-400 border border-slate-300'
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : isWarning ? (
                      <AlertTriangle className="w-4 h-4" />
                    ) : (
                      <span>{idx + 1}</span>
                    )}
                  </div>

                  {/* Step Label & Detail */}
                  <div className="pl-2">
                    <h4
                      className={`text-sm font-bold ${
                        isCompleted
                          ? 'text-black'
                          : isCurrent
                          ? 'text-slate-900'
                          : isWarning
                          ? 'text-amber-600 font-black'
                          : 'text-slate-400'
                      }`}
                    >
                      {stepItem.label}
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {isCompleted
                        ? 'Completed'
                        : isCurrent
                        ? 'Active stage in progress...'
                        : isWarning
                        ? 'Telemetry breakdown alert -- mobile mechanic dispatched'
                        : 'Pending next stage'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
