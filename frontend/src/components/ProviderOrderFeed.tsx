'use client';

import React, { useState, useEffect } from 'react';
import {
  getPublicOpportunities,
  getMatchingOpportunities,
  getAcceptedOpportunities,
  updateOpportunityStatus,
  getUserServices,
  verifyPharmacyPickup,
  uploadProofOfDelivery,
  triggerLogisticsCascade,
  confirmTransportResources,
  Opportunity,
} from '@/lib/api';
import { CheckCircle2, MapPin, Calendar, Clock, Tag, UserCheck, AlertCircle, RefreshCw, Layers, Wrench, Package, Truck, Eye, X, ArrowRight, Check, Ban, QrCode, Sparkles, ShieldCheck, Phone, Users, Plus, Store } from 'lucide-react';

interface ProviderOrderFeedProps {
  isAcceptedView?: boolean;
}

// Helper to inspect category configuration and metadata choices for an opportunity
const getResourceConfig = (opp: Opportunity) => {
  const cat = opp.category;
  const meta = opp.metadata || {};
  const cf = (opp as any).custom_fields || (meta as any).custom_fields || {};
  const resSelections = meta.resource_selections || {};

  const resourcesList = cat?.resources || [];
  const reqMap: Record<string, any> = (cat?.resource_requirements as any) || {};

  // Check if Admin configured Vehicle for this category
  let isVehicleConfigured = false;
  if (resourcesList && resourcesList.length > 0) {
    isVehicleConfigured = resourcesList.some(
      (r) =>
        (r.key === 'vehicle' || r.name?.toLowerCase().includes('vehicle')) &&
        r.requirement_level !== 'NOT_APPLICABLE' &&
        r.active !== false
    );
  } else if (reqMap && Object.keys(reqMap).length > 0) {
    isVehicleConfigured = reqMap['vehicle'] !== undefined && reqMap['vehicle'] !== 'NOT_APPLICABLE';
  } else {
    // Fallback: check if order explicitly has vehicle selections or submitted details
    isVehicleConfigured =
      Boolean(resSelections.vehicle) ||
      (meta.vehicle_option_code !== undefined && meta.has_vehicle !== undefined) ||
      Boolean(meta.vehicle_details || cf.vehicle_details);
  }

  // Check if Admin configured Driver for this category
  let isDriverConfigured = false;
  if (resourcesList && resourcesList.length > 0) {
    isDriverConfigured = resourcesList.some(
      (r) =>
        (r.key === 'driver' || r.name?.toLowerCase().includes('driver')) &&
        r.requirement_level !== 'NOT_APPLICABLE' &&
        r.active !== false
    );
  } else if (reqMap && Object.keys(reqMap).length > 0) {
    isDriverConfigured = reqMap['driver'] !== undefined && reqMap['driver'] !== 'NOT_APPLICABLE';
  } else {
    // Fallback: check if order explicitly has driver selections or submitted details
    isDriverConfigured =
      Boolean(resSelections.driver) ||
      (meta.driver_option_code !== undefined && meta.has_driver !== undefined) ||
      Boolean(meta.driver_details || cf.driver_details);
  }

  // Customer choices & details
  const vehDetails = meta.vehicle_details || cf.vehicle_details || resSelections.vehicle?.details;
  const drvDetails = meta.driver_details || cf.driver_details || resSelections.driver?.details;

  // Determine whether customer provides or needs vehicle
  let customerHasVeh = false;
  if (resSelections.vehicle) {
    const sel = resSelections.vehicle.selection || resSelections.vehicle.choice;
    customerHasVeh = sel === 'HAS_RESOURCE' || sel === 'HAVE_VEHICLE';
  } else if (meta.has_vehicle !== undefined) {
    customerHasVeh = Boolean(meta.has_vehicle);
  } else if (meta.vehicle_option_code) {
    customerHasVeh = meta.vehicle_option_code === 'HAVE_VEHICLE';
  } else if (vehDetails) {
    customerHasVeh = true;
  }

  // Determine whether customer provides or needs driver
  let customerHasDrv = false;
  if (resSelections.driver) {
    const sel = resSelections.driver.selection || resSelections.driver.choice;
    customerHasDrv = sel === 'HAS_RESOURCE' || sel === 'HAVE_DRIVER';
  } else if (meta.has_driver !== undefined) {
    customerHasDrv = Boolean(meta.has_driver);
  } else if (meta.driver_option_code) {
    customerHasDrv = meta.driver_option_code === 'HAVE_DRIVER';
  } else if (drvDetails) {
    customerHasDrv = true;
  }

  return {
    isVehicleConfigured,
    isDriverConfigured,
    customerHasVeh,
    customerHasDrv,
    vehDetails,
    drvDetails,
  };
};

