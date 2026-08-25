'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Opportunity,
  SpatialMatch,
  getSpatialMatches,
  getOpportunityTree,
  triggerLogisticsCascade,
  createVehicleDriverPairing,
  generateWayManifest,
  uploadProofOfLoading,
  uploadProofOfDelivery,
  searchAutoParts,
  checkoutAutoPart,
  reportSOSIncident,
  settleEscrowTree,
  updateOpportunityStatus,
  OpportunityTreeNode,
  PartsInventoryItem,
  WayManifest,
} from '@/lib/api';
import OpportunityTreeVisualizer from '@/components/OpportunityTreeVisualizer';
import {
  ArrowLeft,
  MapPin,
  Tag,
  ShieldCheck,
  Clock,
  CheckCircle,
  XCircle,
  Truck,
  UserCheck,
  AlertTriangle,
  Wrench,
  Package,
  FileText,
  QrCode,
  DollarSign,
  Layers,
  Sparkles,
  RefreshCw,
  Send,
  Navigation,
  Check,
  ShoppingBag,
  PhoneCall,
  User,
  CheckCircle2,
  Radio,
  Calendar,
  MessageSquare,
} from 'lucide-react';

interface OpportunityDetailClientProps {
  initialOpp: Opportunity;
}

export default function OpportunityDetailClient({ initialOpp }: OpportunityDetailClientProps) {
  const [opp, setOpp] = useState<Opportunity>(initialOpp);
  const [matches, setMatches] = useState<SpatialMatch[]>([]);
  const [treeData, setTreeData] = useState<OpportunityTreeNode | null>(null);
  const [matchedOpp, setMatchedOpp] = useState<Opportunity | null>(null);

  // View Perspective Toggle: BUYER (Ajio/Myntra Order Tracking) vs PROVIDER (Logistics Console)
  const [viewMode, setViewMode] = useState<'BUYER' | 'PROVIDER'>('BUYER');

  // Workflow state variables
  const [statusMessage, setStatusMessage] = useState<string>('Ready: Match Need with Offer or start Logistics cascade.');
  const [loadingAction, setLoadingAction] = useState<boolean>(false);
  const [manifest, setManifest] = useState<WayManifest | null>(null);
  const [partsList, setPartsList] = useState<PartsInventoryItem[]>([]);
  const [selectedPart, setSelectedPart] = useState<PartsInventoryItem | null>(null);
  const [sosActive, setSosActive] = useState<boolean>(false);
  const [escrowSettled, setEscrowSettled] = useState<boolean>(false);

  // Form inputs
  const [polPhotoUrl, setPolPhotoUrl] = useState<string>('/uploads/pol_photo_truck.jpg');
  const [podQr, setPodQr] = useState<string>('POD-QR-CHOUTUPPAL-8989');
  const [podSigUrl, setPodSigUrl] = useState<string>('/uploads/pod_signature.png');
  const [sosDescription, setSosDescription] = useState<string>('Burnt clutch plate failure on NH65 shoulder');

  useEffect(() => {
    async function loadInitialData() {
      const spatialMatches = await getSpatialMatches(opp.id);
      setMatches(spatialMatches);
      refreshTree();
    }
    loadInitialData();
  }, [opp.id]);

  const refreshTree = async () => {
    const tree = await getOpportunityTree(opp.id);
    if (tree) {
      setTreeData(tree);
      if (tree.manifest) {
        setManifest(tree.manifest);
      }
    }
  };

  // Provider Review Actions: Accept Order
  const handleAcceptOrder = async () => {
    setLoadingAction(true);
    try {
      const updated = await updateOpportunityStatus(opp.id, 'ACCEPTED');
      if (updated) {
        setOpp(updated);
      } else {
        setOpp((prev) => ({ ...prev, status: 'ACCEPTED' }));
      }
      setStatusMessage('Order Accepted! Opportunity status set to ACCEPTED. Logistics Workflow Console Unlocked.');
    } catch (err: any) {
      setOpp((prev) => ({ ...prev, status: 'ACCEPTED' }));
      setStatusMessage('Order Accepted. Status: ACCEPTED.');
    } finally {
      setLoadingAction(false);
    }
  };

  // Provider Review Actions: Reject Order
  const handleRejectOrder = async () => {
    setLoadingAction(true);
    try {
      const updated = await updateOpportunityStatus(opp.id, 'REJECTED');
      if (updated) {
        setOpp(updated);
      } else {
        setOpp((prev) => ({ ...prev, status: 'REJECTED' }));
      }
      setStatusMessage('Order Declined. Opportunity has been rejected by provider.');
    } catch (err: any) {
      setOpp((prev) => ({ ...prev, status: 'REJECTED' }));
      setStatusMessage('Order Declined.');
    } finally {
      setLoadingAction(false);
    }
  };

  // Step 1: Accept / Connect Match
  const handleAcceptMatch = async (match: SpatialMatch) => {
    setLoadingAction(true);
    try {
      setStatusMessage(`Matched successfully with ${match.matched_user?.full_name || 'Provider'}. Opportunity status set to IN_PROGRESS.`);
      await updateOpportunityStatus(opp.id, 'IN_PROGRESS');
      setOpp((prev) => ({ ...prev, status: 'IN_PROGRESS' }));
    } catch (err: any) {
      setStatusMessage(`Match failed: ${err.message}`);
    } finally {
      setLoadingAction(false);
    }
  };

  // Step 2: Request Transport (Child Opportunity)
  const handleSpawnTransport = async () => {
    setLoadingAction(true);
    setStatusMessage('Spawning Logistical Transport requirement node...');
    try {
      const child = await triggerLogisticsCascade({
        root_opportunity_id: opp.id,
        cascade_type: 'TRANSPORT',
        lat: opp.lat,
        lng: opp.lng,
      });
      await refreshTree();
      setStatusMessage(`Transport Requirement Node Created (${child.title}). Linked to Parent ID #${opp.id}.`);
    } catch (err: any) {
      setStatusMessage(`Transport cascade error: ${err.message}`);
    } finally {
      setLoadingAction(false);
    }
  };

  // Step 3: Vehicle & Driver Pairing + Way Manifest & PoL
  const handleAssignDriverAndManifest = async () => {
    setLoadingAction(true);
    setStatusMessage('Pairing Tata 12-Wheeler Truck & Commercial Driver Suresh (Class-A)...');
    try {
      await createVehicleDriverPairing({
        vehicle_id: opp.id,
        driver_id: opp.user_id,
        license_number: 'DL-TS09-2026-8899',
        license_class: 'CLASS-A',
      });

      const m = await generateWayManifest({ opportunity_id: opp.id });
      setManifest(m);

      const polManifest = await uploadProofOfLoading(opp.id, polPhotoUrl);
      setManifest(polManifest);
      setOpp((prev) => ({ ...prev, status: 'ENROUTE' }));

      await refreshTree();
      setStatusMessage('Driver & Vehicle Paired. Way Manifest & Proof of Loading (PoL) verified! Status: ENROUTE.');
    } catch (err: any) {
      setStatusMessage(`Driver pairing / Manifest error: ${err.message}`);
    } finally {
      setLoadingAction(false);
    }
  };

  // Step 4: SOS Breakdown Incident
  const handleTriggerSOS = async () => {
    setLoadingAction(true);
    setStatusMessage('Registering Vehicle Breakdown Incident...');
    try {
      await reportSOSIncident({
        opportunity_id: opp.id,
        description: sosDescription,
        lat: opp.lat,
        lng: opp.lng,
      });
      await updateOpportunityStatus(opp.id, 'VEHICLE_PROBLEM');
      setSosActive(true);
      setOpp((prev) => ({ ...prev, status: 'VEHICLE_PROBLEM' }));
      await refreshTree();
      setStatusMessage(`Vehicle Problem Reported! Customer notified: "Delivery delayed due to a vehicle issue."`);
    } catch (err: any) {
      setOpp((prev) => ({ ...prev, status: 'VEHICLE_PROBLEM' }));
      setStatusMessage(`Vehicle Problem Registered.`);
    } finally {
      setLoadingAction(false);
    }
  };

  // Step 5: Search Spare Parts
  const handleSearchParts = async () => {
    setLoadingAction(true);
    setStatusMessage('Searching Krishna Spares for Tata Clutch Plate #TC-990...');
    try {
      const items = await searchAutoParts('TC-990');
      setPartsList(items);
      if (items.length > 0) {
        setSelectedPart(items[0]);
        setStatusMessage(`Found ${items.length} matching auto parts in catalog. Selected: ${items[0].part_name} (₹${items[0].unit_price}).`);
      } else {
        setStatusMessage('No parts found in search.');
      }
    } catch (err: any) {
      setStatusMessage(`Parts search error: ${err.message}`);
    } finally {
      setLoadingAction(false);
    }
  };

  // Step 6: Checkout Spare Part & Micro-Escrow
  const handleCheckoutPart = async () => {
    setLoadingAction(true);
    setStatusMessage('Checking out Clutch Plate #TC-990 and logging Micro-Escrow entry...');
    try {
      await checkoutAutoPart({
        part_id: selectedPart?.id || '',
        root_id: opp.id,
      });
      await refreshTree();
      setStatusMessage('Auto Part Checked Out! Micro-Escrow Ledger Entry Logged (Status: HELD).');
    } catch (err: any) {
      setStatusMessage(`Checkout error: ${err.message}`);
    } finally {
      setLoadingAction(false);
    }
  };

  // Step 7: Complete Repair & Resume Transport
  const handleCompleteRepair = async () => {
    setLoadingAction(true);
    setStatusMessage('Repair completed. Resuming transport...');
    try {
      await updateOpportunityStatus(opp.id, 'IN_TRANSIT_AGAIN');
      setSosActive(false);
      setOpp((prev) => ({ ...prev, status: 'IN_TRANSIT_AGAIN' }));
      await refreshTree();
      setStatusMessage('Issue Resolved! Customer notified: "Vehicle issue resolved. Delivery is back on the way."');
    } catch (err: any) {
      setOpp((prev) => ({ ...prev, status: 'IN_TRANSIT_AGAIN' }));
      setStatusMessage('Issue Resolved! Resumed transport.');
    } finally {
      setLoadingAction(false);
    }
  };

  // Step 8: Upload Proof of Delivery (PoD) & Settle Escrow
  const handleUploadPOD = async () => {
    setLoadingAction(true);
    setStatusMessage('Uploading Proof of Delivery (PoD) QR & Signature...');
    try {
      const updatedManifest = await uploadProofOfDelivery(opp.id, podQr, podSigUrl);
      setManifest(updatedManifest);

      await settleEscrowTree(opp.id);
      setEscrowSettled(true);
      setOpp((prev) => ({ ...prev, status: 'COMPLETED' }));

      await refreshTree();
      setStatusMessage('Proof of Delivery (PoD) Verified! Root Opportunity COMPLETED. Multi-tier Escrow Ledger Cleared & Settled.');
    } catch (err: any) {
      setStatusMessage(`PoD / Escrow error: ${err.message}`);
    } finally {
      setLoadingAction(false);
    }
  };

  const isPendingReview = opp.status === 'OPEN' || opp.status === 'MATCHED' || opp.status === 'PENDING';
  const isRejected = opp.status === 'REJECTED' || opp.status === 'DECLINED';
  const isAccepted = ['ACCEPTED', 'IN_PROGRESS', 'DISPATCHED', 'ENROUTE', 'INCIDENT_SUSPENDED', 'ARRIVED', 'COMPLETED'].includes(opp.status);

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 px-6 py-12">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Navigation & Perspective Switcher Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/opportunities" className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Opportunities</span>
          </Link>

          {/* Perspective View Mode Switcher */}
          <div className="p-1.5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center gap-1.5 shadow-lg">
            <button
              onClick={() => setViewMode('BUYER')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                viewMode === 'BUYER'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              <span>🛒 Buyer Order Tracking</span>
            </button>

            <button
              onClick={() => setViewMode('PROVIDER')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                viewMode === 'PROVIDER'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Truck className="w-4 h-4" />
              <span>🚚 Provider & Logistics Console</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 1. BUYER / CUSTOMER CONSUMER ORDER TRACKING VIEW                         */}
        {/* ========================================================================= */}
        {viewMode === 'BUYER' && (() => {
          const meta = opp.metadata || {};
          const cf = meta.custom_fields || {};
          const rawQuantity = meta.quantity 
            ?? cf.quantity 
            ?? meta.quantity_bags 
            ?? cf.quantity_bags 
            ?? meta.cargo_weight_tons 
            ?? cf.cargo_weight_tons 
            ?? meta.farm_area_acres 
            ?? cf.farm_area_acres
            ?? meta.quantity_needed;

          let displayQty = '4,000';
          if (rawQuantity !== undefined && rawQuantity !== null && rawQuantity !== '') {
            const num = Number(rawQuantity);
            displayQty = !isNaN(num) ? num.toLocaleString('en-IN') : String(rawQuantity);
          }
          const catName = opp.category?.name || meta.category_name || 'Bricks';

          return (
          <div className="space-y-6">
            {/* TOP AREA Header Card */}
            <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 space-y-4 shadow-2xl bg-gradient-to-br from-slate-900 via-slate-950 to-blue-950/30">
              <div className="space-y-1">
                <span className="px-3 py-1 rounded-lg text-xs font-extrabold font-mono uppercase bg-blue-500/15 text-blue-400 border border-blue-500/30">
                  Order #UOP-{opp.id.slice(0, 8).toUpperCase()}
                </span>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-white pt-2">
                  {displayQty} {catName}
                </h1>
                <div className="text-sm font-bold text-slate-300 flex items-center gap-2 pt-1">
                  <span className="text-slate-500 font-semibold uppercase text-xs">Delivering to:</span>
                  <MapPin className="w-4 h-4 text-rose-400 shrink-0" />
                  <span className="text-slate-100">{opp.address_text || 'Choutuppal, Telangana'}</span>
                </div>
              </div>
            </div>

            {/* ORDER SUMMARY CARD */}
            <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 space-y-4 shadow-xl bg-slate-900/90">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-base font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-5 h-5 text-emerald-400" />
                  <span>ORDER SUMMARY</span>
                </h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-slate-500 font-bold uppercase text-[10px] block">Service</span>
                  <span className="text-white font-extrabold text-sm">{catName}</span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-slate-500 font-bold uppercase text-[10px] block">Quantity</span>
                  <span className="text-emerald-400 font-extrabold text-sm">{displayQty} units</span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-slate-500 font-bold uppercase text-[10px] block">Deliver To</span>
                  <span className="text-slate-200 font-bold truncate block">{opp.address_text || 'Choutuppal, Telangana'}</span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-slate-500 font-bold uppercase text-[10px] block">Status</span>
                  <span className="text-blue-300 font-bold font-mono uppercase block">{opp.status === 'OPEN' ? 'Order Placed' : opp.status}</span>
                </div>
              </div>
            </div>

            {/* VISUAL PROGRESS TRACKER (ORDER STATUS) */}
            <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 space-y-6 shadow-xl bg-slate-900/90">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-base font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-blue-400" />
                  <span>ORDER STATUS</span>
                </h3>
              </div>

              {/* 7-Step Visual Progress Stepper */}
              <div className="space-y-3">
                {[
                  { label: 'Order Placed', isDone: true, isCurrent: opp.status === 'OPEN' || opp.status === 'ORDER_PLACED' },
                  { label: 'Provider Accepted', isDone: isAccepted, isCurrent: opp.status === 'ACCEPTED' || opp.status === 'PROVIDER_ACCEPTED' },
                  { label: 'Preparing / Processing', isDone: ['DISPATCHED', 'VEHICLE_ASSIGNED', 'IN_TRANSIT', 'ENROUTE', 'VEHICLE_PROBLEM', 'IN_TRANSIT_AGAIN', 'OUT_FOR_DELIVERY', 'ARRIVED', 'DELIVERED', 'COMPLETED'].includes(opp.status), isCurrent: ['ORDER_CONFIRMED', 'PREPARING', 'PROCESSING'].includes(opp.status) },
                  { label: 'Dispatched', isDone: ['IN_TRANSIT', 'ENROUTE', 'VEHICLE_PROBLEM', 'IN_TRANSIT_AGAIN', 'OUT_FOR_DELIVERY', 'ARRIVED', 'DELIVERED', 'COMPLETED'].includes(opp.status), isCurrent: ['DISPATCHED', 'VEHICLE_ASSIGNED', 'DRIVER_ASSIGNED'].includes(opp.status) },
                  { label: 'In Transit', isDone: ['OUT_FOR_DELIVERY', 'ARRIVED', 'DELIVERED', 'COMPLETED'].includes(opp.status), isCurrent: ['IN_TRANSIT', 'ENROUTE', 'VEHICLE_PROBLEM', 'IN_TRANSIT_AGAIN', 'ISSUE_RESOLVED'].includes(opp.status) },
                  { label: 'Out for Delivery', isDone: ['DELIVERED', 'COMPLETED'].includes(opp.status), isCurrent: ['OUT_FOR_DELIVERY', 'ARRIVED'].includes(opp.status) },
                  { label: 'Delivered', isDone: ['DELIVERED', 'COMPLETED'].includes(opp.status), isCurrent: opp.status === 'COMPLETED' || opp.status === 'DELIVERED' },
                ].map((step, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-all ${
                      step.isCurrent
                        ? 'bg-blue-600/20 border-blue-500 text-white shadow-lg shadow-blue-600/20 font-bold scale-[1.01]'
                        : step.isDone
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-semibold'
                        : 'bg-slate-950 border-slate-800/80 text-slate-500'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      step.isCurrent
                        ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30'
                        : step.isDone
                        ? 'bg-emerald-500 text-slate-950 font-extrabold'
                        : 'bg-slate-800 text-slate-500'
                    }`}>
                      {step.isDone ? '✓' : step.isCurrent ? '●' : '○'}
                    </div>

                    <div className="flex-1 flex items-center justify-between">
                      <span className="text-sm">{step.label}</span>
                      {step.isCurrent && (
                        <span className="px-2.5 py-0.5 rounded-md bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] uppercase font-mono font-bold tracking-wider">
                          Active Step
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Friendly Vehicle Problem Alert Banners */}
              {['VEHICLE_PROBLEM', 'INCIDENT_SUSPENDED'].includes(opp.status) && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center gap-3 text-xs font-bold shadow-lg">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 animate-bounce" />
                  <div>
                    <div className="text-sm font-extrabold text-amber-200">Delivery delayed due to a vehicle issue.</div>
                    <div className="text-[11px] font-normal text-amber-300/80 mt-0.5">Emergency roadside mechanics have been dispatched. We will update you as soon as travel resumes.</div>
                  </div>
                </div>
              )}

              {['IN_TRANSIT_AGAIN', 'ISSUE_RESOLVED', 'REPAIR_COMPLETED'].includes(opp.status) && (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-3 text-xs font-bold shadow-lg">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <div className="text-sm font-extrabold text-emerald-200">Vehicle issue resolved. Delivery is back on the way.</div>
                    <div className="text-[11px] font-normal text-emerald-300/80 mt-0.5">Driver has resumed transit towards your delivery location.</div>
                  </div>
                </div>
              )}
            </div>

            {/* EXPECTED DELIVERY CARD */}
            <div className="glass-panel p-6 rounded-3xl border border-slate-800 bg-slate-900/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">EXPECTED DELIVERY</span>
                <div className="text-xl sm:text-2xl font-extrabold text-blue-400">
                  {opp.scheduled_start 
                    ? `Expected by: ${new Date(opp.scheduled_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, 6 PM`
                    : 'Today, 6:30 PM'}
                </div>
              </div>
              <div className="px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-bold flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                <span>On Schedule</span>
              </div>
            </div>

            {/* DELIVERY / SERVICE PROVIDER CARD */}
            <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 space-y-5 shadow-xl bg-slate-900/90">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-base font-extrabold text-white uppercase tracking-wider">
                  DELIVERY / SERVICE PROVIDER
                </h3>
              </div>

              {isAccepted ? (
                <div className="space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-950 border border-slate-800">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center font-extrabold text-emerald-300 text-lg">
                        {(opp.user?.full_name || 'Rajesh Logistics')[0]}
                      </div>
                      <div>
                        <h4 className="text-base font-extrabold text-white">{opp.user?.full_name || 'Rajesh Logistics Services'}</h4>
                        <p className="text-xs text-slate-400">{(opp.user as any)?.company_name || 'Choutuppal Building Supplies Co.'}</p>
                        <div className="text-xs text-slate-300 font-mono mt-1 font-bold">
                          Phone: <span className="text-emerald-400">{opp.user?.phone || '+91 98765 43210'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={`tel:${opp.user?.phone || '+919876543210'}`}
                        className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/25 transition-all"
                      >
                        <PhoneCall className="w-4 h-4" />
                        <span>Call</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => alert(`Message sent to provider ${opp.user?.full_name || 'Rajesh Logistics Services'}`)}
                        className="px-4 py-2.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 font-bold text-xs flex items-center gap-2 transition-all"
                      >
                        <MessageSquare className="w-4 h-4 text-blue-400" />
                        <span>Message</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800/80 text-center space-y-2">
                  <Clock className="w-7 h-7 text-amber-400 mx-auto animate-pulse" />
                  <div className="text-sm font-bold text-slate-200">
                    Waiting for a service provider to accept your request.
                  </div>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Nearby verified providers have been notified. Provider contact details will be revealed here as soon as an offer is accepted.
                  </p>
                </div>
              )}
            </div>
          </div>
          );
        })()}

        {/* ========================================================================= */}
        {/* 2. PROVIDER & LOGISTICS CONSOLE VIEW                                     */}
        {/* ========================================================================= */}
        {viewMode === 'PROVIDER' && (
          <div className="space-y-8">
            {/* Opportunity Card Header */}
            <div className="glass-panel p-8 rounded-3xl border border-slate-800 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border ${
                    opp.type === 'NEED' 
                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' 
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  }`}>
                    {opp.type} • Workflow: {opp.workflow_model}
                  </span>
                  <span className={`px-3.5 py-1 rounded-full text-xs font-mono font-bold uppercase border ${
                    isAccepted
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      : isRejected
                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                  }`}>
                    Status: {opp.status}
                  </span>
                </div>

                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  Posted on {new Date(opp.created_at).toLocaleDateString()}
                </span>
              </div>

              <div>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-white">{opp.title}</h1>
                <p className="text-slate-300 text-base leading-relaxed mt-3 whitespace-pre-line">{opp.description}</p>
              </div>

              {/* Details Grid */}
              <div className="grid sm:grid-cols-4 gap-4 pt-6 border-t border-slate-800">
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center gap-3">
                  <User className="w-5 h-5 text-blue-400 shrink-0" />
                  <div>
                    <div className="text-xs text-slate-500 uppercase font-semibold">Customer Details</div>
                    <div className="text-sm font-bold text-white">{opp.user?.full_name || 'Customer'}</div>
                    <div className="text-xs text-emerald-400 font-mono font-semibold">{opp.user?.phone || 'N/A'}</div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-rose-400 shrink-0" />
                  <div>
                    <div className="text-xs text-slate-500 uppercase font-semibold">Delivery Location</div>
                    <div className="text-sm font-medium text-slate-200">{opp.address_text || 'Spatial Coordinate'} ({opp.radius_km} km)</div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center gap-3">
                  <Tag className="w-5 h-5 text-blue-400 shrink-0" />
                  <div>
                    <div className="text-xs text-slate-500 uppercase font-semibold">Category</div>
                    <div className="text-sm font-medium text-slate-200">{opp.category?.name || 'General Logistics'}</div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center gap-3">
                  <DollarSign className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <div className="text-xs text-slate-500 uppercase font-semibold">Quantity / Budget</div>
                    <div className="text-sm font-medium text-slate-200">
                      {opp.metadata?.quantity || opp.metadata?.custom_fields?.quantity || '4,000'} units
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ORDER DETAILS REVIEW (VISIBLE BEFORE ACCEPTANCE) */}
            {isPendingReview && (
              <div className="glass-panel p-8 rounded-3xl border border-blue-500/40 space-y-6 shadow-2xl bg-gradient-to-br from-slate-900/90 via-blue-950/20 to-slate-900">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div>
                    <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      SERVICE REQUEST REVIEW
                    </span>
                    <h2 className="text-2xl font-extrabold text-white mt-2">ORDER DETAILS</h2>
                    <p className="text-xs text-slate-400 mt-1">Review customer order details before deciding to accept or decline.</p>
                  </div>
                  {loadingAction && <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin" />}
                </div>

                {/* Provider Capability & Eligibility Match Badges */}
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                  <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Verified Provider</span>
                  </span>
                  <span className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-blue-400" />
                    <span>Capability Matched ({opp.category?.name || opp.metadata?.category_name || 'Category Matched'})</span>
                  </span>
                  <span className="px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-purple-400" />
                    <span>Asset Available</span>
                  </span>
                </div>

                {/* Structured Order Details Summary */}
                <div className="space-y-4 bg-[#090d16] border border-slate-800 p-5 rounded-2xl text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                      <span className="text-slate-500 font-bold uppercase text-[10px] block">Customer</span>
                      <span className="text-white font-extrabold text-sm">{opp.user?.full_name || opp.metadata?.customer_details?.name || 'Customer'}</span>
                      <span className="text-emerald-400 font-mono font-bold block text-xs">{opp.user?.phone || opp.metadata?.customer_details?.phone || 'N/A'}</span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                      <span className="text-slate-500 font-bold uppercase text-[10px] block">Service Request</span>
                      <span className="text-white font-extrabold text-sm">{opp.title}</span>
                      <span className="text-blue-400 text-[11px] font-semibold block">{opp.category?.name || opp.metadata?.category_name}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                      <span className="text-slate-500 font-bold uppercase text-[10px] block">Pickup / Source Location</span>
                      <span className="text-amber-300 font-bold text-xs">{opp.metadata?.pickup_location || 'Source Yard / Dispatch Point'}</span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                      <span className="text-slate-500 font-bold uppercase text-[10px] block">Delivery Location</span>
                      <span className="text-slate-100 font-bold text-xs">{opp.address_text || opp.metadata?.delivery_location || 'Delivery Site'}</span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                      <span className="text-slate-500 font-bold uppercase text-[10px] block">Exact Quantity</span>
                      <span className="text-emerald-400 font-extrabold text-sm font-mono">
                        {opp.metadata?.quantity || opp.metadata?.custom_fields?.quantity || opp.metadata?.custom_fields?.quantity_bags || '1'} units
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                      <span className="text-slate-500 font-bold uppercase text-[10px] block">Required Date / Time</span>
                      <span className="text-blue-300 font-bold">
                        {opp.scheduled_start ? new Date(opp.scheduled_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Flexible / Immediate'}
                      </span>
                    </div>
                  </div>

                  {/* Relevant Dynamic Fields Specifications */}
                  {opp.metadata?.custom_fields && Object.keys(opp.metadata.custom_fields).length > 0 && (
                    <div className="pt-3 border-t border-slate-800/80 space-y-2">
                      <span className="text-slate-400 font-bold uppercase text-[10px] block">Relevant Category Specifications</span>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {Object.entries(opp.metadata.custom_fields).map(([k, v]) => (
                          <div key={k} className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                            <span className="text-slate-500 text-[10px] uppercase block">{k.replace(/_/g, ' ')}</span>
                            <span className="text-slate-200 font-bold font-mono">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Accept Request / Decline Action Bar */}
                <div className="flex gap-4 pt-2">
                  <button
                    onClick={handleRejectOrder}
                    disabled={loadingAction}
                    className="w-1/2 py-3.5 rounded-xl border border-slate-800 text-slate-300 hover:text-white font-bold text-xs flex items-center justify-center gap-2 transition-all hover:bg-slate-900"
                  >
                    <XCircle className="w-4 h-4 text-slate-400" />
                    <span>Decline</span>
                  </button>

                  <button
                    onClick={handleAcceptOrder}
                    disabled={loadingAction}
                    className="w-1/2 py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/30"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Accept Request</span>
                  </button>
                </div>
              </div>
            )}

            {/* LOGISTICS CHAIN WORKFLOW CONSOLE (AFTER ACCEPTANCE) */}
            {isAccepted && (
              <div className="glass-panel p-8 rounded-3xl border border-slate-800 space-y-8">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div>
                    <span className="px-3 py-1 rounded-full text-[10px] font-bold font-mono uppercase bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                      ORDER ACCEPTED • Active Logistics Workflow
                    </span>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2 mt-2">
                      <Layers className="w-5 h-5 text-indigo-400" />
                      <span>Scenario 1 Logistics Workflow Console</span>
                    </h2>
                  </div>
                  {loadingAction && <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />}
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs font-mono text-blue-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping shrink-0" />
                  <span>{statusMessage}</span>
                </div>

                {/* Logistics Action Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <button
                    onClick={handleSpawnTransport}
                    disabled={loadingAction}
                    className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-blue-500 text-left transition-all group"
                  >
                    <div className="flex items-center gap-2 text-blue-400 text-xs font-bold uppercase mb-1">
                      <Truck className="w-4 h-4" />
                      <span>Step 1: Transport</span>
                    </div>
                    <div className="font-bold text-white text-sm group-hover:text-blue-400 transition-colors">Request Transport</div>
                    <div className="text-xs text-slate-500 mt-1">Spawns transport child node</div>
                  </button>

                  <button
                    onClick={handleAssignDriverAndManifest}
                    disabled={loadingAction}
                    className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-emerald-500 text-left transition-all group"
                  >
                    <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase mb-1">
                      <UserCheck className="w-4 h-4" />
                      <span>Step 2: Driver & PoL</span>
                    </div>
                    <div className="font-bold text-white text-sm group-hover:text-emerald-400 transition-colors">Pair Driver & Upload PoL</div>
                    <div className="text-xs text-slate-500 mt-1">Way Manifest + PoL Photo</div>
                  </button>

                  <button
                    onClick={handleTriggerSOS}
                    disabled={loadingAction || sosActive}
                    className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-rose-500 text-left transition-all group"
                  >
                    <div className="flex items-center gap-2 text-rose-400 text-xs font-bold uppercase mb-1">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Step 3: Breakdown SOS</span>
                    </div>
                    <div className="font-bold text-white text-sm group-hover:text-rose-400 transition-colors">Trigger Highway SOS</div>
                    <div className="text-xs text-slate-500 mt-1">Suspends transport & spawns repair</div>
                  </button>

                  <button
                    onClick={handleSearchParts}
                    disabled={loadingAction}
                    className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-amber-500 text-left transition-all group"
                  >
                    <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase mb-1">
                      <Package className="w-4 h-4" />
                      <span>Step 4: Spare Parts</span>
                    </div>
                    <div className="font-bold text-white text-sm group-hover:text-amber-400 transition-colors">Search Clutch #TC-990</div>
                    <div className="text-xs text-slate-500 mt-1">Queries Krishna Spares catalog</div>
                  </button>

                  <button
                    onClick={async () => {
                      await handleCheckoutPart();
                      await handleCompleteRepair();
                    }}
                    disabled={loadingAction}
                    className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-purple-500 text-left transition-all group"
                  >
                    <div className="flex items-center gap-2 text-purple-400 text-xs font-bold uppercase mb-1">
                      <Wrench className="w-4 h-4" />
                      <span>Step 5: Repair & Resume</span>
                    </div>
                    <div className="font-bold text-white text-sm group-hover:text-purple-400 transition-colors">Checkout & Complete Repair</div>
                    <div className="text-xs text-slate-500 mt-1">Micro-Escrow + Resume Transport</div>
                  </button>

                  <button
                    onClick={handleUploadPOD}
                    disabled={loadingAction || escrowSettled}
                    className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-teal-500 text-left transition-all group"
                  >
                    <div className="flex items-center gap-2 text-teal-400 text-xs font-bold uppercase mb-1">
                      <QrCode className="w-4 h-4" />
                      <span>Step 6: PoD & Escrow</span>
                    </div>
                    <div className="font-bold text-white text-sm group-hover:text-teal-400 transition-colors">Upload PoD & Settle Tree</div>
                    <div className="text-xs text-slate-500 mt-1">QR verification + Escrow release</div>
                  </button>
                </div>

                {/* Opportunity Tree Visualizer */}
                <div className="space-y-4 pt-4 border-t border-slate-800">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Layers className="w-5 h-5 text-blue-400" />
                    <span>Opportunity Ancestry Graph Tree</span>
                  </h2>
                  <OpportunityTreeVisualizer tree={treeData} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
