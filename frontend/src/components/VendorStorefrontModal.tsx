'use client';

import React from 'react';

interface VendorStorefrontModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendorId?: string | null;
  initialVendorUser?: any;
  onSelectCatalogItemForOrder?: (vendor: any, item: any, quantity: number) => void;
  onSelectServiceForOrder?: (vendor: any, service: any) => void;
}

export default function VendorStorefrontModal({
  isOpen,
  onClose,
}: VendorStorefrontModalProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <h3 className="text-lg font-bold">Vendor Storefront</h3>
        <p className="mt-2 text-sm text-slate-500">Storefront preview is loading...</p>
        <button
          onClick={onClose}
          className="mt-4 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Close
        </button>
      </div>
    </div>
  );
}
