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
import { CheckCircle2, MapPin, Calendar, Clock, Tag, UserCheck, AlertCircle, RefreshCw, Layers, Wrench, Package, Truck, Eye, X, ArrowRight, Check, Ban, QrCode, Sparkles, ShieldCheck, Phone, Users, Plus, Store, Edit3, Zap } from 'lucide-react';
import { sanitizePhoneInput, validatePhoneNumber } from '@/lib/phoneUtils';

interface ProviderOrderFeedProps {
  isAcceptedView?: boolean;
  initialSubTab?: 'matching' | 'accepted';
}

// Helper to inspect category configuration and metadata choices for an opportunity
const getResourceConfig = (opp: Opportunity) => {
  const cat = opp.category;
  const meta = opp.metadata || {};
  const cf = (opp as any).custom_fields || (meta as any).custom_fields || {};
  const resSelections = meta.resource_selections || {};
  const vendorResDetails = meta.vendor_resource_details || {};

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
      Boolean(meta.vehicle_details || cf.vehicle_details || meta.vendor_vehicle_details);
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
      Boolean(meta.driver_details || cf.driver_details || meta.vendor_driver_details);
  }

  // Saved Vendor/Provider Arranged Details
  const vendorVehDetails =
    meta.vendor_vehicle_details ||
    vendorResDetails?.vehicle?.details ||
    (resSelections.vehicle?.assigned_by === 'VENDOR' ? resSelections.vehicle?.details : null) ||
    resSelections.vehicle?.vendor_details ||
    null;

  const vendorDrvDetails =
    meta.vendor_driver_details ||
    vendorResDetails?.driver?.details ||
    (resSelections.driver?.assigned_by === 'VENDOR' ? resSelections.driver?.details : null) ||
    resSelections.driver?.vendor_details ||
    null;

  // Customer choices & details (explicitly customer provided)
  const vehDetails =
    meta.vehicle_details ||
    cf.vehicle_details ||
    (resSelections.vehicle?.assigned_by !== 'VENDOR' && resSelections.vehicle?.choice === 'HAS_RESOURCE' ? resSelections.vehicle?.details : null) ||
    null;

  const drvDetails =
    meta.driver_details ||
    cf.driver_details ||
    (resSelections.driver?.assigned_by !== 'VENDOR' && resSelections.driver?.choice === 'HAS_RESOURCE' ? resSelections.driver?.details : null) ||
    null;

  // Determine whether customer explicitly provides vehicle
  let customerHasVeh = false;
  if (resSelections.vehicle) {
    const sel = resSelections.vehicle.selection || resSelections.vehicle.choice;
    customerHasVeh = sel === 'HAS_RESOURCE' || sel === 'HAVE_VEHICLE';
  } else if (meta.vehicle_option_code) {
    customerHasVeh = meta.vehicle_option_code === 'HAVE_VEHICLE';
  } else if (meta.has_vehicle !== undefined) {
    customerHasVeh = Boolean(meta.has_vehicle);
  } else if (vehDetails && !vendorVehDetails) {
    customerHasVeh = true;
  }

  // Determine whether customer explicitly provides driver
  let customerHasDrv = false;
  if (resSelections.driver) {
    const sel = resSelections.driver.selection || resSelections.driver.choice;
    customerHasDrv = sel === 'HAS_RESOURCE' || sel === 'HAVE_DRIVER';
  } else if (meta.driver_option_code) {
    customerHasDrv = meta.driver_option_code === 'HAVE_DRIVER';
  } else if (meta.has_driver !== undefined) {
    customerHasDrv = Boolean(meta.has_driver);
  } else if (drvDetails && !vendorDrvDetails) {
    customerHasDrv = true;
  }

  // Other configured resources (e.g. Loading, Unloading, Equipment, etc.)
  const otherConfiguredResources = (resourcesList || [])
    .filter(
      (r) =>
        r.key !== 'vehicle' &&
        r.key !== 'driver' &&
        !r.name?.toLowerCase().includes('vehicle') &&
        !r.name?.toLowerCase().includes('driver') &&
        r.active !== false &&
        r.requirement_level !== 'NOT_APPLICABLE'
    )
    .map((r) => {
      const custSel = resSelections[r.key];
      const savedVendor =
        vendorResDetails[r.key]?.details ||
        meta[`vendor_${r.key}_details`] ||
        custSel?.vendor_details ||
        null;
      const custProvided =
        custSel?.choice === 'HAS_RESOURCE' || custSel?.selection === 'HAS_RESOURCE'
          ? custSel?.details
          : null;
      return {
        ...r,
        customerProvided: custProvided,
        vendorArranged: savedVendor,
        isArranged: Boolean(savedVendor || custProvided),
      };
    });

  return {
    isVehicleConfigured,
    isDriverConfigured,
    customerHasVeh,
    customerHasDrv,
    vehDetails,
    drvDetails,
    vendorVehDetails,
    vendorDrvDetails,
    otherConfiguredResources,
  };
};

