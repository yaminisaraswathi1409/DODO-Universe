'use client';

import React, { useState, useEffect } from 'react';
import { getPublicOpportunities, updateOpportunityStatus, getUserServices, Opportunity } from '@/lib/api';
import { CheckCircle2, MapPin, Calendar, Clock, Tag, UserCheck, AlertCircle, RefreshCw, Layers, Wrench, Package, Truck, Eye, X, ArrowRight, Check, Ban } from 'lucide-react';

export default function ProviderOrderFeed() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewingOpp, setReviewingOpp] = useState<Opportunity | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const res = await getPublicOpportunities('', 'NEED');
      setOpportunities(res.data || []);
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

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

      await updateOpportunityStatus(opp.id, 'ACCEPTED');
      setMessage(`Successfully accepted request: "${opp.title}"! Customer has been notified.`);
      setReviewingOpp(null);
      loadRequests();
    } catch (err: any) {
      alert(`Accept failed: ${err.message || 'Error accepting order'}`);
    } finally {
      setAcceptingId(null);
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
            <span>Service Provider Marketplace</span>
          </h3>
          <p className="text-slate-400 text-xs">Review incoming customer service requests and accept orders.</p>
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
          <p>No active customer service requests found in your area right now.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {opportunities.map((opp) => {
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
                    {isAccepted ? (
                      <span className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>ACCEPTED</span>
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-extrabold uppercase tracking-wider">
                        SERVICE REQUEST
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

                  {/* Clean Important Provider Metrics */}
                  <div className="space-y-2 p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-bold uppercase text-[10px]">Quantity</span>
                      <span className="text-white font-extrabold">{quantity} units</span>
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

                  {/* Status Banner when Accepted */}
                  {isAccepted && (
                    <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-800/80 text-xs text-emerald-300 space-y-2">
                      <div className="flex items-center justify-between font-extrabold text-emerald-200">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>✓ Request Accepted</span>
                        </span>
                        <span className="font-mono text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30 uppercase font-bold">
                          {opp.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-2 border-t border-emerald-900/60">
                        <div>
                          <span className="text-slate-400 font-bold uppercase text-[10px] block">Customer</span>
                          <span className="text-white font-extrabold">{opp.user?.full_name || 'Customer'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-bold uppercase text-[10px] block">Phone</span>
                          <span className="text-emerald-300 font-extrabold">{opp.user?.phone || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* View Request / ACCEPTED Action Button */}
                <div className="pt-2">
                  {isAccepted ? (
                    <button
                      type="button"
                      disabled
                      className="w-full py-3 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 font-extrabold text-xs flex items-center justify-center gap-2 cursor-not-allowed opacity-90 shadow-inner"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>ACCEPTED</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg bg-[#0d1322] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
            <button
              onClick={() => setReviewingOpp(null)}
              className="absolute top-6 right-6 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <span className="px-3 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-extrabold uppercase tracking-wider block w-fit mb-2">
                SERVICE REQUEST REVIEW
              </span>
              <h3 className="text-2xl font-extrabold text-white">ORDER DETAILS</h3>
              <p className="text-xs text-slate-400 mt-1">Review customer order details before deciding to accept or decline.</p>
            </div>

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

              return (
                <div className="space-y-4 bg-[#090d16] border border-slate-800 p-5 rounded-2xl text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                      <span className="text-slate-500 font-bold uppercase text-[10px] block">Customer</span>
                      <span className="text-white font-extrabold text-sm">{reviewingOpp.user?.full_name || 'Customer'}</span>
                      <span className="text-emerald-400 font-mono font-bold block text-xs">{reviewingOpp.user?.phone || 'N/A'}</span>
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
                </div>
              );
            })()}

            {/* Provider Decision Buttons: [ Accept / Offer to Fulfil ] and [ Decline ] */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setReviewingOpp(null)}
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
    </div>
  );
}
