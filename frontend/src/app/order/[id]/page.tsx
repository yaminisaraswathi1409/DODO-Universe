'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getOpportunityByID, getOpportunityTree, generateDeliveryOTP, Opportunity, OpportunityTreeNode } from '@/lib/api';
import { CheckCircle2, Clock, MapPin, Phone, MessageSquare, Truck, ShieldCheck, Wrench, AlertTriangle, ArrowLeft, RefreshCw, User, Package, Calendar, QrCode, FileText, Camera, Check, Shield } from 'lucide-react';
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
  const [customerDeliveryOtp, setCustomerDeliveryOtp] = useState<string | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);

  const fetchCustomerOTP = async () => {
    if (!orderId) return;
    setOtpLoading(true);
    try {
      const code = await generateDeliveryOTP(orderId);
      if (code) {
        setCustomerDeliveryOtp(code);
      }
    } catch (err: any) {
      console.warn('Customer delivery OTP fetch error:', err.message);
    } finally {
      setOtpLoading(false);
    }
  };

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => {
    if (opp) {
      const st = opp.status;
      if (st === 'IN_TRANSIT' || st === 'IN_TRANSIT_AGAIN' || st === 'OUT_FOR_DELIVERY' || st === 'DELIVERED') {
        if (!customerDeliveryOtp && !otpLoading) {
          fetchCustomerOTP();
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opp?.status]);

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
  const status = opp.status;

  // Check for Incident / Repair sub-tasks in tree internally
  let hasIncident = false;
  let isRepairCompleted = false;
  let manifest = tree?.manifest || null;

  if (tree) {
    if (tree.incident) hasIncident = true;
    if (tree.children && tree.children.length > 0) {
      for (const childNode of tree.children) {
        if (childNode.incident) hasIncident = true;
        if (childNode.manifest && !manifest) manifest = childNode.manifest;
        if (childNode.opportunity?.status === 'REPAIR_COMPLETED' || childNode.opportunity?.status === 'COMPLETED') {
          isRepairCompleted = true;
        }
      }
    }
  }

  // Delivery OTP (Generated securely on server, viewable by recipient customer)
  const deliveryOtp = customerDeliveryOtp || meta.delivery_otp || null;

  // Construct Visual E-Commerce Progress Timeline for Phase 6
  const getTimelineSteps = (): TimelineStep[] => {
    const isCompleted = status === 'COMPLETED';
    const isDelivered = status === 'DELIVERED' || isCompleted;
    const isOutForDelivery = status === 'OUT_FOR_DELIVERY' || isDelivered;
    const isInTransit = status === 'IN_TRANSIT' || status === 'IN_TRANSIT_AGAIN' || isOutForDelivery;
    const isPickupVerified = status === 'PICKUP_VERIFIED' || isInTransit;
    const isReadyPickup = status === 'READY_FOR_PICKUP' || isPickupVerified;
    const isPreparing = status === 'FULFILMENT_PREPARATION' || status === 'PREPARING' || status === 'RESOURCE_ARRANGEMENT' || status === 'LOGISTICS_CONFIRMED' || isReadyPickup;
    const isVendorAccepted = status === 'VENDOR_ACCEPTED' || status === 'ACCEPTED' || isPreparing;

    return [
      { id: '1', label: 'Order Confirmed & Escrow Held', status: 'completed' },
      {
        id: '2',
        label: 'Vendor Accepted & Allocation',
        status: isVendorAccepted ? 'completed' : status === 'ORDER_CONFIRMED' || status === 'VENDOR_REVIEW' ? 'current' : 'pending',
      },
      {
        id: '3',
        label: 'Fulfilment Preparation & Packaging',
        status: isPreparing ? 'completed' : isVendorAccepted ? 'current' : 'pending',
      },
      {
        id: '4',
        label: 'Logistics Ready & Manifest Issued',
        status: isReadyPickup ? 'completed' : isPreparing ? 'current' : 'pending',
      },
      {
        id: '5',
        label: 'Loaded & In Transit',
        status: isInTransit ? 'completed' : isReadyPickup ? 'current' : 'pending',
      },
      ...(hasIncident
        ? [
            { id: 'sos-1', label: 'Vehicle Telemetry Alert / SOS Triggered', status: ('warning' as const) },
            { id: 'sos-2', label: 'Emergency Roadside Assistance Dispatched', status: isRepairCompleted ? ('completed' as const) : ('current' as const) },
            { id: 'sos-3', label: 'Highway Repair Verified & Transit Resumed', status: isRepairCompleted ? ('completed' as const) : ('pending' as const) },
          ]
        : []),
      {
        id: '6',
        label: 'Out for Final Delivery',
        status: isOutForDelivery ? (isDelivered ? 'completed' : 'current') : 'pending',
      },
      {
        id: '7',
        label: 'Delivered (PoD Captured)',
        status: isDelivered ? (isCompleted ? 'completed' : 'current') : 'pending',
      },
      {
        id: '8',
        label: 'OTP Verified & Escrow Settled',
        status: isCompleted ? 'completed' : 'pending',
      },
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

        {/* SOS Breakdown Alert Banner if active incident */}
        {hasIncident && !isRepairCompleted && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 flex items-start gap-3 shadow-sm animate-pulse">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <span className="font-bold text-amber-900 block text-sm">Vehicle Breakdown Detected on Transit Route</span>
              <p className="text-amber-800">
                Automated roadside diagnostics telemetry was received. Mobile mechanic assistance and replacement auto parts have been dispatched. Your shipment is safely paused on the highway shoulder.
              </p>
            </div>
          </div>
        )}

        {/* Customer Secure Delivery OTP Banner (Visible when shipment is approaching or delivered) */}
        {deliveryOtp && status !== 'COMPLETED' && (
          <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-3xl p-6 shadow-lg space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-emerald-200" />
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-100">Digital Handshake Delivery Verification</span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/30 text-emerald-100 text-[10px] font-bold">Single-Use Code</span>
            </div>
            <div>
              <span className="text-xs text-emerald-100 block">Your Secret 6-Digit Delivery OTP:</span>
              <div className="flex items-center justify-between mt-2">
                <div className="text-3xl font-black font-mono tracking-widest text-white">
                  {customerDeliveryOtp || deliveryOtp}
                </div>
                <button
                  type="button"
                  onClick={fetchCustomerOTP}
                  disabled={otpLoading}
                  className="px-3.5 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
                  title="If delivery attempts failed or were locked out, click to generate a fresh secure OTP"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${otpLoading ? 'animate-spin' : ''}`} />
                  <span>Regenerate OTP</span>
                </button>
              </div>
            </div>
            <p className="text-xs text-emerald-100/90 leading-relaxed">
              Share this OTP with the delivery driver <strong>only after inspecting your received cargo</strong> at your delivery address. Driver verification of this code securely completes your order and settles funds from escrow.
            </p>
          </div>
        )}

        {/* Order Summary Hero Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-md space-y-4 relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div>
              <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-900 border border-slate-300 text-xs font-bold uppercase tracking-wider">
                {opp.category?.name || meta.category_name || 'Catalog Fulfilment'}
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
              <span className="text-slate-500 text-[11px] block">Scheduled Delivery</span>
              <span className="text-slate-900 font-semibold">{opp.scheduled_start ? new Date(opp.scheduled_start).toLocaleDateString() : 'Priority Fulfilment'}</span>
            </div>
          </div>
        </div>

        {/* Digital Way Manifest Card (If generated) */}
        {manifest && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-black" />
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">Official Digital Way Manifest</span>
                  <span className="text-sm font-mono font-bold text-slate-900">{manifest.manifest_number}</span>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 text-[11px] font-bold uppercase border border-slate-200">
                {manifest.status}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-slate-500 text-[11px] block">Routing Barcode</span>
                <span className="font-mono text-slate-900 font-semibold">{manifest.routing_barcode}</span>
              </div>
              {manifest.pol_captured_at && (
                <div>
                  <span className="text-slate-500 text-[11px] block">Proof of Loading (PoL)</span>
                  <span className="text-emerald-700 font-bold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Verified
                  </span>
                </div>
              )}
              {manifest.pod_captured_at && (
                <div>
                  <span className="text-slate-500 text-[11px] block">Proof of Delivery (PoD)</span>
                  <span className="text-emerald-700 font-bold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Captured
                  </span>
                </div>
              )}
            </div>

            {/* Proof of Loading Photo Preview if available */}
            {manifest.pol_photo_url && (
              <div className="pt-2 border-t border-slate-100">
                <span className="text-[11px] text-slate-500 block mb-1 font-semibold flex items-center gap-1">
                  <Camera className="w-3.5 h-3.5" /> Verified Cargo Loading Photo
                </span>
                <img
                  src={manifest.pol_photo_url}
                  alt="Proof of Loading"
                  className="w-full max-h-48 object-cover rounded-xl border border-slate-200"
                />
              </div>
            )}
          </div>
        )}

        {/* Delivery Address & Recipient Card */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2 shadow-sm">
            <span className="text-xs font-bold uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-black" />
              <span>Destination Delivery Location</span>
            </span>
            <p className="text-slate-900 text-sm font-medium">{opp.address_text || meta.delivery_address || 'Customer Delivery Site'}</p>
          </div>

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
                <div className="text-slate-900 text-sm font-bold">{opp.user?.full_name || 'Customer Account'}</div>
                <div className="text-slate-500 text-xs">{opp.user?.phone || 'Verified Customer'}</div>
              </div>
            )}
          </div>
        </div>

        {/* Accepted Vendor / Provider Profile */}
        {opp.status !== 'OPEN' && (() => {
          const assignedProvider = opp.assigned_user || opp.target_vendor;
          const providerName = assignedProvider?.full_name || 'Verified Vendor Partner';
          const providerPhone = assignedProvider?.phone || '';

          return (
            <div className="bg-white border border-slate-300 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3 text-center sm:text-left">
                <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center text-black font-bold text-lg flex-shrink-0">
                  <ShieldCheck className="w-6 h-6 text-black" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-900">Fulfilment Partner</span>
                  <h3 className="text-base font-black text-slate-900">{providerName}</h3>
                  <div className="text-xs text-slate-600 flex items-center gap-2 justify-center sm:justify-start mt-0.5">
                    <span className="text-slate-900 font-bold">★ 4.9 Rating</span>
                    <span>• Verified Vendor</span>
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
                      <span>Call Vendor</span>
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
                  <span className="text-xs text-slate-500 font-medium">Vendor Connected</span>
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
              <span>Fulfilment & Logistics Progress</span>
            </h3>
            <p className="text-slate-600 text-xs">Real-time status tracking across vendor preparation, transit, and delivery handshake.</p>
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
                        ? 'Stage in progress...'
                        : isWarning
                        ? 'Telemetry breakdown alert on route'
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