export default function ProviderOrderFeed({ isAcceptedView = false, initialSubTab }: ProviderOrderFeedProps) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [activeTab, setActiveTab] = useState<'matching' | 'accepted'>(
    initialSubTab || (isAcceptedView ? 'accepted' : 'matching')
  );
  const [matchingOpps, setMatchingOpps] = useState<Opportunity[]>([]);
  const [acceptedOpps, setAcceptedOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewingOpp, setReviewingOpp] = useState<Opportunity | null>(null);
  const [pickupModalOpp, setPickupModalOpp] = useState<Opportunity | null>(null);
  const [deliveryModalOpp, setDeliveryModalOpp] = useState<Opportunity | null>(null);
  const [assignModalOpp, setAssignModalOpp] = useState<Opportunity | null>(null);
  const [assignMode, setAssignMode] = useState<'VEHICLE' | 'DRIVER' | 'RESOURCE' | null>(null);
  const [activeResourceConfig, setActiveResourceConfig] = useState<{ key: string; name: string } | null>(null);
  const [isEditingResource, setIsEditingResource] = useState(false);
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
  const [resForm, setResForm] = useState({
    provider_name: '',
    contact_number: '',
    details: '',
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

  useEffect(() => {
    if (initialSubTab) {
      setActiveTab(initialSubTab);
    } else if (isAcceptedView !== undefined) {
      setActiveTab(isAcceptedView ? 'accepted' : 'matching');
    }
  }, [isAcceptedView, initialSubTab]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      let currentUser = null;
      if (typeof window !== 'undefined') {
        const u = localStorage.getItem('uop_user');
        if (u) currentUser = JSON.parse(u);
      }
      const userIdent = currentUser?.id || currentUser?.phone;

      const [matchingRes, acceptedRes] = await Promise.allSettled([
        getMatchingOpportunities(userIdent),
        getAcceptedOpportunities(userIdent),
      ]);

      let mList: Opportunity[] = [];
      if (matchingRes.status === 'fulfilled') {
        const data = matchingRes.value;
        mList = Array.isArray(data) ? data : (data as any)?.data || [];
        mList = mList.filter((o: any) => !declinedOppIds.includes(o.id));
      }
      setMatchingOpps(mList);

      let aList: Opportunity[] = [];
      if (acceptedRes.status === 'fulfilled') {
        const data = acceptedRes.value;
        aList = Array.isArray(data) ? data : (data as any)?.data || [];
      }
      setAcceptedOpps(aList);

      if (activeTab === 'accepted') {
        setOpportunities(aList);
      } else {
        setOpportunities(mList);
      }
    } catch {
      setOpportunities([]);
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (tab: 'matching' | 'accepted') => {
    setActiveTab(tab);
    if (tab === 'accepted') {
      setOpportunities(acceptedOpps);
    } else {
      setOpportunities(matchingOpps);
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
    setMatchingOpps((prev) => prev.filter((o) => o.id !== opp.id));
    setOpportunities((prev) => prev.filter((o) => o.id !== opp.id));
  };

  useEffect(() => {
    loadRequests();
  }, [activeTab]);

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

        if (!matchedService || (matchedService.status !== 'ACTIVE' && matchedService.status !== 'APPROVED')) {
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
      setActiveTab('accepted');
      await loadRequests();
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

    const phoneVal = validatePhoneNumber(vehForm.contact_number.trim());
    if (!phoneVal.isValid) {
      setAssignError(phoneVal.error || 'Please enter a valid 10-digit mobile number for vehicle contact.');
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
      const updatedOpp = await confirmTransportResources({
        opportunity_id: assignModalOpp.id,
        vehicle: vehForm,
        provider_id: userIdent,
      });
      if (updatedOpp) {
        setOpportunities((prev) => prev.map((o) => (o.id === updatedOpp.id ? updatedOpp : o)));
      }
      setMessage(isEditingResource ? `Vehicle arrangement details updated for Order #${assignModalOpp.id.slice(0, 8)}! Customer notified.` : `Vehicle confirmed for Order #${assignModalOpp.id.slice(0, 8)}! Customer notified.`);
      setAssignModalOpp(null);
      setAssignMode(null);
      setAssignError(null);
      setIsEditingResource(false);
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

    const phoneVal = validatePhoneNumber(drvForm.driver_phone.trim());
    if (!phoneVal.isValid) {
      setAssignError(phoneVal.error || 'Please enter a valid 10-digit mobile number for driver.');
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
      const updatedOpp = await confirmTransportResources({
        opportunity_id: assignModalOpp.id,
        driver: drvForm,
        provider_id: userIdent,
      });
      if (updatedOpp) {
        setOpportunities((prev) => prev.map((o) => (o.id === updatedOpp.id ? updatedOpp : o)));
      }
      setMessage(isEditingResource ? `Driver assignment details updated for Order #${assignModalOpp.id.slice(0, 8)}! Customer notified.` : `Driver confirmed for Order #${assignModalOpp.id.slice(0, 8)}! Customer notified.`);
      setAssignModalOpp(null);
      setAssignMode(null);
      setAssignError(null);
      setIsEditingResource(false);
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

  const handleAssignResourceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignModalOpp || !activeResourceConfig) return;
    setAssignError(null);

    if (!resForm.provider_name.trim() || !resForm.contact_number.trim()) {
      setAssignError('Please fill in required arranger/provider name and contact number (*).');
      setTimeout(() => {
        assignErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
      return;
    }

    const phoneVal = validatePhoneNumber(resForm.contact_number.trim());
    if (!phoneVal.isValid) {
      setAssignError(phoneVal.error || 'Please enter a valid 10-digit mobile number.');
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
      const updatedOpp = await confirmTransportResources({
        opportunity_id: assignModalOpp.id,
        resource_key: activeResourceConfig.key,
        resource_details: {
          arranged_by: 'VENDOR',
          provider_name: resForm.provider_name.trim(),
          contact_number: resForm.contact_number.trim(),
          notes: resForm.details.trim(),
        },
        provider_id: userIdent,
      });
      if (updatedOpp) {
        setOpportunities((prev) => prev.map((o) => (o.id === updatedOpp.id ? updatedOpp : o)));
      }
      setMessage(
        isEditingResource
          ? `${activeResourceConfig.name} arrangement details updated for Order #${assignModalOpp.id.slice(0, 8)}! Customer notified.`
          : `${activeResourceConfig.name} confirmed for Order #${assignModalOpp.id.slice(0, 8)}! Customer notified.`
      );
      setAssignModalOpp(null);
      setAssignMode(null);
      setActiveResourceConfig(null);
      setAssignError(null);
      setIsEditingResource(false);
      loadRequests();
    } catch (err: any) {
      setAssignError(err.message || `Failed to confirm ${activeResourceConfig.name} details.`);
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

    if (isVeh) {
      const vPhoneVal = validatePhoneNumber(mpVehForm.contact_number.trim());
      if (!vPhoneVal.isValid) {
        setMarketplaceError(vPhoneVal.error || 'Please enter a valid 10-digit mobile number for fleet contact.');
        setTimeout(() => {
          marketplaceErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
        return;
      }
    }

    if (isDrv && (!mpDrvForm.driver_name.trim() || !mpDrvForm.driver_phone.trim())) {
      setMarketplaceError('Please complete all required driver details (*).');
      setTimeout(() => {
        marketplaceErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
      return;
    }

    if (isDrv) {
      const dPhoneVal = validatePhoneNumber(mpDrvForm.driver_phone.trim());
      if (!dPhoneVal.isValid) {
        setMarketplaceError(dPhoneVal.error || 'Please enter a valid 10-digit mobile number for driver.');
        setTimeout(() => {
          marketplaceErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
        return;
      }
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
      {/* Sub-Tabs Toggle: Incoming Requests vs Accepted Jobs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => switchTab('matching')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all ${
              activeTab === 'matching'
                ? 'bg-black text-white shadow-md'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Incoming Requests</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
              activeTab === 'matching' ? 'bg-white text-black' : 'bg-slate-200 text-slate-800'
            }`}>
              {matchingOpps.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => switchTab('accepted')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all ${
              activeTab === 'accepted'
                ? 'bg-black text-white shadow-md'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Accepted Jobs</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
              activeTab === 'accepted' ? 'bg-white text-black' : 'bg-slate-200 text-slate-800'
            }`}>
              {acceptedOpps.length}
            </span>
          </button>
        </div>

        <button
          onClick={loadRequests}
          className="p-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 hover:text-black hover:bg-slate-50 transition-colors shadow-sm self-end sm:self-auto flex items-center gap-1.5 text-xs font-bold"
          title="Refresh Feed"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {message && (
        <div className="p-4 rounded-2xl bg-black border border-black text-white text-xs font-bold flex items-center gap-2 shadow-lg">
          <CheckCircle2 className="w-4.5 h-4.5 flex-shrink-0 text-white" />
          <span>{message}</span>
        </div>
      )}

      {opportunities.length === 0 ? (
        <div className="p-12 rounded-3xl bg-white border border-slate-200 text-center text-slate-500 text-xs space-y-3 shadow-sm">
          <Package className="w-10 h-10 mx-auto text-slate-400" />
          <p className="font-semibold text-slate-700">
            {activeTab === 'accepted'
              ? 'No accepted orders yet. Click "Incoming Requests" above to review and accept available requests.'
              : 'No matching customer service requests found in your area right now.'}
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {opportunities.map((opp: Opportunity) => {
            const meta = opp.metadata || {};
            const cf = meta.custom_fields || {};
            
            // 1. DYNAMIC QUANTITY
            const rawQuantity = opp.quantity ?? meta.quantity ?? cf.quantity ?? meta.quantity_bags ?? cf.quantity_bags ?? meta.cargo_weight_tons ?? cf.cargo_weight_tons ?? meta.farm_area_acres ?? cf.farm_area_acres ?? meta.quantity_needed;
            const displayQuantity = (rawQuantity !== undefined && rawQuantity !== null && rawQuantity !== '') 
              ? (!isNaN(Number(rawQuantity)) ? Number(rawQuantity).toLocaleString('en-IN') : String(rawQuantity)) 
              : '1';

            // 2. DYNAMIC PRICING & PAYOUT
            const orderTotal = opp.total_price || opp.budget_max || meta.charges_breakdown?.total || (opp.unit_price && opp.quantity ? opp.unit_price * opp.quantity : 0);
            const unitPrice = opp.unit_price || meta.unit_price || (opp.quantity && orderTotal ? orderTotal / opp.quantity : orderTotal);
            const vendorPayout = orderTotal > 0 ? orderTotal : (unitPrice > 0 ? unitPrice * (typeof rawQuantity === 'number' ? rawQuantity : 1) : 0);

            // 3. DYNAMIC DATES & TIMESTAMPS
            const createdDateFormatted = opp.created_at
              ? new Date(opp.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
              : 'Recently Placed';

            const bookingDateFormatted = opp.scheduled_start 
              ? new Date(opp.scheduled_start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
              : (meta.booking_date || meta.scheduled_date || 'On-Demand Dispatch');

            const bookingTimeFormatted = meta.booking_time
              ? meta.booking_time
              : (opp.scheduled_start ? new Date(opp.scheduled_start).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '');

            const categoryName = opp.category?.name || meta.category_name || 'Service Order';
            const pickupLoc = meta.pickup_location || meta.source_location || cf.pickup_location || cf.source_location || 'Source / Dispatch Yard';
            const deliveryLoc = opp.address_text || meta.delivery_location || 'Customer Selected Delivery Address';
            const distanceKm = opp.radius_km || 15;
            const isAccepted = ['ACCEPTED', 'PROVIDER_ACCEPTED', 'IN_PROGRESS', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'].includes(opp.status);

            return (
              <div
                key={opp.id}
                className={`border rounded-3xl p-5 shadow-sm transition-all space-y-4 flex flex-col justify-between ${
                  isAccepted
                    ? 'bg-white border-black ring-1 ring-black'
                    : 'bg-white border-slate-200 hover:border-slate-400'
                }`}
              >
                <div className="space-y-3">
                  {/* SERVICE REQUEST Header Tag */}
                  <div className="flex items-center justify-between">
                    {opp.order_mode === 'CATALOG_ORDER' ? (
                      <span className="px-3 py-1 rounded-lg bg-slate-900 text-white text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                        <Store className="w-3.5 h-3.5 text-white" />
                        <span>Direct Catalog Order</span>
                      </span>
                    ) : isAccepted ? (
                      <span className="px-3 py-1 rounded-lg bg-black text-white text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                        <span>ACCEPTED</span>
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-lg bg-slate-100 text-slate-800 border border-slate-300 text-[10px] font-extrabold uppercase tracking-wider">
                        GENERAL REQUEST
                      </span>
                    )}

                    <span className="text-xs font-bold text-slate-500 font-mono">
                      Order #{opp.id.slice(0, 8)}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-base font-extrabold text-slate-900">{categoryName}</h4>
                    <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{opp.title}</p>
                  </div>
                  {/* BRAND / VENDOR ITEM BREAKDOWN IN ORDER FEED */}
                  {Array.isArray(meta?.brand_items) && meta.brand_items.length > 0 ? (
                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                      <div className="flex items-center justify-between font-extrabold text-slate-900 text-[11px] uppercase tracking-wider">
                        <span className="flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-slate-700" />
                          <span>Order Items ({meta.vendor_details?.brand_name || meta.brand_name || 'Your Brand'})</span>
                        </span>
                        <span className="font-mono text-black font-bold">
                          {meta.brand_items.length} {meta.brand_items.length === 1 ? 'item' : 'items'}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {meta.brand_items.map((it: any, idx: number) => (
                          <div key={idx} className="p-2 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2 text-xs">
                            <div>
                              <div className="font-bold text-slate-900 text-xs">{it.title}</div>
                              <div className="text-[11px] text-slate-500 font-mono">Qty: {it.quantity || 1} × ₹{(it.unitPrice || 0).toLocaleString()}</div>
                            </div>
                            <div className="text-right font-extrabold font-mono text-black">
                              ₹{((it.totalPrice || (it.unitPrice || 0) * (it.quantity || 1))).toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : Array.isArray(meta?.cart_items) && meta.cart_items.length > 0 ? (
                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                      <div className="flex items-center justify-between font-extrabold text-slate-900 text-[11px] uppercase tracking-wider">
                        <span className="flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-slate-700" />
                          <span>Cart Order Items ({meta.cart_items.length})</span>
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {meta.cart_items.map((it: any, idx: number) => (
                          <div key={idx} className="p-2 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2 text-xs">
                            <div>
                              <div className="font-bold text-slate-900 text-xs">{it.title}</div>
                              <div className="text-[11px] text-slate-500 font-mono">Qty: {it.quantity || 1} × ₹{(it.unitPrice || 0).toLocaleString()}</div>
                            </div>
                            <div className="text-right font-extrabold font-mono text-black">
                              ₹{((it.totalPrice || (it.unitPrice || 0) * (it.quantity || 1))).toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Clean Important Provider Metrics */}
                  <div className="space-y-2 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-bold uppercase text-[10px]">Vendor Payout</span>
                      <span className="text-black font-extrabold text-sm font-mono">
                        ₹{vendorPayout.toLocaleString('en-IN')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-bold uppercase text-[10px]">Order Quantity</span>
                      <span className="text-slate-900 font-bold font-mono">
                        {displayQuantity} {opp.price_unit ? opp.price_unit.replace('PER_', '').toLowerCase() : 'units'}
                      </span>
                    </div>

                    {unitPrice > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-bold uppercase text-[10px]">Unit Price</span>
                        <span className="text-slate-700 font-mono">
                          ₹{unitPrice.toLocaleString('en-IN')} / {opp.price_unit ? opp.price_unit.replace('PER_', '').toLowerCase() : 'unit'}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-bold uppercase text-[10px]">Order Placed</span>
                      <span className="text-slate-700 font-mono">{createdDateFormatted}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-bold uppercase text-[10px]">Service / Delivery Date</span>
                      <span className="text-slate-900 font-bold">
                        {bookingDateFormatted} {bookingTimeFormatted ? `(${bookingTimeFormatted})` : ''}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-bold uppercase text-[10px]">Pickup Location</span>
                      <span className="text-slate-800 font-medium truncate max-w-[180px]">{pickupLoc}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-bold uppercase text-[10px]">Delivery Address</span>
                      <span className="text-slate-800 font-semibold truncate max-w-[180px]">{deliveryLoc}</span>
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
                      <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-3">
                        <div className="flex items-center justify-between font-extrabold text-emerald-950">
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>✓ {opp.status === 'COMPLETED' || opp.status === 'DELIVERED' ? 'Delivery Completed & Settled' : 'Request Accepted'}</span>
                          </span>
                          <span className="font-mono text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-300 uppercase font-bold">
                            {opp.status}
                          </span>
                        </div>

                        {/* CUSTOMER CONTACT DETAILS */}
                        <div className="p-3 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-3 text-xs shadow-sm">
                          <div>
                            <span className="text-slate-500 font-bold uppercase text-[10px] block">CUSTOMER INFORMATION</span>
                            <div className="text-slate-900 font-extrabold text-sm">{opp.user?.full_name || meta.customer_details?.name || 'Customer'}</div>
                            <div className="text-slate-600 text-[11px] mt-0.5 flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-rose-500" />
                              <span>{deliveryLoc}</span>
                            </div>
                          </div>
                          {custPhone && (
                            <a
                              href={`tel:${custPhone}`}
                              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-sm shrink-0"
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
                            vendorVehDetails,
                            vendorDrvDetails,
                            otherConfiguredResources,
                          } = getResourceConfig(opp);

                          if (!isVehicleConfigured && !isDriverConfigured && (!otherConfiguredResources || otherConfiguredResources.length === 0)) {
                            return null;
                          }

                          return (
                            <div className="space-y-3">
                              {/* --- VEHICLE ARRANGEMENT SECTION --- */}
                              {isVehicleConfigured && (
                                <>
                                  {customerHasVeh ? (
                                    /* Customer Provided Vehicle */
                                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1.5 text-xs">
                                      <span className="text-emerald-800 font-extrabold uppercase text-[10px] flex items-center gap-1">
                                        <Truck className="w-3.5 h-3.5" /> CUSTOMER VEHICLE
                                      </span>
                                      {typeof vehDetails === 'object' && vehDetails ? (
                                        <div className="space-y-0.5 text-[11px] font-mono text-emerald-950">
                                          <div>Type: <strong className="text-slate-900">{vehDetails.vehicle_type || 'Vehicle'}</strong></div>
                                          <div>Reg #: <strong className="text-slate-900">{vehDetails.registration_number || 'N/A'}</strong></div>
                                          <div>Owner: <strong className="text-slate-900">{vehDetails.owner_name || 'N/A'}</strong></div>
                                          {vehDetails.contact_number && (
                                            <div className="pt-1">
                                              <a href={`tel:${vehDetails.contact_number}`} className="text-emerald-700 underline font-bold flex items-center gap-1">
                                                <Phone className="w-3 h-3" /> {vehDetails.contact_number}
                                              </a>
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="text-emerald-950 font-mono text-xs">{String(vehDetails || 'Customer Vehicle Provided')}</div>
                                      )}
                                    </div>
                                  ) : vendorVehDetails ? (
                                    /* Provider Arranged Vehicle - Saved with Edit Details button */
                                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1.5 text-xs">
                                      <div className="flex items-center justify-between">
                                        <span className="text-emerald-800 font-extrabold uppercase text-[10px] flex items-center gap-1">
                                          <Truck className="w-3.5 h-3.5" /> PROVIDER ARRANGED VEHICLE
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setAssignModalOpp(opp);
                                            setAssignMode('VEHICLE');
                                            setIsEditingResource(true);
                                            setVehForm({
                                              vehicle_type: vendorVehDetails.vehicle_type || '10-Wheeler Heavy Tipper',
                                              registration_number: vendorVehDetails.registration_number || '',
                                              owner_name: vendorVehDetails.owner_name || '',
                                              contact_number: vendorVehDetails.contact_number || '',
                                            });
                                          }}
                                          className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[11px] flex items-center gap-1 shadow-sm transition-all"
                                        >
                                          <Edit3 className="w-3 h-3" />
                                          <span>Edit Details</span>
                                        </button>
                                      </div>
                                      <div className="space-y-0.5 text-[11px] font-mono text-emerald-950">
                                        <div>Type: <strong className="text-slate-900">{vendorVehDetails.vehicle_type || 'Vehicle'}</strong></div>
                                        <div>Reg #: <strong className="text-slate-900">{vendorVehDetails.registration_number || 'N/A'}</strong></div>
                                        <div>Owner: <strong className="text-slate-900">{vendorVehDetails.owner_name || 'N/A'}</strong></div>
                                        {vendorVehDetails.contact_number && (
                                          <div className="pt-1">
                                            <a href={`tel:${vendorVehDetails.contact_number}`} className="text-emerald-700 underline font-bold flex items-center gap-1">
                                              <Phone className="w-3 h-3" /> {vendorVehDetails.contact_number}
                                            </a>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    /* Vehicle Arrangement Pending -> Provider Actions */
                                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                                      <div>
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                          <span className="text-slate-600 font-bold uppercase text-[10px]">Vehicle Arrangement</span>
                                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-bold uppercase">Pending</span>
                                        </div>
                                        <span className="text-slate-900 font-semibold">Customer requested vendor to arrange a vehicle.</span>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setAssignModalOpp(opp);
                                            setAssignMode('VEHICLE');
                                            setIsEditingResource(false);
                                            setVehForm({ vehicle_type: '10-Wheeler Heavy Tipper', registration_number: '', owner_name: '', contact_number: '' });
                                          }}
                                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-1 shadow-sm"
                                        >
                                          <Truck className="w-3.5 h-3.5" />
                                          <span>1. I can provide a vehicle</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleBookVehicleMarketplace(opp)}
                                          disabled={submittingResource}
                                          className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-emerald-800 border border-emerald-300 font-bold text-xs flex items-center gap-1 shadow-sm"
                                        >
                                          <Plus className="w-3.5 h-3.5" />
                                          <span>2. I will book a vehicle</span>
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}

                              {/* --- DRIVER ARRANGEMENT SECTION --- */}
                              {isDriverConfigured && (
                                <>
                                  {customerHasDrv ? (
                                    /* Customer Provided Driver */
                                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-1.5 text-xs">
                                      <span className="text-amber-800 font-extrabold uppercase text-[10px] flex items-center gap-1">
                                        <UserCheck className="w-3.5 h-3.5" /> CUSTOMER DRIVER
                                      </span>
                                      {typeof drvDetails === 'object' && drvDetails ? (
                                        <div className="space-y-0.5 text-[11px] font-mono text-amber-950">
                                          <div>Name: <strong className="text-slate-900">{drvDetails.driver_name || 'Driver'}</strong></div>
                                          <div>Licence: <strong className="text-slate-900">{drvDetails.license_number || 'N/A'}</strong></div>
                                          {drvDetails.driver_phone && (
                                            <div className="pt-1">
                                              <a href={`tel:${drvDetails.driver_phone}`} className="text-amber-700 underline font-bold flex items-center gap-1">
                                                <Phone className="w-3 h-3" /> {drvDetails.driver_phone}
                                              </a>
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="text-amber-950 font-mono text-xs">{String(drvDetails || 'Customer Driver Provided')}</div>
                                      )}
                                    </div>
                                  ) : vendorDrvDetails ? (
                                    /* Provider Assigned Driver - Saved with Edit Details button */
                                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-1.5 text-xs">
                                      <div className="flex items-center justify-between">
                                        <span className="text-amber-800 font-extrabold uppercase text-[10px] flex items-center gap-1">
                                          <UserCheck className="w-3.5 h-3.5" /> PROVIDER ASSIGNED DRIVER
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setAssignModalOpp(opp);
                                            setAssignMode('DRIVER');
                                            setIsEditingResource(true);
                                            setDrvForm({
                                              driver_name: vendorDrvDetails.driver_name || '',
                                              driver_phone: vendorDrvDetails.driver_phone || '',
                                              license_number: vendorDrvDetails.license_number || '',
                                            });
                                          }}
                                          className="px-2.5 py-1 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-bold text-[11px] flex items-center gap-1 shadow-sm transition-all"
                                        >
                                          <Edit3 className="w-3 h-3" />
                                          <span>Edit Details</span>
                                        </button>
                                      </div>
                                      <div className="space-y-0.5 text-[11px] font-mono text-amber-950">
                                        <div>Name: <strong className="text-slate-900">{vendorDrvDetails.driver_name || 'Driver'}</strong></div>
                                        <div>Licence: <strong className="text-slate-900">{vendorDrvDetails.license_number || 'N/A'}</strong></div>
                                        {vendorDrvDetails.driver_phone && (
                                          <div className="pt-1">
                                            <a href={`tel:${vendorDrvDetails.driver_phone}`} className="text-amber-700 underline font-bold flex items-center gap-1">
                                              <Phone className="w-3 h-3" /> {vendorDrvDetails.driver_phone}
                                            </a>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    /* Driver Arrangement Pending -> Provider Actions */
                                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                                      <div>
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                          <span className="text-slate-600 font-bold uppercase text-[10px]">Driver Arrangement</span>
                                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-bold uppercase">Pending</span>
                                        </div>
                                        <span className="text-slate-900 font-semibold">Customer requested vendor to arrange a driver.</span>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setAssignModalOpp(opp);
                                            setAssignMode('DRIVER');
                                            setIsEditingResource(false);
                                            setDrvForm({ driver_name: '', driver_phone: '', license_number: '' });
                                          }}
                                          className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs flex items-center gap-1 shadow-sm"
                                        >
                                          <UserCheck className="w-3.5 h-3.5" />
                                          <span>1. I can provide a driver</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleBookDriverMarketplace(opp)}
                                          disabled={submittingResource}
                                          className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-amber-800 border border-amber-300 font-bold text-xs flex items-center gap-1 shadow-sm"
                                        >
                                          <Plus className="w-3.5 h-3.5" />
                                          <span>2. I will book a driver</span>
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}

                              {/* --- OTHER CONFIGURED RESOURCES (Loading, Unloading, Equipment, etc.) --- */}
                              {otherConfiguredResources && otherConfiguredResources.map((res: any) => {
                                if (res.customerProvided) {
                                  return (
                                    <div key={res.key} className="p-3 rounded-xl bg-blue-50 border border-blue-200 space-y-1.5 text-xs">
                                      <span className="text-blue-800 font-extrabold uppercase text-[10px] flex items-center gap-1">
                                        <Package className="w-3.5 h-3.5" /> CUSTOMER {res.name.toUpperCase()}
                                      </span>
                                      <div className="text-blue-950 font-mono text-xs">
                                        {typeof res.customerProvided === 'object' ? JSON.stringify(res.customerProvided) : String(res.customerProvided)}
                                      </div>
                                    </div>
                                  );
                                }
                                if (res.vendorArranged) {
                                  return (
                                    <div key={res.key} className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 space-y-1.5 text-xs">
                                      <div className="flex items-center justify-between">
                                        <span className="text-indigo-800 font-extrabold uppercase text-[10px] flex items-center gap-1">
                                          <Package className="w-3.5 h-3.5" /> PROVIDER ARRANGED {res.name.toUpperCase()}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setAssignModalOpp(opp);
                                            setAssignMode('RESOURCE');
                                            setActiveResourceConfig({ key: res.key, name: res.name });
                                            setIsEditingResource(true);
                                            const v = typeof res.vendorArranged === 'object' ? res.vendorArranged : {};
                                            setResForm({
                                              provider_name: v.provider_name || v.name || '',
                                              contact_number: v.contact_number || v.phone || '',
                                              details: v.notes || v.details || '',
                                            });
                                          }}
                                          className="px-2.5 py-1 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white font-bold text-[11px] flex items-center gap-1 shadow-sm transition-all"
                                        >
                                          <Edit3 className="w-3 h-3" />
                                          <span>Edit Details</span>
                                        </button>
                                      </div>
                                      <div className="space-y-0.5 text-[11px] font-mono text-indigo-950">
                                        {typeof res.vendorArranged === 'object' ? (
                                          <>
                                            {res.vendorArranged.provider_name && <div>Contact / Team: <strong className="text-slate-900">{res.vendorArranged.provider_name}</strong></div>}
                                            {res.vendorArranged.contact_number && (
                                              <div className="pt-0.5">
                                                <a href={`tel:${res.vendorArranged.contact_number}`} className="text-indigo-700 underline font-bold flex items-center gap-1">
                                                  <Phone className="w-3 h-3" /> {res.vendorArranged.contact_number}
                                                </a>
                                              </div>
                                            )}
                                            {res.vendorArranged.notes && <div className="text-slate-700 pt-0.5">{res.vendorArranged.notes}</div>}
                                          </>
                                        ) : (
                                          <div>{String(res.vendorArranged)}</div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                }
                                return (
                                  <div key={res.key} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                                    <div>
                                      <div className="flex items-center gap-1.5 mb-0.5">
                                        <span className="text-slate-600 font-bold uppercase text-[10px]">{res.name}</span>
                                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-bold uppercase">Pending</span>
                                      </div>
                                      <span className="text-slate-900 font-semibold">Customer requested vendor to arrange {res.name}.</span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAssignModalOpp(opp);
                                          setAssignMode('RESOURCE');
                                          setActiveResourceConfig({ key: res.key, name: res.name });
                                          setIsEditingResource(false);
                                          setResForm({ provider_name: '', contact_number: '', details: '' });
                                        }}
                                        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs flex items-center gap-1 shadow-sm"
                                      >
                                        <Package className="w-3.5 h-3.5" />
                                        <span>Arrange {res.name}</span>
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
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
                      className="w-full py-3 rounded-xl bg-black hover:bg-slate-800 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-md"
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
                            className="w-full py-3 rounded-xl bg-black hover:bg-slate-800 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-md"
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
                          className="w-full py-3 rounded-xl bg-black hover:bg-slate-800 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-md"
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
                      className="w-full py-3 rounded-xl bg-black hover:bg-slate-800 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-md"
                    >
                      <ShieldCheck className="w-4 h-4 text-white" />
                      <span>Complete & Confirm Delivery</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setReviewingOpp(opp)}
                      className="w-full py-3 rounded-xl bg-black hover:bg-slate-800 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-md"
                    >
                      <Eye className="w-4 h-4 text-white" />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 overflow-hidden">
          <div className="relative w-full max-w-lg max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] my-auto bg-white border border-slate-200 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-900">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-slate-200 flex-none relative bg-white">
              <button
                onClick={() => setReviewingOpp(null)}
                className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-black hover:bg-slate-100 transition-colors"
                aria-label="Close review"
              >
                <X className="w-5 h-5" />
              </button>

              <span className="px-3 py-1 rounded-lg bg-black text-white text-[10px] font-extrabold uppercase tracking-wider block w-fit mb-2">
                SERVICE REQUEST REVIEW
              </span>
              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900">ORDER DETAILS</h3>
              <p className="text-xs text-slate-500 mt-1">Review customer order details before deciding to accept or decline.</p>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-4">
              {(() => {
                const meta = reviewingOpp.metadata || {};
                const cf = meta.custom_fields || {};
                const rawQuantity = reviewingOpp.quantity ?? meta.quantity ?? cf.quantity ?? meta.quantity_bags ?? cf.quantity_bags ?? meta.cargo_weight_tons ?? cf.cargo_weight_tons ?? meta.farm_area_acres ?? cf.farm_area_acres ?? meta.quantity_needed;
                const quantity = (rawQuantity !== undefined && rawQuantity !== null && rawQuantity !== '') 
                  ? (!isNaN(Number(rawQuantity)) ? Number(rawQuantity).toLocaleString('en-IN') : String(rawQuantity)) 
                  : '1';

                const unitOfMeasure = reviewingOpp.price_unit ? reviewingOpp.price_unit.replace('PER_', '').toLowerCase() : (meta.unit || 'units');
                const categoryName = reviewingOpp.category?.name || meta.category_name || 'Service Order';
                const pickupLoc = meta.pickup_location || meta.source_location || cf.pickup_location || cf.source_location || 'Source Location / Dispatch Yard';
                const deliveryLoc = reviewingOpp.address_text || meta.delivery_location || 'Customer Selected Delivery Address';

                const placedDateFormatted = reviewingOpp.created_at
                  ? new Date(reviewingOpp.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : 'Recently Placed';

                const reqDate = reviewingOpp.scheduled_start 
                  ? new Date(reviewingOpp.scheduled_start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                  : (meta.booking_date || meta.scheduled_date || 'Flexible / On-Demand');

                const reqTime = meta.booking_time
                  ? meta.booking_time
                  : (reviewingOpp.scheduled_start ? new Date(reviewingOpp.scheduled_start).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '');

                const orderTotal = reviewingOpp.total_price || reviewingOpp.budget_max || meta.charges_breakdown?.total || (reviewingOpp.unit_price && reviewingOpp.quantity ? reviewingOpp.unit_price * reviewingOpp.quantity : 0);
                const unitPrice = reviewingOpp.unit_price || meta.unit_price || (reviewingOpp.quantity && orderTotal ? orderTotal / reviewingOpp.quantity : orderTotal);
                const subtotal = meta.subtotal || (unitPrice > 0 && typeof rawQuantity === 'number' ? unitPrice * rawQuantity : orderTotal);

                const { isVehicleConfigured, isDriverConfigured, customerHasVeh, customerHasDrv } = getResourceConfig(reviewingOpp);

                return (
                  <div className="space-y-4 bg-slate-50 border border-slate-200 p-5 rounded-2xl text-xs">
                    {/* Order Reference & Timestamps */}
                    <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                      <span className="font-mono text-black font-extrabold text-sm">
                        Order #{reviewingOpp.id.slice(0, 8)}
                      </span>
                      <span className="text-slate-500 font-mono text-[11px]">
                        Placed: {placedDateFormatted}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1">
                        <span className="text-slate-500 font-bold uppercase text-[10px] block">Customer</span>
                        <span className="text-slate-900 font-extrabold text-sm">{reviewingOpp.user?.full_name || 'Customer'}</span>
                        <span className="text-slate-500 font-mono italic text-[11px] block">
                          {reviewingOpp.user?.phone ? reviewingOpp.user.phone : 'Contact revealed after acceptance'}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1">
                        <span className="text-slate-500 font-bold uppercase text-[10px] block">Service / Category</span>
                        <span className="text-slate-900 font-extrabold text-sm">{categoryName}</span>
                        <span className="text-slate-500 text-[11px] truncate block">{reviewingOpp.title}</span>
                      </div>
                    </div>

                    {/* Multi-Item / Brand Breakdown */}
                    {Array.isArray(meta?.brand_items) && meta.brand_items.length > 0 ? (
                      <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2">
                        <span className="text-slate-900 font-extrabold uppercase text-[10px] flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-slate-700" />
                          <span>Brand Items Breakdown ({meta.brand_items.length})</span>
                        </span>
                        <div className="space-y-1.5">
                          {meta.brand_items.map((it: any, idx: number) => (
                            <div key={idx} className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-xs">
                              <div>
                                <div className="font-bold text-slate-900">{it.title}</div>
                                <div className="text-[11px] text-slate-500 font-mono">Qty: {it.quantity || 1} × ₹{(it.unitPrice || 0).toLocaleString()}</div>
                              </div>
                              <div className="text-right font-extrabold font-mono text-black">
                                ₹{((it.totalPrice || (it.unitPrice || 0) * (it.quantity || 1))).toLocaleString()}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : Array.isArray(meta?.cart_items) && meta.cart_items.length > 0 ? (
                      <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2">
                        <span className="text-slate-900 font-extrabold uppercase text-[10px] flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-slate-700" />
                          <span>Cart Items ({meta.cart_items.length})</span>
                        </span>
                        <div className="space-y-1.5">
                          {meta.cart_items.map((it: any, idx: number) => (
                            <div key={idx} className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-xs">
                              <div>
                                <div className="font-bold text-slate-900">{it.title}</div>
                                <div className="text-[11px] text-slate-500 font-mono">Qty: {it.quantity || 1} × ₹{(it.unitPrice || 0).toLocaleString()}</div>
                              </div>
                              <div className="text-right font-extrabold font-mono text-black">
                                ₹{((it.totalPrice || (it.unitPrice || 0) * (it.quantity || 1))).toLocaleString()}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {/* Quantity & Pricing Details */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1">
                        <span className="text-slate-500 font-bold uppercase text-[10px] block">Quantity Ordered</span>
                        <span className="text-black font-extrabold text-sm font-mono">{quantity} {unitOfMeasure}</span>
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1">
                        <span className="text-slate-500 font-bold uppercase text-[10px] block">Total Order Payable</span>
                        <span className="text-slate-900 font-extrabold text-sm font-mono">
                          {orderTotal > 0 ? `₹${Number(orderTotal).toLocaleString('en-IN')}` : 'Market Quote / On-Demand'}
                        </span>
                      </div>
                    </div>

                    {unitPrice > 0 && (
                      <div className="p-3 rounded-xl bg-white border border-slate-200 flex items-center justify-between font-mono text-xs">
                        <span className="text-slate-500 font-bold uppercase text-[10px]">Item Unit Price</span>
                        <span className="text-slate-800 font-bold">
                          ₹{Number(unitPrice).toLocaleString('en-IN')} / {unitOfMeasure}
                        </span>
                      </div>
                    )}

                    {/* Pickup, Delivery & Scheduled Date */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1">
                        <span className="text-slate-500 font-bold uppercase text-[10px] block">Pickup Location</span>
                        <span className="text-slate-800 font-medium truncate block">{pickupLoc}</span>
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1">
                        <span className="text-slate-500 font-bold uppercase text-[10px] block">Delivery Location</span>
                        <span className="text-slate-800 font-semibold truncate block">{deliveryLoc}</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
                      <span className="text-slate-500 font-bold uppercase text-[10px] block">Requested Service / Delivery Date</span>
                      <span className="text-slate-900 font-bold text-xs font-mono">
                        {reqDate} {reqTime ? `(${reqTime})` : ''}
                      </span>
                    </div>

                    {/* Labour Service Specifics */}
                    {(reviewingOpp.category?.slug?.includes('labour') || cf.number_of_workers || meta.number_of_workers) && (
                      <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2">
                        <span className="text-slate-900 font-extrabold uppercase text-[10px] flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-slate-700" />
                          <span>LABOUR WORKFORCE DETAILS</span>
                        </span>
                        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                          <div>Workers Required: <strong className="text-slate-900">{cf.number_of_workers || meta.number_of_workers || 1} Workers</strong></div>
                          <div>Labour Type: <strong className="text-slate-900">{cf.labour_type || cf.trade_specialty || cf.farm_task || 'General Labour'}</strong></div>
                          <div>Pricing Method: <strong className="text-slate-700">{cf.pricing_method || 'Per Worker / Day'}</strong></div>
                          <div>Rate per Worker: <strong className="text-black font-bold">₹{cf.rate_per_unit || 500}</strong></div>
                        </div>
                      </div>
                    )}

                    {/* Dynamic Service Resource Requirement Choices */}
                    {(isVehicleConfigured || isDriverConfigured) && (
                      <div className={`grid ${isVehicleConfigured && isDriverConfigured ? 'grid-cols-2' : 'grid-cols-1'} gap-3 pt-2 border-t border-slate-200`}>
                        {isVehicleConfigured && (
                          <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1">
                            <span className="text-slate-500 font-bold uppercase text-[10px] block">Vehicle Choice</span>
                            <span className="text-slate-900 font-bold text-xs flex items-center gap-1">
                              <Truck className="w-3.5 h-3.5 text-slate-700" />
                              <span>{customerHasVeh ? 'Customer will provide vehicle' : 'Customer needs vehicle'}</span>
                            </span>
                          </div>
                        )}

                        {isDriverConfigured && (
                          <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1">
                            <span className="text-slate-500 font-bold uppercase text-[10px] block">Driver Choice</span>
                            <span className="text-slate-900 font-bold text-xs flex items-center gap-1">
                              <UserCheck className="w-3.5 h-3.5 text-slate-700" />
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
            <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3 flex-none">
              <button
                type="button"
                onClick={() => handleDeclineOrder(reviewingOpp)}
                className="w-1/2 py-3.5 rounded-xl border border-slate-300 text-slate-700 hover:text-black hover:bg-white font-bold text-xs flex items-center justify-center gap-2 transition-all"
              >
                <Ban className="w-4 h-4 text-slate-500" />
                <span>Decline</span>
              </button>

              <button
                type="button"
                onClick={() => handleAcceptOrder(reviewingOpp)}
                disabled={acceptingId === reviewingOpp.id}
                className="w-1/2 py-3.5 rounded-xl bg-black hover:bg-slate-800 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 overflow-hidden">
          <div className="relative w-full max-w-md max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] my-auto bg-white border border-slate-200 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-900">
            <div className="p-5 sm:p-6 border-b border-slate-200 flex-none relative bg-white">
              <button
                onClick={() => setPickupModalOpp(null)}
                className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-black hover:bg-slate-100 transition-colors"
                aria-label="Close pickup"
              >
                <X className="w-5 h-5" />
              </button>

              <span className="px-3 py-1 rounded-lg bg-black text-white text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 w-fit mb-2">
                <QrCode className="w-3.5 h-3.5" />
                <span>PHARMACY PICKUP VERIFICATION</span>
              </span>
              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900">Scan Pharmacy Order QR</h3>
              <p className="text-xs text-slate-500 mt-1">
                Scan or enter the Pharmacy Order QR code upon medicine pickup to confirm logistics transition.
              </p>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Pharmacy</span>
                  <span className="text-slate-900 font-extrabold">{pickupModalOpp.metadata?.pickup_location || 'Choutuppal Pharmacy'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Order Title</span>
                  <span className="text-slate-700 font-medium truncate max-w-[180px]">{pickupModalOpp.title}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                  Pharmacy Order QR Code / Barcode *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={qrCodeInput}
                    onChange={(e) => setQrCodeInput(e.target.value)}
                    placeholder="Enter or scan QR (e.g. PHARM-QR-100234)"
                    className="w-full px-4 py-3 rounded-xl bg-white border border-slate-300 text-slate-900 font-mono text-sm focus:outline-none focus:border-black"
                  />
                  <QrCode className="w-5 h-5 text-slate-400 absolute right-3.5 top-3.5" />
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-end flex-none">
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
                className="w-full py-3.5 rounded-xl bg-black hover:bg-slate-800 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 overflow-hidden">
          <div className="relative w-full max-w-md max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] my-auto bg-white border border-slate-200 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-900">
            <div className="p-5 sm:p-6 border-b border-slate-200 flex-none relative bg-white">
              <button
                onClick={() => setDeliveryModalOpp(null)}
                className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-black hover:bg-slate-100 transition-colors"
                aria-label="Close delivery"
              >
                <X className="w-5 h-5" />
              </button>

              <span className="px-3 py-1 rounded-lg bg-black text-white text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 w-fit mb-2">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>DOORSTEP DELIVERY VERIFICATION</span>
              </span>
              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900">Confirm Medicine Handover</h3>
              <p className="text-xs text-slate-500 mt-1">
                Scan customer Trust Card QR or verify signature upon doorstep handover.
              </p>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Customer</span>
                  <span className="text-slate-900 font-extrabold">{deliveryModalOpp.user?.full_name || 'Customer'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Delivery Location</span>
                  <span className="text-slate-700 font-medium truncate max-w-[180px]">
                    {deliveryModalOpp.address_text || deliveryModalOpp.metadata?.delivery_location || 'Customer Address'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                  Customer Trust Card QR / Delivery Code *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={trustCardInput}
                    onChange={(e) => setTrustCardInput(e.target.value)}
                    placeholder="Enter or scan Customer Trust Card QR"
                    className="w-full px-4 py-3 rounded-xl bg-white border border-slate-300 text-slate-900 font-mono text-sm focus:outline-none focus:border-black"
                  />
                  <QrCode className="w-5 h-5 text-slate-400 absolute right-3.5 top-3.5" />
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-end flex-none">
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
                className="w-full py-3.5 rounded-xl bg-black hover:bg-slate-800 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 overflow-hidden">
          <div className="relative w-full max-w-lg max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] my-auto bg-white border border-slate-200 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-900">
            
            {/* Modal Fixed Header */}
            <div className="p-5 sm:p-6 border-b border-slate-200 flex-none relative bg-white">
              <button
                type="button"
                onClick={() => {
                  setAssignModalOpp(null);
                  setAssignMode(null);
                  setAssignError(null);
                }}
                className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-black hover:bg-slate-100 transition-colors"
                aria-label="Close form"
              >
                <X className="w-5 h-5" />
              </button>

              <span className="px-3 py-1 rounded-lg bg-black text-white text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 w-fit mb-2">
                {assignMode === 'VEHICLE' ? <Truck className="w-3.5 h-3.5" /> : assignMode === 'DRIVER' ? <UserCheck className="w-3.5 h-3.5" /> : <Package className="w-3.5 h-3.5" />}
                <span>{isEditingResource ? `EDIT ${assignMode === 'RESOURCE' ? (activeResourceConfig?.name || 'RESOURCE').toUpperCase() : assignMode} DETAILS` : `ASSIGN ${assignMode === 'RESOURCE' ? (activeResourceConfig?.name || 'RESOURCE').toUpperCase() : assignMode} DETAILS`}</span>
              </span>
              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                {isEditingResource
                  ? assignMode === 'VEHICLE' ? 'Edit Vehicle Details' : assignMode === 'DRIVER' ? 'Edit Driver Details' : `Edit ${activeResourceConfig?.name || 'Resource'} Details`
                  : assignMode === 'VEHICLE' ? 'Assign Vehicle Details' : assignMode === 'DRIVER' ? 'Assign Driver Details' : `Arrange ${activeResourceConfig?.name || 'Resource'}`}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Order #{assignModalOpp.id.slice(0, 8).toUpperCase()} • {assignModalOpp.title}
              </p>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-5 sm:p-6 space-y-4 touch-pan-y overscroll-contain">
              {/* Order Summary Box */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-slate-700">
                  <span className="text-slate-500 font-semibold">Service Request:</span>
                  <span className="text-slate-900 font-bold">{assignModalOpp.title}</span>
                </div>
                {((assignModalOpp as any).price || assignModalOpp.budget_min || assignModalOpp.budget_max) && (
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="text-slate-500 font-semibold">Price / Payout:</span>
                    <span className="text-black font-extrabold">
                      ₹{(assignModalOpp as any).price || assignModalOpp.budget_min || assignModalOpp.budget_max}
                    </span>
                  </div>
                )}
                {((assignModalOpp as any).customer_location || assignModalOpp.address_text) && (
                  <div className="flex items-start justify-between text-slate-700 gap-2">
                    <span className="text-slate-500 font-semibold flex-shrink-0">Location:</span>
                    <span className="text-slate-800 text-right truncate">
                      {(assignModalOpp as any).customer_location || assignModalOpp.address_text}
                    </span>
                  </div>
                )}
              </div>

              {/* Error Alert Box */}
              {assignError && (
                <div ref={assignErrorRef} className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5 shadow-sm animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <strong className="block font-bold text-rose-900 mb-0.5">Submission Error</strong>
                    <span>{assignError}</span>
                  </div>
                </div>
              )}

              {/* Form Content */}
              {assignMode === 'VEHICLE' ? (
                <form id="assign-vehicle-form" onSubmit={handleAssignVehicleSubmit} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Vehicle Type *</label>
                    <select
                      value={vehForm.vehicle_type}
                      onChange={(e) => {
                        setAssignError(null);
                        setVehForm({ ...vehForm, vehicle_type: e.target.value });
                      }}
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-semibold focus:outline-none focus:border-black"
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
                    <label className="block text-slate-700 font-bold mb-1">Vehicle Registration Number *</label>
                    <input
                      type="text"
                      placeholder="e.g. TS-08-AB-1234"
                      value={vehForm.registration_number}
                      onChange={(e) => {
                        setAssignError(null);
                        setVehForm({ ...vehForm, registration_number: e.target.value });
                      }}
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-mono focus:outline-none focus:border-black"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Vehicle Owner / Fleet Name *</label>
                    <input
                      type="text"
                      placeholder="Owner Full Name / Fleet Provider"
                      value={vehForm.owner_name}
                      onChange={(e) => {
                        setAssignError(null);
                        setVehForm({ ...vehForm, owner_name: e.target.value });
                      }}
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-black"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Vehicle Contact Phone *</label>
                    <input
                      type="tel"
                      placeholder="+91 Mobile Number"
                      value={vehForm.contact_number}
                      onChange={(e) => {
                        setAssignError(null);
                        setVehForm({ ...vehForm, contact_number: sanitizePhoneInput(e.target.value) });
                      }}
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-mono focus:outline-none focus:border-black"
                      required
                    />
                  </div>
                </form>
              ) : assignMode === 'DRIVER' ? (
                <form id="assign-driver-form" onSubmit={handleAssignDriverSubmit} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Driver Name *</label>
                    <input
                      type="text"
                      placeholder="Driver Full Name"
                      value={drvForm.driver_name}
                      onChange={(e) => {
                        setAssignError(null);
                        setDrvForm({ ...drvForm, driver_name: e.target.value });
                      }}
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-black"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Driver Phone Number *</label>
                    <input
                      type="tel"
                      placeholder="+91 Mobile Number"
                      value={drvForm.driver_phone}
                      onChange={(e) => {
                        setAssignError(null);
                        setDrvForm({ ...drvForm, driver_phone: sanitizePhoneInput(e.target.value) });
                      }}
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-mono focus:outline-none focus:border-black"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Driving License Number</label>
                    <input
                      type="text"
                      placeholder="e.g. DL-TEL-2023-8899"
                      value={drvForm.license_number}
                      onChange={(e) => {
                        setAssignError(null);
                        setDrvForm({ ...drvForm, license_number: e.target.value });
                      }}
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-mono focus:outline-none focus:border-black"
                    />
                  </div>
                </form>
              ) : (
                <form id="assign-resource-form" onSubmit={handleAssignResourceSubmit} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Arranged By / Team / Contact Person *</label>
                    <input
                      type="text"
                      placeholder={`Name of person or company providing ${activeResourceConfig?.name || 'resource'}`}
                      value={resForm.provider_name}
                      onChange={(e) => {
                        setAssignError(null);
                        setResForm({ ...resForm, provider_name: e.target.value });
                      }}
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-black"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Contact Phone Number *</label>
                    <input
                      type="tel"
                      placeholder="+91 Mobile Number"
                      value={resForm.contact_number}
                      onChange={(e) => {
                        setAssignError(null);
                        setResForm({ ...resForm, contact_number: sanitizePhoneInput(e.target.value) });
                      }}
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-mono focus:outline-none focus:border-black"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Arrangement Details / Notes</label>
                    <textarea
                      rows={3}
                      placeholder={`Provide specifics (e.g. 4 dedicated loaders, JCB crane model, reporting time)`}
                      value={resForm.details}
                      onChange={(e) => {
                        setAssignError(null);
                        setResForm({ ...resForm, details: e.target.value });
                      }}
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-black"
                    />
                  </div>
                </form>
              )}
            </div>

            {/* Modal Fixed Footer with Action Buttons */}
            <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3 flex-none">
              <button
                type="button"
                onClick={() => {
                  setAssignModalOpp(null);
                  setAssignMode(null);
                  setAssignError(null);
                }}
                className="px-5 py-2.5 rounded-xl border border-slate-300 hover:bg-white text-slate-700 hover:text-black text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                form={assignMode === 'VEHICLE' ? 'assign-vehicle-form' : assignMode === 'DRIVER' ? 'assign-driver-form' : 'assign-resource-form'}
                disabled={submittingResource}
                className="px-6 py-2.5 rounded-xl bg-black hover:bg-slate-800 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-50"
              >
                {submittingResource ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>{isEditingResource ? 'Update & Notify Customer' : 'Confirm & Notify Customer'}</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MARKETPLACE VEHICLE/DRIVER SELECTION & BOOKING CONFIRMATION MODAL */}
      {marketplaceModalOpp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 overflow-hidden">
          <div className="relative w-full max-w-lg max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] my-auto bg-white border border-slate-200 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-900">
            
            {/* Modal Fixed Header */}
            <div className="p-5 sm:p-6 border-b border-slate-200 flex-none relative bg-white">
              <button
                type="button"
                onClick={() => {
                  setMarketplaceModalOpp(null);
                  setMarketplaceError(null);
                }}
                className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-black hover:bg-slate-100 transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>

              <span className="px-3 py-1 rounded-lg bg-black text-white text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 w-fit mb-2">
                <Truck className="w-3.5 h-3.5" />
                <span>MARKETPLACE RESOURCE SELECTION</span>
              </span>
              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                Book via Transport Marketplace
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Order #{marketplaceModalOpp.id.slice(0, 8).toUpperCase()} • {marketplaceModalOpp.title}
              </p>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-5 sm:p-6 space-y-4 touch-pan-y overscroll-contain">
              {/* Order Summary Box */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-slate-700">
                  <span className="text-slate-500 font-semibold">Service Request:</span>
                  <span className="text-slate-900 font-bold">{marketplaceModalOpp.title}</span>
                </div>
                {((marketplaceModalOpp as any).price || marketplaceModalOpp.budget_min || marketplaceModalOpp.budget_max) && (
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="text-slate-500 font-semibold">Price / Payout:</span>
                    <span className="text-black font-extrabold">
                      ₹{(marketplaceModalOpp as any).price || marketplaceModalOpp.budget_min || marketplaceModalOpp.budget_max}
                    </span>
                  </div>
                )}
                {((marketplaceModalOpp as any).customer_location || marketplaceModalOpp.address_text) && (
                  <div className="flex items-start justify-between text-slate-700 gap-2">
                    <span className="text-slate-500 font-semibold flex-shrink-0">Location:</span>
                    <span className="text-slate-800 text-right truncate">
                      {(marketplaceModalOpp as any).customer_location || marketplaceModalOpp.address_text}
                    </span>
                  </div>
                )}
              </div>

              {/* Error Alert Box */}
              {marketplaceError && (
                <div ref={marketplaceErrorRef} className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5 shadow-sm animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <strong className="block font-bold text-rose-900 mb-0.5">Booking Error</strong>
                    <span>{marketplaceError}</span>
                  </div>
                </div>
              )}

              <form id="marketplace-booking-form" onSubmit={handleConfirmMarketplaceBooking} className="space-y-4 text-xs">
                {(marketplaceModalType === 'VEHICLE' || marketplaceModalType === 'BOTH') && (
                  <div className="space-y-3 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-slate-900 font-extrabold uppercase text-[10px] block">Fleet Vehicle Selection</span>
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Select Marketplace Fleet Vehicle *</label>
                      <select
                        value={mpVehForm.vehicle_type}
                        onChange={(e) => {
                          setMarketplaceError(null);
                          setMpVehForm({ ...mpVehForm, vehicle_type: e.target.value });
                        }}
                        className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-semibold focus:outline-none focus:border-black"
                        required
                      >
                        <option value="10-Wheeler Heavy Tipper">10-Wheeler Heavy Tipper (Choutuppal Yard Fleet)</option>
                        <option value="12-Wheeler Heavy Hauler">12-Wheeler Heavy Hauler (NH65 Transport Hub)</option>
                        <option value="Tata Ace Commercial">Tata Ace Commercial Van (Local Express)</option>
                        <option value="Tractor Trailer">Tractor Heavy Trailer (Rural Transport Co)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Registration / Fleet No. *</label>
                      <input
                        type="text"
                        value={mpVehForm.registration_number}
                        onChange={(e) => {
                          setMarketplaceError(null);
                          setMpVehForm({ ...mpVehForm, registration_number: e.target.value });
                        }}
                        className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Fleet Provider Name *</label>
                      <input
                        type="text"
                        value={mpVehForm.owner_name}
                        onChange={(e) => {
                          setMarketplaceError(null);
                          setMpVehForm({ ...mpVehForm, owner_name: e.target.value });
                        }}
                        className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Fleet Contact Phone *</label>
                      <input
                        type="tel"
                        value={mpVehForm.contact_number}
                        onChange={(e) => {
                          setMarketplaceError(null);
                          setMpVehForm({ ...mpVehForm, contact_number: sanitizePhoneInput(e.target.value) });
                        }}
                        className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-mono"
                        required
                      />
                    </div>
                  </div>
                )}

                {(marketplaceModalType === 'DRIVER' || marketplaceModalType === 'BOTH') && (
                  <div className="space-y-3 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-slate-900 font-extrabold uppercase text-[10px] block">Commercial Driver Selection</span>
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Commercial Driver Name *</label>
                      <input
                        type="text"
                        value={mpDrvForm.driver_name}
                        onChange={(e) => {
                          setMarketplaceError(null);
                          setMpDrvForm({ ...mpDrvForm, driver_name: e.target.value });
                        }}
                        className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Driver Phone Number *</label>
                      <input
                        type="tel"
                        value={mpDrvForm.driver_phone}
                        onChange={(e) => {
                          setMarketplaceError(null);
                          setMpDrvForm({ ...mpDrvForm, driver_phone: sanitizePhoneInput(e.target.value) });
                        }}
                        className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Driving License Number</label>
                      <input
                        type="text"
                        value={mpDrvForm.license_number}
                        onChange={(e) => {
                          setMarketplaceError(null);
                          setMpDrvForm({ ...mpDrvForm, license_number: e.target.value });
                        }}
                        className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-mono"
                      />
                    </div>
                  </div>
                )}
              </form>
            </div>

            {/* Modal Fixed Footer with Action Buttons */}
            <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3 flex-none">
              <button
                type="button"
                onClick={() => {
                  setMarketplaceModalOpp(null);
                  setMarketplaceError(null);
                }}
                className="px-5 py-2.5 rounded-xl border border-slate-300 hover:bg-white text-slate-700 hover:text-black text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="marketplace-booking-form"
                disabled={submittingResource}
                className="px-6 py-2.5 rounded-xl bg-black hover:bg-slate-800 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-50"
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