export default function ProviderOrderFeed({ isAcceptedView = false }: ProviderOrderFeedProps) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewingOpp, setReviewingOpp] = useState<Opportunity | null>(null);
  const [pickupModalOpp, setPickupModalOpp] = useState<Opportunity | null>(null);
  const [deliveryModalOpp, setDeliveryModalOpp] = useState<Opportunity | null>(null);
  const [assignModalOpp, setAssignModalOpp] = useState<Opportunity | null>(null);
  const [assignMode, setAssignMode] = useState<'VEHICLE' | 'DRIVER' | null>(null);
  const [marketplaceModalOpp, setMarketplaceModalOpp] = useState<Opportunity | null>(null);
  const [marketplaceModalType, setMarketplaceModalType] = useState<'VEHICLE' | 'DRIVER' | 'BOTH'>('VEHICLE');
  const [vehForm, setVehForm] = useState({
    vehicle_type: '10-Wheeler Heavy Tipper',
    registration_number: '',
    owner_name: '',
    contact_number: '',
  });
  const [drvForm, setDrvForm] = useState({
    driver_name: '',
    driver_phone: '',
    license_number: '',
  });
  const [mpVehForm, setMpVehForm] = useState({
    vehicle_type: '10-Wheeler Heavy Tipper',
    registration_number: 'TS-09-CB-4492',
    owner_name: 'Choutuppal Fleet Logistics',
    contact_number: '+919849012345',
  });
  const [mpDrvForm, setMpDrvForm] = useState({
    driver_name: 'Ramesh Kumar',
    driver_phone: '+919711194444',
    license_number: 'DL-TEL-2023-8899',
  });
  const [submittingResource, setSubmittingResource] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [marketplaceError, setMarketplaceError] = useState<string | null>(null);
  const assignErrorRef = React.useRef<HTMLDivElement | null>(null);
  const marketplaceErrorRef = React.useRef<HTMLDivElement | null>(null);
  const [qrCodeInput, setQrCodeInput] = useState('');
  const [trustCardInput, setTrustCardInput] = useState('');
  const [verifyingPickup, setVerifyingPickup] = useState(false);
  const [verifyingDelivery, setVerifyingDelivery] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [declinedOppIds, setDeclinedOppIds] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('uop_declined_opps');
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  // Lock background scroll when any vehicle/driver modal is active
  useEffect(() => {
    if ((assignModalOpp && assignMode) || marketplaceModalOpp) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [assignModalOpp, assignMode, marketplaceModalOpp]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      let currentUser = null;
      if (typeof window !== 'undefined') {
        const u = localStorage.getItem('uop_user');
        if (u) currentUser = JSON.parse(u);
      }
      const userIdent = currentUser?.id || currentUser?.phone;

      if (isAcceptedView) {
        const res: any = await getAcceptedOpportunities(userIdent);
        setOpportunities(Array.isArray(res) ? res : (res?.data || []));
      } else {
        const res: any = await getMatchingOpportunities(userIdent);
        let list: Opportunity[] = Array.isArray(res) ? res : (res?.data || []);
        if (list.length === 0) {
          const pub = await getPublicOpportunities('', 'NEED');
          list = (pub.data || []).filter((o: any) => !o.assigned_user_id && o.status !== 'ACCEPTED');
        }
        // Filter out declined requests for this provider
        list = list.filter((o: any) => !declinedOppIds.includes(o.id));
        setOpportunities(list);
      }
    } catch {
      setOpportunities([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeclineOrder = (opp: Opportunity) => {
    const updated = [...declinedOppIds, opp.id];
    setDeclinedOppIds(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('uop_declined_opps', JSON.stringify(updated));
    }
    setReviewingOpp(null);
    setMessage(`Declined order "${opp.title}". It has been removed from your feed and remains available for other providers.`);
    setOpportunities((prev) => prev.filter((o) => o.id !== opp.id));
  };

  useEffect(() => {
    loadRequests();
  }, [isAcceptedView]);

  const handleAcceptOrder = async (opp: Opportunity) => {
    setAcceptingId(opp.id);
    setMessage(null);
    try {
      let currentUser = null;
      if (typeof window !== 'undefined') {
        const u = localStorage.getItem('uop_user');
        if (u) currentUser = JSON.parse(u);
      }

      if (currentUser?.id || currentUser?.phone) {
        const userServices = await getUserServices(currentUser.phone || currentUser.id);
        const matchedService = userServices.find(
          (s) => s.category_id === opp.category_id || s.category?.id === opp.category_id || (opp.category?.slug && s.category?.slug === opp.category?.slug)
        );

        if (!matchedService || matchedService.status !== 'ACTIVE') {
          const catName = opp.category?.name || 'this service category';
          const statusText = matchedService ? `Current status: ${matchedService.status}` : 'Not registered yet';
          alert(
            `Verification Required!\n\nYou must have an ACTIVE & VERIFIED service registration for "${catName}" before accepting customer orders.\n\n${statusText}. Go to Dashboard -> "Services I Provide" to register and upload Admin verification documents.`
          );
          setAcceptingId(null);
          return;
        }
      }

      const userIdent = currentUser?.id || currentUser?.phone;
      await updateOpportunityStatus(opp.id, 'ACCEPTED', userIdent);
      setMessage(`Successfully accepted request: "${opp.title}"! 1 Provider Subscription credit used.`);
      setReviewingOpp(null);
      loadRequests();
    } catch (err: any) {
      alert(`Provider Acceptance Blocked!\n\n${err.message || 'Subscription limit reached or error accepting order'}`);
    } finally {
      setAcceptingId(null);
    }
  };

  const handleAssignVehicleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignModalOpp) return;
    setAssignError(null);

    // Validation check
    if (!vehForm.registration_number.trim() || !vehForm.owner_name.trim() || !vehForm.contact_number.trim()) {
      setAssignError('Please complete all required vehicle details (*).');
      setTimeout(() => {
        assignErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
      return;
    }

    setSubmittingResource(true);
    try {
      let currentUser = null;
      if (typeof window !== 'undefined') {
        const u = localStorage.getItem('uop_user');
        if (u) currentUser = JSON.parse(u);
      }
      const userIdent = currentUser?.id || currentUser?.phone;
      await confirmTransportResources({
        opportunity_id: assignModalOpp.id,
        vehicle: vehForm,
        provider_id: userIdent,
      });
      setMessage(`Vehicle confirmed for Order #${assignModalOpp.id.slice(0, 8)}! Customer has been notified.`);
      setAssignModalOpp(null);
      setAssignMode(null);
      setAssignError(null);
      loadRequests();
    } catch (err: any) {
      setAssignError(err.message || 'Failed to confirm vehicle details. Please verify your connection and try again.');
      setTimeout(() => {
        assignErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    } finally {
      setSubmittingResource(false);
    }
  };

  const handleAssignDriverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignModalOpp) return;
    setAssignError(null);

    // Validation check
    if (!drvForm.driver_name.trim() || !drvForm.driver_phone.trim()) {
      setAssignError('Please fill in required driver name and phone number (*).');
      setTimeout(() => {
        assignErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
      return;
    }

    setSubmittingResource(true);
    try {
      let currentUser = null;
      if (typeof window !== 'undefined') {
        const u = localStorage.getItem('uop_user');
        if (u) currentUser = JSON.parse(u);
      }
      const userIdent = currentUser?.id || currentUser?.phone;
      await confirmTransportResources({
        opportunity_id: assignModalOpp.id,
        driver: drvForm,
        provider_id: userIdent,
      });
      setMessage(`Driver confirmed for Order #${assignModalOpp.id.slice(0, 8)}! Customer has been notified.`);
      setAssignModalOpp(null);
      setAssignMode(null);
      setAssignError(null);
      loadRequests();
    } catch (err: any) {
      setAssignError(err.message || 'Failed to confirm driver details. Please verify your connection and try again.');
      setTimeout(() => {
        assignErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    } finally {
      setSubmittingResource(false);
    }
  };

  const handleBookVehicleMarketplace = (opp: Opportunity) => {
    setMarketplaceModalOpp(opp);
    setMarketplaceModalType('VEHICLE');
    setMarketplaceError(null);
  };

  const handleBookDriverMarketplace = (opp: Opportunity) => {
    setMarketplaceModalOpp(opp);
    setMarketplaceModalType('DRIVER');
    setMarketplaceError(null);
  };

  const handleBookBothMarketplace = (opp: Opportunity) => {
    setMarketplaceModalOpp(opp);
    setMarketplaceModalType('BOTH');
    setMarketplaceError(null);
  };

  const handleConfirmMarketplaceBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!marketplaceModalOpp) return;
    setMarketplaceError(null);

    const isVeh = marketplaceModalType === 'VEHICLE' || marketplaceModalType === 'BOTH';
    const isDrv = marketplaceModalType === 'DRIVER' || marketplaceModalType === 'BOTH';

    if (isVeh && (!mpVehForm.registration_number.trim() || !mpVehForm.owner_name.trim() || !mpVehForm.contact_number.trim())) {
      setMarketplaceError('Please complete all required fleet vehicle fields (*).');
      setTimeout(() => {
        marketplaceErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
      return;
    }

    if (isDrv && (!mpDrvForm.driver_name.trim() || !mpDrvForm.driver_phone.trim())) {
      setMarketplaceError('Please complete all required driver details (*).');
      setTimeout(() => {
        marketplaceErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
      return;
    }

    setSubmittingResource(true);
    try {
      let currentUser = null;
      if (typeof window !== 'undefined') {
        const u = localStorage.getItem('uop_user');
        if (u) currentUser = JSON.parse(u);
      }
      const userIdent = currentUser?.id || currentUser?.phone;

      if (isVeh) {
        await triggerLogisticsCascade({
          root_opportunity_id: marketplaceModalOpp.id,
          cascade_type: 'TRANSPORT',
          parent_user_id: userIdent || marketplaceModalOpp.user_id,
          lat: marketplaceModalOpp.lat,
          lng: marketplaceModalOpp.lng,
        });
      }

      if (isDrv) {
        await triggerLogisticsCascade({
          root_opportunity_id: marketplaceModalOpp.id,
          cascade_type: 'DRIVER',
          parent_user_id: userIdent || marketplaceModalOpp.user_id,
          lat: marketplaceModalOpp.lat,
          lng: marketplaceModalOpp.lng,
        });
      }

      await confirmTransportResources({
        opportunity_id: marketplaceModalOpp.id,
        ...(isVeh ? { vehicle: mpVehForm } : {}),
        ...(isDrv ? { driver: mpDrvForm } : {}),
        provider_id: userIdent,
      });

      setMessage(`Marketplace resource booked & confirmed for Order #${marketplaceModalOpp.id.slice(0, 8)}! Customer notified.`);
      setMarketplaceModalOpp(null);
      setMarketplaceError(null);
      loadRequests();
    } catch (err: any) {
      setMarketplaceError(err.message || 'Failed to confirm marketplace booking. Please try again.');
      setTimeout(() => {
        marketplaceErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    } finally {
      setSubmittingResource(false);
    }
  };


  if (loading) {
    return (
      <div className="py-12 text-center text-slate-400 space-y-3">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-400" />
        <p className="text-xs font-semibold">Loading available provider service requests...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-emerald-400" />
            <span>{isAcceptedView ? 'Accepted Orders Feed' : 'Matching Service Requests'}</span>
          </h3>
          <p className="text-slate-400 text-xs">
            {isAcceptedView
              ? 'Customer orders that you have accepted as a provider.'
              : 'Review incoming matching customer service requests and accept orders.'}
          </p>
        </div>
        <button
          onClick={loadRequests}
          className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-colors"
          title="Refresh Feed"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {message && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-2 shadow-lg">
          <CheckCircle2 className="w-4.5 h-4.5 flex-shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {opportunities.length === 0 ? (
        <div className="p-12 rounded-3xl bg-slate-900/50 border border-slate-800 text-center text-slate-500 text-xs space-y-3">
          <Package className="w-10 h-10 mx-auto text-slate-600" />
          <p>
            {isAcceptedView
              ? 'No accepted orders found. Accept an order from Matching Requests to start servicing.'
              : 'No matching customer service requests found in your area right now.'}
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {opportunities.map((opp: Opportunity) => {
            const meta = opp.metadata || {};
            const cf = meta.custom_fields || {};
            const rawQuantity = meta.quantity ?? cf.quantity ?? meta.quantity_bags ?? cf.quantity_bags ?? meta.cargo_weight_tons ?? cf.cargo_weight_tons ?? meta.farm_area_acres ?? cf.farm_area_acres ?? meta.quantity_needed;
            const quantity = (rawQuantity !== undefined && rawQuantity !== null && rawQuantity !== '') 
              ? (!isNaN(Number(rawQuantity)) ? Number(rawQuantity).toLocaleString('en-IN') : String(rawQuantity)) 
              : 'N/A';

            const categoryName = opp.category?.name || meta.category_name || 'Bricks Required';
            const pickupLoc = meta.pickup_location || meta.source_location || cf.pickup_location || cf.source_location || (opp.category?.slug?.includes('brick') ? 'Choutuppal Yard' : 'Source / Pickup Location');
            const deliveryLoc = opp.address_text || meta.delivery_location || 'Customer Selected Delivery Address';
            const reqDate = opp.scheduled_start 
              ? new Date(opp.scheduled_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
              : '21 Aug 2026';
            const distanceKm = opp.radius_km || 15;
            const isAccepted = ['ACCEPTED', 'PROVIDER_ACCEPTED', 'IN_PROGRESS', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'].includes(opp.status);

            return (
              <div
                key={opp.id}
                className={`border rounded-3xl p-5 shadow-xl transition-all space-y-4 flex flex-col justify-between ${
                  isAccepted
                    ? 'bg-[#0b1424] border-emerald-500/40'
                    : 'bg-[#090d16] border-slate-800 hover:border-emerald-500/40'
                }`}
              >
                <div className="space-y-3">
                  {/* SERVICE REQUEST Header Tag */}
                  <div className="flex items-center justify-between">
                    {opp.order_mode === 'CATALOG_ORDER' ? (
                      <span className="px-3 py-1 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                        <Store className="w-3.5 h-3.5 text-purple-400" />
                        <span>Direct Catalog Order</span>
                      </span>
                    ) : isAccepted ? (
                      <span className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>ACCEPTED</span>
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-extrabold uppercase tracking-wider">
                        GENERAL REQUEST
                      </span>
                    )}

                    <span className="text-xs font-bold text-slate-400 font-mono">
                      Distance: <strong className="text-emerald-400">{distanceKm} km</strong>
                    </span>
                  </div>

                  <div>
                    <h4 className="text-base font-extrabold text-white">{categoryName}</h4>
                    <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{opp.title}</p>
                  </div>
                  {/* BRAND / VENDOR ITEM BREAKDOWN IN ORDER FEED */}
                  {Array.isArray(meta?.brand_items) && meta.brand_items.length > 0 && (
                    <div className="p-3.5 rounded-2xl bg-purple-950/40 border border-purple-500/30 text-xs space-y-2">
                      <div className="flex items-center justify-between font-extrabold text-purple-300 text-[11px] uppercase tracking-wider">
                        <span className="flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-purple-400" />
                          <span>Order Items ({meta.brand_name || 'Your Brand'})</span>
                        </span>
                        <span className="font-mono text-purple-400 font-bold">
                          {meta.brand_items.length} {meta.brand_items.length === 1 ? 'item' : 'items'}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {meta.brand_items.map((it: any, idx: number) => (
                          <div key={idx} className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-2 text-xs">
                            <div>
                              <div className="font-bold text-white text-xs">{it.title}</div>
                              <div className="text-[11px] text-slate-400 font-mono">Qty: {it.quantity || 1} × ₹{(it.unitPrice || 0).toLocaleString()}</div>
                            </div>
                            <div className="text-right font-extrabold font-mono text-purple-400">
                              ₹{((it.totalPrice || (it.unitPrice || 0) * (it.quantity || 1))).toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Clean Important Provider Metrics */}
                  <div className="space-y-2 p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-bold uppercase text-[10px]">Estimated Payout</span>
                      <span className="text-emerald-400 font-extrabold text-sm">
                        Earn {opp.budget_max ? `₹${opp.budget_max}` : '₹40'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-bold uppercase text-[10px]">Estimated Detour</span>
                      <span className="text-amber-400 font-bold font-mono">3 min detour (~1.2 km)</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-bold uppercase text-[10px]">Pickup</span>
                      <span className="text-slate-200 font-medium truncate max-w-[180px]">{pickupLoc}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-bold uppercase text-[10px]">Deliver To</span>
                      <span className="text-slate-200 font-semibold truncate max-w-[180px]">{deliveryLoc}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-bold uppercase text-[10px]">Required By</span>
                      <span className="text-blue-300 font-bold">{reqDate}</span>
                    </div>
                  </div>

                  {/* Status Banner when Accepted / Completed */}
                  {isAccepted && (() => {
                    const vehDetails = meta.vehicle_details || cf.vehicle_details;
                    const drvDetails = meta.driver_details || cf.driver_details;
                    const hasVeh = meta.has_vehicle ?? (vehDetails ? true : false);
                    const hasDrv = meta.has_driver ?? (drvDetails ? true : false);
                    const custPhone = opp.user?.phone || meta.customer_details?.phone;

                    return (
                      <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-800/80 text-xs text-emerald-300 space-y-3">
                        <div className="flex items-center justify-between font-extrabold text-emerald-200">
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span>✓ {opp.status === 'COMPLETED' || opp.status === 'DELIVERED' ? 'Delivery Completed & Settled' : 'Request Accepted'}</span>
                          </span>
                          <span className="font-mono text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30 uppercase font-bold">
                            {opp.status}
                          </span>
                        </div>

                        {/* CUSTOMER CONTACT DETAILS */}
                        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-3 text-xs">
                          <div>
                            <span className="text-slate-400 font-bold uppercase text-[10px] block">CUSTOMER INFORMATION</span>
                            <div className="text-white font-extrabold text-sm">{opp.user?.full_name || meta.customer_details?.name || 'Customer'}</div>
                            <div className="text-slate-400 text-[11px] mt-0.5 flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-rose-400" />
                              <span>{deliveryLoc}</span>
                            </div>
                          </div>
                          {custPhone && (
                            <a
                              href={`tel:${custPhone}`}
                              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/30 shrink-0"
                            >
                              <Phone className="w-3.5 h-3.5" />
                              <span>Call Customer</span>
                            </a>
                          )}
                        </div>

                        {/* DYNAMIC SERVICE RESOURCE ARRANGEMENTS */}
                        {(() => {
                          const {
                            isVehicleConfigured,
                            isDriverConfigured,
                            customerHasVeh,
                            customerHasDrv,
                            vehDetails,
                            drvDetails,
                          } = getResourceConfig(opp);

                          if (!isVehicleConfigured && !isDriverConfigured) {
                            return null;
                          }

                          return (
                            <div className="space-y-3">
                              {/* 1. BOTH VEHICLE & DRIVER PROVIDED BY CUSTOMER */}
                              {isVehicleConfigured && isDriverConfigured && customerHasVeh && customerHasDrv && (
                                <div className="grid sm:grid-cols-2 gap-3 text-xs">
                                  <div className="p-3 rounded-xl bg-slate-900/90 border border-emerald-500/40 space-y-1.5">
                                    <span className="text-emerald-400 font-extrabold uppercase text-[10px] flex items-center gap-1">
                                      <Truck className="w-3.5 h-3.5" /> CUSTOMER VEHICLE
                                    </span>
                                    {typeof vehDetails === 'object' && vehDetails ? (
                                      <div className="space-y-0.5 text-[11px] font-mono text-slate-200">
                                        <div>Type: <strong className="text-white">{vehDetails.vehicle_type || 'Vehicle'}</strong></div>
                                        <div>Reg #: <strong className="text-white">{vehDetails.registration_number || 'N/A'}</strong></div>
                                        <div>Owner: <strong className="text-white">{vehDetails.owner_name || 'N/A'}</strong></div>
                                        {vehDetails.contact_number && (
                                          <div className="pt-1">
                                            <a href={`tel:${vehDetails.contact_number}`} className="text-emerald-400 underline font-bold flex items-center gap-1">
                                              <Phone className="w-3 h-3" /> {vehDetails.contact_number}
                                            </a>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="text-slate-200 font-mono text-xs">{String(vehDetails || 'Customer Vehicle Provided')}</div>
                                    )}
                                  </div>

                                  <div className="p-3 rounded-xl bg-slate-900/90 border border-amber-500/40 space-y-1.5">
                                    <span className="text-amber-400 font-extrabold uppercase text-[10px] flex items-center gap-1">
                                      <UserCheck className="w-3.5 h-3.5" /> CUSTOMER DRIVER
                                    </span>
                                    {typeof drvDetails === 'object' && drvDetails ? (
                                      <div className="space-y-0.5 text-[11px] font-mono text-slate-200">
                                        <div>Name: <strong className="text-white">{drvDetails.driver_name || 'Driver'}</strong></div>
                                        <div>Licence: <strong className="text-white">{drvDetails.license_number || 'N/A'}</strong></div>
                                        {drvDetails.driver_phone && (
                                          <div className="pt-1">
                                            <a href={`tel:${drvDetails.driver_phone}`} className="text-amber-400 underline font-bold flex items-center gap-1">
                                              <Phone className="w-3 h-3" /> {drvDetails.driver_phone}
                                            </a>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="text-slate-200 font-mono text-xs">{String(drvDetails || 'Customer Driver Provided')}</div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* 2. VEHICLE DETAILS ONLY (IF VEHICLE CONFIGURED AND PROVIDED) */}
                              {isVehicleConfigured && customerHasVeh && (!isDriverConfigured || !customerHasDrv) && (
                                <div className="p-3 rounded-xl bg-slate-900/90 border border-emerald-500/40 space-y-1.5">
                                  <span className="text-emerald-400 font-extrabold uppercase text-[10px] flex items-center gap-1">
                                    <Truck className="w-3.5 h-3.5" /> CUSTOMER VEHICLE
                                  </span>
                                  {typeof vehDetails === 'object' && vehDetails ? (
                                    <div className="space-y-0.5 text-[11px] font-mono text-slate-200">
                                      <div>Type: <strong className="text-white">{vehDetails.vehicle_type || 'Vehicle'}</strong></div>
                                      <div>Reg #: <strong className="text-white">{vehDetails.registration_number || 'N/A'}</strong></div>
                                      <div>Owner: <strong className="text-white">{vehDetails.owner_name || 'N/A'}</strong></div>
                                      {vehDetails.contact_number && (
                                        <div className="pt-1">
                                          <a href={`tel:${vehDetails.contact_number}`} className="text-emerald-400 underline font-bold flex items-center gap-1">
                                            <Phone className="w-3 h-3" /> {vehDetails.contact_number}
                                          </a>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-slate-200 font-mono text-xs">{String(vehDetails || 'Customer Vehicle Provided')}</div>
                                  )}
                                </div>
                              )}

                              {/* 3. DRIVER DETAILS ONLY (IF DRIVER CONFIGURED AND PROVIDED) */}
                              {isDriverConfigured && customerHasDrv && (!isVehicleConfigured || !customerHasVeh) && (
                                <div className="p-3 rounded-xl bg-slate-900/90 border border-amber-500/40 space-y-1.5">
                                  <span className="text-amber-400 font-extrabold uppercase text-[10px] flex items-center gap-1">
                                    <UserCheck className="w-3.5 h-3.5" /> CUSTOMER DRIVER
                                  </span>
                                  {typeof drvDetails === 'object' && drvDetails ? (
                                    <div className="space-y-0.5 text-[11px] font-mono text-slate-200">
                                      <div>Name: <strong className="text-white">{drvDetails.driver_name || 'Driver'}</strong></div>
                                      <div>Licence: <strong className="text-white">{drvDetails.license_number || 'N/A'}</strong></div>
                                      {drvDetails.driver_phone && (
                                        <div className="pt-1">
                                          <a href={`tel:${drvDetails.driver_phone}`} className="text-amber-400 underline font-bold flex items-center gap-1">
                                            <Phone className="w-3 h-3" /> {drvDetails.driver_phone}
                                          </a>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-slate-200 font-mono text-xs">{String(drvDetails || 'Customer Driver Provided')}</div>
                                  )}
                                </div>
                              )}

                              {/* 4. VEHICLE NEEDED BY CUSTOMER -> PROVIDER ACTIONS */}
                              {isVehicleConfigured && !customerHasVeh && (
                                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                                  <div>
                                    <span className="text-emerald-400 font-bold uppercase text-[10px] block">Vehicle Arrangement</span>
                                    <span className="text-white font-semibold">Customer needs a Vehicle for this service.</span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAssignModalOpp(opp);
                                        setAssignMode('VEHICLE');
                                        setVehForm({ vehicle_type: '10-Wheeler Heavy Tipper', registration_number: '', owner_name: '', contact_number: '' });
                                      }}
                                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center gap-1 shadow-md shadow-emerald-600/30"
                                    >
                                      <Truck className="w-3.5 h-3.5" />
                                      <span>1. I can provide a vehicle</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleBookVehicleMarketplace(opp)}
                                      disabled={submittingResource}
                                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 font-bold text-xs flex items-center gap-1"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      <span>2. I will book a vehicle</span>
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* 5. DRIVER NEEDED BY CUSTOMER -> PROVIDER ACTIONS */}
                              {isDriverConfigured && !customerHasDrv && (
                                <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                                  <div>
                                    <span className="text-amber-400 font-bold uppercase text-[10px] block">Driver Arrangement</span>
                                    <span className="text-white font-semibold">Customer needs a Driver for this service.</span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAssignModalOpp(opp);
                                        setAssignMode('DRIVER');
                                        setDrvForm({ driver_name: '', driver_phone: '', license_number: '' });
                                      }}
                                      className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-extrabold text-xs flex items-center gap-1 shadow-md shadow-amber-600/30"
                                    >
                                      <UserCheck className="w-3.5 h-3.5" />
                                      <span>1. I can provide a driver</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleBookDriverMarketplace(opp)}
                                      disabled={submittingResource}
                                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 font-bold text-xs flex items-center gap-1"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      <span>2. I will book a driver</span>
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {(opp.status === 'COMPLETED' || opp.status === 'DELIVERED') && (
                          <div className="mt-2 pt-2 border-t border-emerald-900/60 space-y-1 text-[11px]">
                            <div className="flex justify-between">
                              <span className="text-slate-400 font-bold">Gross Delivery Payout:</span>
                              <span className="text-white font-mono font-bold">₹{opp.budget_max || 40}.00</span>
                            </div>
                            <div className="flex justify-between text-amber-300 font-medium">
                              <span>Provider Commission Fee (-5%):</span>
                              <span className="font-mono">-₹{((opp.budget_max || 40) * 0.05).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-emerald-300 font-extrabold text-xs pt-1 border-t border-emerald-900/40">
                              <span>Net Payout Released:</span>
                              <span className="font-mono text-emerald-400">₹{((opp.budget_max || 40) * 0.95).toFixed(2)} (RELEASED)</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* View Request / ACCEPTED / PICKED_UP / DELIVERED Action Buttons */}
                <div className="pt-2">
                  {opp.status === 'DELIVERED' || opp.status === 'COMPLETED' ? (
                    <div className="w-full py-3 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-extrabold text-xs flex items-center justify-center gap-2 shadow-inner">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>✓ DELIVERED (Completed)</span>
                    </div>
                  ) : opp.status === 'PICKED_UP' ? (
                    <button
                      type="button"
                      onClick={() => {
                        const defaultTrustCard = `TRUST-CARD-${(opp.user?.full_name || 'CUSTOMER').replace(/\s+/g, '-').toUpperCase()}-${opp.id.slice(0, 4).toUpperCase()}`;
                        setTrustCardInput(defaultTrustCard);
                        setDeliveryModalOpp(opp);
                      }}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/20"
                    >
                      <ShieldCheck className="w-4 h-4 text-white" />
                      <span>Verify Doorstep Delivery</span>
                    </button>
                  ) : isAccepted ? (
                    (() => {
                      const isPharmacyOrder = Boolean(
                        opp.category?.slug?.includes('medicine') ||
                        opp.category?.slug?.includes('pharmacy') ||
                        opp.category?.name?.toLowerCase().includes('medicine') ||
                        opp.category?.name?.toLowerCase().includes('pharmacy') ||
                        opp.workflow_model === 'PHARMACY_PICKUP' ||
                        opp.workflow_model === 'PRESCRIPTION_VERIFICATION' ||
                        opp.title?.toLowerCase().includes('medicine') ||
                        opp.title?.toLowerCase().includes('pharmacy')
                      );
                      if (isPharmacyOrder) {
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              const manifestNum = `PHARM-QR-${opp.id.slice(0, 8).toUpperCase()}`;
                              setQrCodeInput(manifestNum);
                              setPickupModalOpp(opp);
                            }}
                            className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/20"
                          >
                            <QrCode className="w-4 h-4 text-white" />
                            <span>Verify Pharmacy Order QR Pickup</span>
                          </button>
                        );
                      }
                      return (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              let currentUser = null;
                              if (typeof window !== 'undefined') {
                                const u = localStorage.getItem('uop_user');
                                if (u) currentUser = JSON.parse(u);
                              }
                              const userIdent = currentUser?.id || currentUser?.phone;
                              await updateOpportunityStatus(opp.id, 'IN_PROGRESS', userIdent);
                              setMessage(`Order #${opp.id.slice(0, 8)} status updated to IN_PROGRESS!`);
                              loadRequests();
                            } catch (err: any) {
                              alert(`Error updating order status: ${err.message || err}`);
                            }
                          }}
                          className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/20"
                        >
                          <CheckCircle2 className="w-4 h-4 text-white" />
                          <span>Dispatch / Start Order Service</span>
                        </button>
                      );
                    })()
                  ) : opp.status === 'IN_PROGRESS' || opp.status === 'DISPATCHED' ? (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          let currentUser = null;
                          if (typeof window !== 'undefined') {
                            const u = localStorage.getItem('uop_user');
                            if (u) currentUser = JSON.parse(u);
                          }
                          const userIdent = currentUser?.id || currentUser?.phone;
                          await updateOpportunityStatus(opp.id, 'DELIVERED', userIdent);
                          setMessage(`Order #${opp.id.slice(0, 8)} marked as DELIVERED / COMPLETED!`);
                          loadRequests();
                        } catch (err: any) {
                          alert(`Error completing order: ${err.message || err}`);
                        }
                      }}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/20"
                    >
                      <ShieldCheck className="w-4 h-4 text-white" />
                      <span>Complete & Confirm Delivery</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setReviewingOpp(opp)}
                      className="w-full py-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md"
                    >
                      <Eye className="w-4 h-4 text-blue-400" />
                      <span>View Request</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Provider ORDER DETAILS Review Modal */}
      {reviewingOpp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4 overflow-hidden">
          <div className="relative w-full max-w-lg max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] my-auto bg-[#0d1322] border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-slate-800/80 flex-none relative bg-[#0d1322]/95 backdrop-blur-sm">
              <button
                onClick={() => setReviewingOpp(null)}
                className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Close review"
              >
                <X className="w-5 h-5" />
              </button>

              <span className="px-3 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-extrabold uppercase tracking-wider block w-fit mb-2">
                SERVICE REQUEST REVIEW
              </span>
              <h3 className="text-xl sm:text-2xl font-extrabold text-white">ORDER DETAILS</h3>
              <p className="text-xs text-slate-400 mt-1">Review customer order details before deciding to accept or decline.</p>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-4">
              {(() => {
                const meta = reviewingOpp.metadata || {};
                const cf = meta.custom_fields || {};
                const rawQuantity = meta.quantity ?? cf.quantity ?? meta.quantity_bags ?? cf.quantity_bags ?? meta.cargo_weight_tons ?? cf.cargo_weight_tons ?? meta.farm_area_acres ?? cf.farm_area_acres ?? meta.quantity_needed;
                const quantity = (rawQuantity !== undefined && rawQuantity !== null && rawQuantity !== '') 
                  ? (!isNaN(Number(rawQuantity)) ? Number(rawQuantity).toLocaleString('en-IN') : String(rawQuantity)) 
                  : 'N/A';

                const categoryName = reviewingOpp.category?.name || meta.category_name || 'Bricks';
                const pickupLoc = meta.pickup_location || meta.source_location || cf.pickup_location || cf.source_location || (reviewingOpp.category?.slug?.includes('brick') ? 'Choutuppal Yard' : 'Source Location');
                const deliveryLoc = reviewingOpp.address_text || meta.delivery_location || 'Customer Selected Delivery Address';
                const reqDate = reviewingOpp.scheduled_start 
                  ? new Date(reviewingOpp.scheduled_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                  : '21 Aug 2026';

                const { isVehicleConfigured, isDriverConfigured, customerHasVeh, customerHasDrv } = getResourceConfig(reviewingOpp);

                return (
                  <div className="space-y-4 bg-[#090d16] border border-slate-800 p-5 rounded-2xl text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                        <span className="text-slate-500 font-bold uppercase text-[10px] block">Customer</span>
                        <span className="text-white font-extrabold text-sm">{reviewingOpp.user?.full_name || 'Customer'}</span>
                        <span className="text-slate-500 font-mono italic text-[11px] block">Contact hidden prior to acceptance</span>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                        <span className="text-slate-500 font-bold uppercase text-[10px] block">Service</span>
                        <span className="text-white font-extrabold text-sm">{categoryName}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                        <span className="text-slate-500 font-bold uppercase text-[10px] block">Pickup</span>
                        <span className="text-slate-200 font-bold">{pickupLoc}</span>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                        <span className="text-slate-500 font-bold uppercase text-[10px] block">Delivery</span>
                        <span className="text-slate-200 font-bold">{deliveryLoc}</span>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                        <span className="text-slate-500 font-bold uppercase text-[10px] block">Quantity</span>
                        <span className="text-emerald-400 font-bold text-sm">{quantity}</span>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                        <span className="text-slate-500 font-bold uppercase text-[10px] block">Required Date</span>
                        <span className="text-blue-300 font-bold">{reqDate}</span>
                      </div>
                    </div>

                    {/* Labour Service Specifics */}
                    {(reviewingOpp.category?.slug?.includes('labour') || cf.number_of_workers || meta.number_of_workers) && (
                      <div className="p-4 rounded-xl bg-purple-950/40 border border-purple-500/40 space-y-2">
                        <span className="text-purple-300 font-extrabold uppercase text-[10px] flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" />
                          <span>LABOUR WORKFORCE DETAILS</span>
                        </span>
                        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                          <div>Workers Required: <strong className="text-white">{cf.number_of_workers || meta.number_of_workers || 1} Workers</strong></div>
                          <div>Labour Type: <strong className="text-purple-200">{cf.labour_type || cf.trade_specialty || cf.farm_task || 'General Labour'}</strong></div>
                          <div>Pricing Method: <strong className="text-slate-200">{cf.pricing_method || 'Per Worker / Day'}</strong></div>
                          <div>Rate per Worker: <strong className="text-emerald-400">₹{cf.rate_per_unit || 500}</strong></div>
                        </div>
                      </div>
                    )}

                    {/* Dynamic Service Resource Requirement Choices */}
                    {(isVehicleConfigured || isDriverConfigured) && (
                      <div className={`grid ${isVehicleConfigured && isDriverConfigured ? 'grid-cols-2' : 'grid-cols-1'} gap-3 pt-2 border-t border-slate-800/80`}>
                        {isVehicleConfigured && (
                          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                            <span className="text-slate-500 font-bold uppercase text-[10px] block">Vehicle Choice</span>
                            <span className="text-emerald-400 font-bold text-xs flex items-center gap-1">
                              <Truck className="w-3.5 h-3.5" />
                              <span>{customerHasVeh ? 'Customer will provide vehicle' : 'Customer needs vehicle'}</span>
                            </span>
                          </div>
                        )}

                        {isDriverConfigured && (
                          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                            <span className="text-slate-500 font-bold uppercase text-[10px] block">Driver Choice</span>
                            <span className="text-amber-400 font-bold text-xs flex items-center gap-1">
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>{customerHasDrv ? 'Customer will provide driver' : 'Customer needs driver'}</span>
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Provider Decision Fixed Action Footer */}
            <div className="p-4 sm:p-5 border-t border-slate-800/80 bg-[#0a0f1d] flex items-center justify-end gap-3 flex-none">
              <button
                type="button"
                onClick={() => handleDeclineOrder(reviewingOpp)}
                className="w-1/2 py-3.5 rounded-xl border border-slate-800 text-slate-300 hover:text-white font-bold text-xs flex items-center justify-center gap-2 transition-all hover:bg-slate-900"
              >
                <Ban className="w-4 h-4 text-slate-400" />
                <span>Decline</span>
              </button>

              <button
                type="button"
                onClick={() => handleAcceptOrder(reviewingOpp)}
                disabled={acceptingId === reviewingOpp.id}
                className="w-1/2 py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/30 disabled:opacity-50"
              >
                {acceptingId === reviewingOpp.id ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Accepting...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Accept / Offer to Fulfil</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PHARMACY QR PICKUP VERIFICATION MODAL */}
      {pickupModalOpp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4 overflow-hidden">
          <div className="relative w-full max-w-md max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] my-auto bg-[#0d1322] border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-slate-800/80 flex-none relative bg-[#0d1322]/95 backdrop-blur-sm">
              <button
                onClick={() => setPickupModalOpp(null)}
                className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Close pickup"
              >
                <X className="w-5 h-5" />
              </button>

              <span className="px-3 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 w-fit mb-2">
                <QrCode className="w-3.5 h-3.5" />
                <span>PHARMACY PICKUP VERIFICATION</span>
              </span>
              <h3 className="text-xl sm:text-2xl font-extrabold text-white">Scan Pharmacy Order QR</h3>
              <p className="text-xs text-slate-400 mt-1">
                Scan or enter the Pharmacy Order QR code upon medicine pickup to confirm logistics transition.
              </p>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-4">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Pharmacy</span>
                  <span className="text-white font-extrabold">{pickupModalOpp.metadata?.pickup_location || 'Choutuppal Pharmacy'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Order Title</span>
                  <span className="text-slate-300 font-medium truncate max-w-[180px]">{pickupModalOpp.title}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  Pharmacy Order QR Code / Barcode *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={qrCodeInput}
                    onChange={(e) => setQrCodeInput(e.target.value)}
                    placeholder="Enter or scan QR (e.g. PHARM-QR-100234)"
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-white font-mono text-sm focus:outline-none focus:border-emerald-500"
                  />
                  <QrCode className="w-5 h-5 text-slate-500 absolute right-3.5 top-3.5" />
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-5 border-t border-slate-800/80 bg-[#0a0f1d] flex items-center justify-end flex-none">
              <button
                type="button"
                disabled={verifyingPickup}
                onClick={async () => {
                  if (!qrCodeInput.trim()) {
                    alert('Please enter a valid QR code');
                    return;
                  }
                  setVerifyingPickup(true);
                  try {
                    const res = await verifyPharmacyPickup(pickupModalOpp.id, qrCodeInput.trim());
                    setMessage(`Pharmacy QR Verified! Manifest #${res.manifest?.manifest_number || 'OK'} updated. Status: PICKED_UP`);
                    setPickupModalOpp(null);
                    setQrCodeInput('');
                    loadRequests();
                  } catch (err: any) {
                    alert(`Pickup Verification Failed: ${err.message || 'Error verifying QR code'}`);
                  } finally {
                    setVerifyingPickup(false);
                  }
                }}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/30 disabled:opacity-50"
              >
                {verifyingPickup ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Verifying QR Code...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm Pharmacy Pickup</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DOORSTEP DELIVERY VERIFICATION MODAL */}
      {deliveryModalOpp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4 overflow-hidden">
          <div className="relative w-full max-w-md max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] my-auto bg-[#0d1322] border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-slate-800/80 flex-none relative bg-[#0d1322]/95 backdrop-blur-sm">
              <button
                onClick={() => setDeliveryModalOpp(null)}
                className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Close delivery"
              >
                <X className="w-5 h-5" />
              </button>

              <span className="px-3 py-1 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/30 text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 w-fit mb-2">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>DOORSTEP DELIVERY VERIFICATION</span>
              </span>
              <h3 className="text-xl sm:text-2xl font-extrabold text-white">Confirm Medicine Handover</h3>
              <p className="text-xs text-slate-400 mt-1">
                Scan customer Trust Card QR or verify signature upon doorstep handover.
              </p>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-4">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Customer</span>
                  <span className="text-white font-extrabold">{deliveryModalOpp.user?.full_name || 'Customer'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Delivery Location</span>
                  <span className="text-slate-300 font-medium truncate max-w-[180px]">
                    {deliveryModalOpp.address_text || deliveryModalOpp.metadata?.delivery_location || 'Customer Address'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  Customer Trust Card QR / Delivery Code *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={trustCardInput}
                    onChange={(e) => setTrustCardInput(e.target.value)}
                    placeholder="Enter or scan Customer Trust Card QR"
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-white font-mono text-sm focus:outline-none focus:border-blue-500"
                  />
                  <QrCode className="w-5 h-5 text-slate-500 absolute right-3.5 top-3.5" />
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-5 border-t border-slate-800/80 bg-[#0a0f1d] flex items-center justify-end flex-none">
              <button
                type="button"
                disabled={verifyingDelivery}
                onClick={async () => {
                  if (!trustCardInput.trim()) {
                    alert('Please enter or scan Customer Trust Card QR');
                    return;
                  }
                  setVerifyingDelivery(true);
                  try {
                    await uploadProofOfDelivery(
                      deliveryModalOpp.id,
                      trustCardInput.trim(),
                      `/uploads/signatures/sig_${deliveryModalOpp.id.slice(0, 8)}.png`
                    );
                    setMessage(`Medicine Delivery Verified & Completed! Customer has been notified.`);
                    setDeliveryModalOpp(null);
                    setTrustCardInput('');
                    loadRequests();
                  } catch (err: any) {
                    alert(`Doorstep Delivery Verification Error: ${err.message || 'Error completing delivery'}`);
                  } finally {
                    setVerifyingDelivery(false);
                  }
                }}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/30 disabled:opacity-50"
              >
                {verifyingDelivery ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Verifying Delivery...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm Doorstep Delivery</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROVIDER RESOURCE ASSIGNMENT MODAL (Vehicle / Driver) */}
      {assignModalOpp && assignMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4 overflow-hidden">
          <div className="relative w-full max-w-lg max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] my-auto bg-[#0d1322] border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            
            {/* Modal Fixed Header */}
            <div className="p-5 sm:p-6 border-b border-slate-800/80 flex-none relative bg-[#0d1322]/95 backdrop-blur-sm">
              <button
                type="button"
                onClick={() => {
                  setAssignModalOpp(null);
                  setAssignMode(null);
                  setAssignError(null);
                }}
                className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Close form"
              >
                <X className="w-5 h-5" />
              </button>

              <span className="px-3 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 w-fit mb-2">
                {assignMode === 'VEHICLE' ? <Truck className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                <span>ASSIGN {assignMode} DETAILS</span>
              </span>
              <h3 className="text-xl sm:text-2xl font-extrabold text-white">
                {assignMode === 'VEHICLE' ? 'Assign Vehicle Details' : 'Assign Driver Details'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Order #{assignModalOpp.id.slice(0, 8).toUpperCase()} • {assignModalOpp.title}
              </p>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-5 sm:p-6 space-y-4 touch-pan-y overscroll-contain">
              {/* Order Summary Box */}
              <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400 font-semibold">Service Request:</span>
                  <span className="text-white font-bold">{assignModalOpp.title}</span>
                </div>
                {((assignModalOpp as any).price || assignModalOpp.budget_min || assignModalOpp.budget_max) && (
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400 font-semibold">Price / Payout:</span>
                    <span className="text-emerald-400 font-extrabold">
                      ₹{(assignModalOpp as any).price || assignModalOpp.budget_min || assignModalOpp.budget_max}
                    </span>
                  </div>
                )}
                {((assignModalOpp as any).customer_location || assignModalOpp.address_text) && (
                  <div className="flex items-start justify-between text-slate-300 gap-2">
                    <span className="text-slate-400 font-semibold flex-shrink-0">Location:</span>
                    <span className="text-slate-300 text-right truncate">
                      {(assignModalOpp as any).customer_location || assignModalOpp.address_text}
                    </span>
                  </div>
                )}
              </div>

              {/* Error Alert Box */}
              {assignError && (
                <div ref={assignErrorRef} className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 shadow-sm animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <strong className="block font-bold text-rose-200 mb-0.5">Submission Error</strong>
                    <span>{assignError}</span>
                  </div>
                </div>
              )}

              {/* Form Content */}
              {assignMode === 'VEHICLE' ? (
                <form id="assign-vehicle-form" onSubmit={handleAssignVehicleSubmit} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Vehicle Type *</label>
                    <select
                      value={vehForm.vehicle_type}
                      onChange={(e) => {
                        setAssignError(null);
                        setVehForm({ ...vehForm, vehicle_type: e.target.value });
                      }}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white font-semibold focus:outline-none focus:border-emerald-500"
                      required
                    >
                      <option value="10-Wheeler Heavy Tipper">10-Wheeler Heavy Tipper</option>
                      <option value="12-Wheeler Heavy Hauler">12-Wheeler Heavy Hauler</option>
                      <option value="Tata Ace Commercial">Tata Ace Commercial</option>
                      <option value="Tractor Trailer">Tractor Trailer</option>
                      <option value="Flatbed Container">Flatbed Container</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Vehicle Registration Number *</label>
                    <input
                      type="text"
                      placeholder="e.g. TS-08-AB-1234"
                      value={vehForm.registration_number}
                      onChange={(e) => {
                        setAssignError(null);
                        setVehForm({ ...vehForm, registration_number: e.target.value });
                      }}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white font-mono focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Vehicle Owner / Fleet Name *</label>
                    <input
                      type="text"
                      placeholder="Owner Full Name / Fleet Provider"
                      value={vehForm.owner_name}
                      onChange={(e) => {
                        setAssignError(null);
                        setVehForm({ ...vehForm, owner_name: e.target.value });
                      }}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Vehicle Contact Phone *</label>
                    <input
                      type="text"
                      placeholder="+91 Mobile Number"
                      value={vehForm.contact_number}
                      onChange={(e) => {
                        setAssignError(null);
                        setVehForm({ ...vehForm, contact_number: e.target.value });
                      }}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white font-mono focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                </form>
              ) : (
                <form id="assign-driver-form" onSubmit={handleAssignDriverSubmit} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Driver Name *</label>
                    <input
                      type="text"
                      placeholder="Driver Full Name"
                      value={drvForm.driver_name}
                      onChange={(e) => {
                        setAssignError(null);
                        setDrvForm({ ...drvForm, driver_name: e.target.value });
                      }}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Driver Phone Number *</label>
                    <input
                      type="text"
                      placeholder="+91 Mobile Number"
                      value={drvForm.driver_phone}
                      onChange={(e) => {
                        setAssignError(null);
                        setDrvForm({ ...drvForm, driver_phone: e.target.value });
                      }}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white font-mono focus:outline-none focus:border-amber-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Driving License Number</label>
                    <input
                      type="text"
                      placeholder="e.g. DL-TEL-2023-8899"
                      value={drvForm.license_number}
                      onChange={(e) => {
                        setAssignError(null);
                        setDrvForm({ ...drvForm, license_number: e.target.value });
                      }}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </form>
              )}
            </div>

            {/* Modal Fixed Footer with Action Buttons */}
            <div className="p-4 sm:p-5 border-t border-slate-800/80 bg-[#0a0f1d] flex items-center justify-end gap-3 flex-none">
              <button
                type="button"
                onClick={() => {
                  setAssignModalOpp(null);
                  setAssignMode(null);
                  setAssignError(null);
                }}
                className="px-5 py-2.5 rounded-xl border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                form={assignMode === 'VEHICLE' ? 'assign-vehicle-form' : 'assign-driver-form'}
                disabled={submittingResource}
                className={`px-6 py-2.5 rounded-xl text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-lg disabled:opacity-50 ${
                  assignMode === 'VEHICLE'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-600/30'
                    : 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 shadow-amber-600/30'
                }`}
              >
                {submittingResource ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>Confirm & Notify Customer</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MARKETPLACE VEHICLE/DRIVER SELECTION & BOOKING CONFIRMATION MODAL */}
      {marketplaceModalOpp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4 overflow-hidden">
          <div className="relative w-full max-w-lg max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] my-auto bg-[#0d1322] border border-blue-500/30 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            
            {/* Modal Fixed Header */}
            <div className="p-5 sm:p-6 border-b border-slate-800/80 flex-none relative bg-[#0d1322]/95 backdrop-blur-sm">
              <button
                type="button"
                onClick={() => {
                  setMarketplaceModalOpp(null);
                  setMarketplaceError(null);
                }}
                className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>

              <span className="px-3 py-1 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/30 text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 w-fit mb-2">
                <Truck className="w-3.5 h-3.5" />
                <span>MARKETPLACE RESOURCE SELECTION</span>
              </span>
              <h3 className="text-xl sm:text-2xl font-extrabold text-white">
                Book via Transport Marketplace
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Order #{marketplaceModalOpp.id.slice(0, 8).toUpperCase()} • {marketplaceModalOpp.title}
              </p>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-5 sm:p-6 space-y-4 touch-pan-y overscroll-contain">
              {/* Order Summary Box */}
              <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400 font-semibold">Service Request:</span>
                  <span className="text-white font-bold">{marketplaceModalOpp.title}</span>
                </div>
                {((marketplaceModalOpp as any).price || marketplaceModalOpp.budget_min || marketplaceModalOpp.budget_max) && (
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400 font-semibold">Price / Payout:</span>
                    <span className="text-emerald-400 font-extrabold">
                      ₹{(marketplaceModalOpp as any).price || marketplaceModalOpp.budget_min || marketplaceModalOpp.budget_max}
                    </span>
                  </div>
                )}
                {((marketplaceModalOpp as any).customer_location || marketplaceModalOpp.address_text) && (
                  <div className="flex items-start justify-between text-slate-300 gap-2">
                    <span className="text-slate-400 font-semibold flex-shrink-0">Location:</span>
                    <span className="text-slate-300 text-right truncate">
                      {(marketplaceModalOpp as any).customer_location || marketplaceModalOpp.address_text}
                    </span>
                  </div>
                )}
              </div>

              {/* Error Alert Box */}
              {marketplaceError && (
                <div ref={marketplaceErrorRef} className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 shadow-sm animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <strong className="block font-bold text-rose-200 mb-0.5">Booking Error</strong>
                    <span>{marketplaceError}</span>
                  </div>
                </div>
              )}

              <form id="marketplace-booking-form" onSubmit={handleConfirmMarketplaceBooking} className="space-y-4 text-xs">
                {(marketplaceModalType === 'VEHICLE' || marketplaceModalType === 'BOTH') && (
                  <div className="space-y-3 p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
                    <span className="text-emerald-400 font-extrabold uppercase text-[10px] block">Fleet Vehicle Selection</span>
                    <div>
                      <label className="block text-slate-300 font-bold mb-1">Select Marketplace Fleet Vehicle *</label>
                      <select
                        value={mpVehForm.vehicle_type}
                        onChange={(e) => {
                          setMarketplaceError(null);
                          setMpVehForm({ ...mpVehForm, vehicle_type: e.target.value });
                        }}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-semibold focus:outline-none focus:border-emerald-500"
                        required
                      >
                        <option value="10-Wheeler Heavy Tipper">10-Wheeler Heavy Tipper (Choutuppal Yard Fleet)</option>
                        <option value="12-Wheeler Heavy Hauler">12-Wheeler Heavy Hauler (NH65 Transport Hub)</option>
                        <option value="Tata Ace Commercial">Tata Ace Commercial Van (Local Express)</option>
                        <option value="Tractor Trailer">Tractor Heavy Trailer (Rural Transport Co)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-300 font-bold mb-1">Registration / Fleet No. *</label>
                      <input
                        type="text"
                        value={mpVehForm.registration_number}
                        onChange={(e) => {
                          setMarketplaceError(null);
                          setMpVehForm({ ...mpVehForm, registration_number: e.target.value });
                        }}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-bold mb-1">Fleet Provider Name *</label>
                      <input
                        type="text"
                        value={mpVehForm.owner_name}
                        onChange={(e) => {
                          setMarketplaceError(null);
                          setMpVehForm({ ...mpVehForm, owner_name: e.target.value });
                        }}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-bold mb-1">Fleet Contact Phone *</label>
                      <input
                        type="text"
                        value={mpVehForm.contact_number}
                        onChange={(e) => {
                          setMarketplaceError(null);
                          setMpVehForm({ ...mpVehForm, contact_number: e.target.value });
                        }}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                        required
                      />
                    </div>
                  </div>
                )}

                {(marketplaceModalType === 'DRIVER' || marketplaceModalType === 'BOTH') && (
                  <div className="space-y-3 p-4 rounded-2xl bg-slate-900/90 border border-slate-800">
                    <span className="text-amber-400 font-extrabold uppercase text-[10px] block">Commercial Driver Selection</span>
                    <div>
                      <label className="block text-slate-300 font-bold mb-1">Commercial Driver Name *</label>
                      <input
                        type="text"
                        value={mpDrvForm.driver_name}
                        onChange={(e) => {
                          setMarketplaceError(null);
                          setMpDrvForm({ ...mpDrvForm, driver_name: e.target.value });
                        }}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-bold mb-1">Driver Phone Number *</label>
                      <input
                        type="text"
                        value={mpDrvForm.driver_phone}
                        onChange={(e) => {
                          setMarketplaceError(null);
                          setMpDrvForm({ ...mpDrvForm, driver_phone: e.target.value });
                        }}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-bold mb-1">Driving License Number</label>
                      <input
                        type="text"
                        value={mpDrvForm.license_number}
                        onChange={(e) => {
                          setMarketplaceError(null);
                          setMpDrvForm({ ...mpDrvForm, license_number: e.target.value });
                        }}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                      />
                    </div>
                  </div>
                )}
              </form>
            </div>

            {/* Modal Fixed Footer with Action Buttons */}
            <div className="p-4 sm:p-5 border-t border-slate-800/80 bg-[#0a0f1d] flex items-center justify-end gap-3 flex-none">
              <button
                type="button"
                onClick={() => {
                  setMarketplaceModalOpp(null);
                  setMarketplaceError(null);
                }}
                className="px-5 py-2.5 rounded-xl border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="marketplace-booking-form"
                disabled={submittingResource}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/30 disabled:opacity-50"
              >
                {submittingResource ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>Confirm Marketplace Booking & Notify Customer</span>
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
