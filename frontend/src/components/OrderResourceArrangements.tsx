'use client';

import React from 'react';
import { Opportunity } from '@/lib/api';
import { Truck, User, Package, Wrench, Users, Phone, CheckCircle2, Clock, AlertCircle, Sparkles, ShieldCheck } from 'lucide-react';

interface OrderResourceArrangementsProps {
  opp: Opportunity;
  className?: string;
}

export default function OrderResourceArrangements({ opp, className = '' }: OrderResourceArrangementsProps) {
  const cat = opp.category;
  const meta = opp.metadata || {};
  const cf = (opp as any).custom_fields || (meta as any).custom_fields || {};
  const resSelections = meta.resource_selections || {};
  const vendorResDetails = meta.vendor_resource_details || {};

  const resourcesList = cat?.resources || [];
  const reqMap: Record<string, any> = (cat?.resource_requirements as any) || {};

  // 1. VEHICLE / TRANSPORTATION
  const isVehicleConfigured =
    (resourcesList && resourcesList.some((r) => (r.key === 'vehicle' || r.name?.toLowerCase().includes('vehicle')) && r.requirement_level !== 'NOT_APPLICABLE' && r.active !== false)) ||
    (reqMap['vehicle'] !== undefined && reqMap['vehicle'] !== 'NOT_APPLICABLE') ||
    Boolean(resSelections.vehicle) ||
    Boolean(meta.vehicle_details || cf.vehicle_details || meta.vendor_vehicle_details || vendorResDetails?.vehicle);

  const vendorVeh =
    meta.vendor_vehicle_details ||
    vendorResDetails?.vehicle?.details ||
    (resSelections.vehicle?.assigned_by === 'VENDOR' ? resSelections.vehicle?.details : null) ||
    resSelections.vehicle?.vendor_details ||
    null;

  let customerHasVeh = false;
  if (resSelections.vehicle) {
    const sel = resSelections.vehicle.selection || resSelections.vehicle.choice;
    customerHasVeh = sel === 'HAS_RESOURCE' || sel === 'HAVE_VEHICLE' || String(sel).startsWith('HAVE_');
  } else if (meta.vehicle_option_code) {
    customerHasVeh = meta.vehicle_option_code === 'HAVE_VEHICLE';
  } else if (meta.has_vehicle !== undefined) {
    customerHasVeh = Boolean(meta.has_vehicle);
  }

  const custVehDetails =
    customerHasVeh || (meta.vehicle_details && !vendorVeh)
      ? meta.vehicle_details || cf.vehicle_details || (resSelections.vehicle?.details) || null
      : null;

  // 2. DRIVER / OPERATOR
  const isDriverConfigured =
    (resourcesList && resourcesList.some((r) => (r.key === 'driver' || r.name?.toLowerCase().includes('driver')) && r.requirement_level !== 'NOT_APPLICABLE' && r.active !== false)) ||
    (reqMap['driver'] !== undefined && reqMap['driver'] !== 'NOT_APPLICABLE') ||
    Boolean(resSelections.driver) ||
    Boolean(meta.driver_details || cf.driver_details || meta.vendor_driver_details || vendorResDetails?.driver);

  const vendorDrv =
    meta.vendor_driver_details ||
    vendorResDetails?.driver?.details ||
    (resSelections.driver?.assigned_by === 'VENDOR' ? resSelections.driver?.details : null) ||
    resSelections.driver?.vendor_details ||
    null;

  let customerHasDrv = false;
  if (resSelections.driver) {
    const sel = resSelections.driver.selection || resSelections.driver.choice;
    customerHasDrv = sel === 'HAS_RESOURCE' || sel === 'HAVE_DRIVER' || String(sel).startsWith('HAVE_');
  } else if (meta.driver_option_code) {
    customerHasDrv = meta.driver_option_code === 'HAVE_DRIVER';
  } else if (meta.has_driver !== undefined) {
    customerHasDrv = Boolean(meta.has_driver);
  }

  const custDrvDetails =
    customerHasDrv || (meta.driver_details && !vendorDrv)
      ? meta.driver_details || cf.driver_details || (resSelections.driver?.details) || null
      : null;

  // 3. OTHER CONFIGURED RESOURCES (Loading, Unloading, Equipment, Labour, etc.)
  const knownKeys = new Set(['vehicle', 'driver']);
  const otherResources: Array<{
    key: string;
    name: string;
    icon?: string;
    vendorArranged: any;
    customerProvided: any;
    isPending: boolean;
  }> = [];

  // Check Category-defined active resources
  if (resourcesList && resourcesList.length > 0) {
    resourcesList.forEach((r) => {
      const lk = r.key.toLowerCase();
      if (knownKeys.has(lk) || lk.includes('vehicle') || lk.includes('driver')) return;
      if (r.active === false || r.requirement_level === 'NOT_APPLICABLE') return;

      const custSel = resSelections[r.key];
      const savedVendor =
        vendorResDetails[r.key]?.details ||
        meta[`vendor_${r.key}_details`] ||
        custSel?.vendor_details ||
        null;

      const isCust =
        custSel?.choice?.startsWith('HAVE_') ||
        custSel?.choice === 'HAS_RESOURCE' ||
        meta[`has_${r.key}`] === true;

      const custDetails = isCust ? custSel?.details || meta[`${r.key}_details`] || null : null;

      otherResources.push({
        key: r.key,
        name: r.name || r.key.replace(/_/g, ' ').toUpperCase(),
        vendorArranged: savedVendor,
        customerProvided: custDetails,
        isPending: !savedVendor && !custDetails,
      });
      knownKeys.add(r.key);
    });
  }

  // Check any extra resources in metadata.vendor_resource_details that weren't in category list
  Object.keys(vendorResDetails).forEach((vk) => {
    if (knownKeys.has(vk) || vk === 'vehicle' || vk === 'driver') return;
    const vEntry = vendorResDetails[vk];
    otherResources.push({
      key: vk,
      name: vEntry?.resource_name || vk.replace(/_/g, ' ').toUpperCase(),
      vendorArranged: vEntry?.details || vEntry,
      customerProvided: null,
      isPending: false,
    });
    knownKeys.add(vk);
  });

  const hasAnyResources = isVehicleConfigured || isDriverConfigured || otherResources.length > 0;
  if (!hasAnyResources) {
    return null;
  }

  const renderDetailsMap = (details: any) => {
    if (!details) return null;
    if (typeof details === 'string') {
      return <div className="text-slate-800 font-mono text-xs">{details}</div>;
    }
    if (typeof details !== 'object') {
      return <div className="text-slate-800 font-mono text-xs">{String(details)}</div>;
    }

    const entries = Object.entries(details).filter(
      ([k, v]) => v !== undefined && v !== null && String(v).trim() !== '' && !k.startsWith('_')
    );

    if (entries.length === 0) {
      return <div className="text-xs text-slate-500 italic">Confirmed without additional notes.</div>;
    }

    return (
      <div className="space-y-1.5 text-xs text-slate-800">
        {entries.map(([k, v]) => {
          const label = k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          const isPhone = k.toLowerCase().includes('phone') || k.toLowerCase().includes('contact') || k.toLowerCase().includes('mobile');
          const valStr = String(v);

          return (
            <div key={k} className="flex flex-wrap items-baseline gap-1.5 font-mono">
              <span className="text-slate-500 font-sans text-[11px] min-w-[100px]">{label}:</span>
              {isPhone ? (
                <a
                  href={`tel:${valStr}`}
                  className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-bold underline"
                >
                  <Phone className="w-3 h-3" />
                  <span>{valStr}</span>
                </a>
              ) : (
                <strong className="text-slate-900 break-all">{valStr}</strong>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`bg-white border border-slate-200 rounded-3xl p-6 shadow-md space-y-4 ${className}`}>
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Truck className="w-5 h-5 text-black" />
            <span>Resource & Logistics Arrangements</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Confirmed transportation, operator, loading, unloading, and equipment fulfillment details.
          </p>
        </div>
        <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 text-[10px] font-bold uppercase tracking-wider border border-slate-300 flex items-center gap-1">
          <Clock className="w-3 h-3 text-slate-600" />
          <span>Live Status</span>
        </span>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 pt-1">
        {/* 1. VEHICLE / TRANSPORTATION CARD */}
        {isVehicleConfigured && (
          <div
            className={`p-4 rounded-2xl border transition-all ${
              vendorVeh
                ? 'bg-emerald-50/70 border-emerald-300'
                : custVehDetails
                ? 'bg-blue-50/70 border-blue-200'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 text-slate-900">
                <Truck className="w-3.5 h-3.5 text-slate-800" />
                <span>TRANSPORT VEHICLE</span>
              </span>
              {vendorVeh ? (
                <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-bold uppercase tracking-wider shadow-xs">
                  Provider Arranged
                </span>
              ) : custVehDetails ? (
                <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white text-[9px] font-bold uppercase tracking-wider shadow-xs">
                  Customer Provided
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[9px] font-bold uppercase tracking-wider">
                  Arrangement Pending
                </span>
              )}
            </div>

            {vendorVeh ? (
              <div className="space-y-1 text-xs text-slate-800 font-mono">
                <div>
                  <span className="text-slate-500 font-sans">Type:</span>{' '}
                  <strong className="text-slate-900">{vendorVeh.vehicle_type || 'Commercial Vehicle'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 font-sans">Registration #:</span>{' '}
                  <strong className="text-slate-900">{vendorVeh.registration_number || 'N/A'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 font-sans">Owner / Fleet:</span>{' '}
                  <strong className="text-slate-900">{vendorVeh.owner_name || 'N/A'}</strong>
                </div>
                {vendorVeh.contact_number && (
                  <div className="pt-2 flex items-center gap-2">
                    <span className="text-slate-500 font-sans">Contact:</span>
                    <a
                      href={`tel:${vendorVeh.contact_number}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-all"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{vendorVeh.contact_number}</span>
                    </a>
                  </div>
                )}
              </div>
            ) : custVehDetails ? (
              <div className="space-y-1 text-xs text-slate-800 font-mono">
                {typeof custVehDetails === 'object' ? (
                  <>
                    <div>
                      <span className="text-slate-500 font-sans">Type:</span>{' '}
                      <strong className="text-slate-900">{custVehDetails.vehicle_type || 'Vehicle'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 font-sans">Reg #:</span>{' '}
                      <strong className="text-slate-900">{custVehDetails.registration_number || 'N/A'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 font-sans">Owner:</span>{' '}
                      <strong className="text-slate-900">{custVehDetails.owner_name || 'Customer'}</strong>
                    </div>
                  </>
                ) : (
                  <div>{String(custVehDetails)}</div>
                )}
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic py-1">
                Provider is coordinating vehicle logistics for this order. Details will update automatically once confirmed.
              </div>
            )}
          </div>
        )}

        {/* 2. DRIVER / OPERATOR CARD */}
        {isDriverConfigured && (
          <div
            className={`p-4 rounded-2xl border transition-all ${
              vendorDrv
                ? 'bg-amber-50/70 border-amber-300'
                : custDrvDetails
                ? 'bg-blue-50/70 border-blue-200'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 text-slate-900">
                <User className="w-3.5 h-3.5 text-slate-800" />
                <span>COMMERCIAL OPERATOR / DRIVER</span>
              </span>
              {vendorDrv ? (
                <span className="px-2 py-0.5 rounded-full bg-amber-600 text-white text-[9px] font-bold uppercase tracking-wider shadow-xs">
                  Provider Assigned
                </span>
              ) : custDrvDetails ? (
                <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white text-[9px] font-bold uppercase tracking-wider shadow-xs">
                  Customer Provided
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[9px] font-bold uppercase tracking-wider">
                  Assignment Pending
                </span>
              )}
            </div>

            {vendorDrv ? (
              <div className="space-y-1 text-xs text-slate-800 font-mono">
                <div>
                  <span className="text-slate-500 font-sans">Driver Name:</span>{' '}
                  <strong className="text-slate-900">{vendorDrv.driver_name || 'Commercial Operator'}</strong>
                </div>
                {vendorDrv.license_number && (
                  <div>
                    <span className="text-slate-500 font-sans">Licence #:</span>{' '}
                    <strong className="text-slate-900">{vendorDrv.license_number}</strong>
                  </div>
                )}
                {vendorDrv.driver_phone && (
                  <div className="pt-2 flex items-center gap-2">
                    <span className="text-slate-500 font-sans">Contact:</span>
                    <a
                      href={`tel:${vendorDrv.driver_phone}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm transition-all"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{vendorDrv.driver_phone}</span>
                    </a>
                  </div>
                )}
              </div>
            ) : custDrvDetails ? (
              <div className="space-y-1 text-xs text-slate-800 font-mono">
                {typeof custDrvDetails === 'object' ? (
                  <>
                    <div>
                      <span className="text-slate-500 font-sans">Name:</span>{' '}
                      <strong className="text-slate-900">{custDrvDetails.driver_name || 'Driver'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 font-sans">Phone:</span>{' '}
                      <strong>{custDrvDetails.driver_phone || 'N/A'}</strong>
                    </div>
                  </>
                ) : (
                  <div>{String(custDrvDetails)}</div>
                )}
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic py-1">
                Provider is assigning a qualified operator for this order. Details will appear here once confirmed.
              </div>
            )}
          </div>
        )}

        {/* 3. OTHER SERVICE-SPECIFIC CONFIGURED RESOURCES (Loading, Unloading, Equipment, Labour, etc.) */}
        {otherResources.map((res) => {
          const isArranged = Boolean(res.vendorArranged);
          const isCustomer = Boolean(res.customerProvided);

          return (
            <div
              key={res.key}
              className={`p-4 rounded-2xl border transition-all ${
                isArranged
                  ? 'bg-emerald-50/60 border-emerald-300'
                  : isCustomer
                  ? 'bg-blue-50/70 border-blue-200'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 text-slate-900">
                  <Package className="w-3.5 h-3.5 text-slate-800" />
                  <span>{res.name}</span>
                </span>
                {isArranged ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-bold uppercase tracking-wider shadow-xs">
                    Provider Arranged
                  </span>
                ) : isCustomer ? (
                  <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white text-[9px] font-bold uppercase tracking-wider shadow-xs">
                    Customer Provided
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[9px] font-bold uppercase tracking-wider">
                    Arrangement Pending
                  </span>
                )}
              </div>

              {isArranged ? (
                <div>{renderDetailsMap(res.vendorArranged)}</div>
              ) : isCustomer ? (
                <div>{renderDetailsMap(res.customerProvided)}</div>
              ) : (
                <div className="text-xs text-slate-500 italic py-1">
                  Provider is currently coordinating arrangements for this resource. Details will appear here once confirmed.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
