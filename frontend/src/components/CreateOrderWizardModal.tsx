'use client';

import React, { useState, useEffect } from 'react';
import { Category, createOpportunity, getCategories, Opportunity, OpportunityFieldSpec, uploadFile, UserProfile, listUsers, getUserAddresses, UserAddress } from '@/lib/api';
import LocationSelectorModal, { LocationData } from './LocationSelectorModal';
import SavedAddressesModal from './SavedAddressesModal';
import { useCart } from '@/context/CartContext';
import { X, MapPin, User, Users, Calendar, Clock, Tag, FileText, CheckCircle, RefreshCw, ChevronRight, Edit3, Send, AlertCircle, ArrowLeft, Package, DollarSign, Mail, Phone as PhoneIcon, Home, Briefcase, Building2, Star, ShoppingBag } from 'lucide-react';


interface CreateOrderWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (opp: Opportunity) => void;
}

export interface RecipientDetails {
  recipientName: string;
  recipientPhone: string;
  deliveryLocation: string;
  houseBuilding: string;
  streetArea: string;
  landmark: string;
  pincode: string;
  instructions: string;
  alternateContact?: string;
  saveRecipient?: boolean;
}

export default function CreateOrderWizardModal({
  isOpen,
  onClose,
  onCreated,
}: CreateOrderWizardModalProps) {
  const { cartItems, cartSubtotal, platformFee, taxAmount, cartTotal, clearCart } = useCart();
  // Step state: 1 = Location & Recipient, 2 = Category & Dynamic Fields, 3 = Review Before Submit
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Currently Logged-In User Profile State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  // Location-First & Saved Address State
  const [location, setLocation] = useState<LocationData>({
    addressText: 'Choutuppal, Telangana 508252',
    lat: 17.25,
    lng: 78.95,
  });
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isSavedAddressesModalOpen, setIsSavedAddressesModalOpen] = useState(false);
  const [activeSavedAddress, setActiveSavedAddress] = useState<{
    id?: string;
    label: string;
    addressText: string;
    lat: number;
    lng: number;
    landmark?: string;
    receiverName?: string;
    receiverPhone?: string;
    isSaved?: boolean;
  }>({
    label: 'Home',
    addressText: 'Choutuppal, Telangana 508252',
    lat: 17.25,
    lng: 78.95,
  });


  // "For Myself" vs "For Someone Else" State
  const [targetType, setTargetType] = useState<'MYSELF' | 'SOMEONE_ELSE'>('MYSELF');
  const [recipient, setRecipient] = useState<RecipientDetails>({
    recipientName: '',
    recipientPhone: '',
    deliveryLocation: '',
    houseBuilding: '',
    streetArea: '',
    landmark: '',
    pincode: '',
    instructions: '',
  });

  // Category & Dynamic Specs State
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [customValues, setCustomValues] = useState<Record<string, any>>({});
  const [uploadingFields, setUploadingFields] = useState<Record<string, boolean>>({});

  // Common Fields State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledStart, setScheduledStart] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [priceUnit, setPriceUnit] = useState('FIXED');

  // Submit / Loading / Error State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Load active logged-in user profile & initialize location according to rules
  useEffect(() => {
    async function initUserAndLocation() {
      if (!isOpen || typeof window === 'undefined') return;

      let activeUser: UserProfile | null = null;
      const uStr = localStorage.getItem('uop_user');
      if (uStr) {
        try {
          activeUser = JSON.parse(uStr);
        } catch {
          // ignore
        }
      }

      // Sync with backend DB to ensure latest authoritative profile for User A / User B
      try {
        const allUsers = await listUsers();
        if (allUsers && allUsers.length > 0) {
          if (activeUser?.phone || activeUser?.id) {
            const fresh = allUsers.find(
              (usr) => usr.phone === activeUser?.phone || usr.id === activeUser?.id || usr.supabase_uid === activeUser?.supabase_uid
            );
            if (fresh) activeUser = fresh;
          } else {
            activeUser = allUsers[0];
          }
        }
      } catch {
        // use local session
      }

      if (activeUser) {
        setCurrentUser(activeUser);
        setRecipient((prev) => ({
          ...prev,
          recipientName: activeUser!.full_name || '',
          recipientPhone: activeUser!.phone || '',
          deliveryLocation: activeUser!.address_text || prev.deliveryLocation,
        }));

        // Rule: Load saved addresses from DB & automatically select default address if available
        try {
          const userAddrs = await getUserAddresses(activeUser.id);
          if (userAddrs && userAddrs.length > 0) {
            const defaultAddr = userAddrs.find((a) => a.is_default) || userAddrs[0];
            const activeObj = {
              id: defaultAddr.id,
              label: defaultAddr.label,
              addressText: defaultAddr.address_text,
              lat: defaultAddr.lat,
              lng: defaultAddr.lng,
              landmark: defaultAddr.landmark,
              receiverName: defaultAddr.receiver_name || activeUser.full_name,
              receiverPhone: defaultAddr.receiver_phone || activeUser.phone,
              isSaved: true,
            };
            setActiveSavedAddress(activeObj);
            setLocation({
              addressText: defaultAddr.address_text,
              lat: defaultAddr.lat,
              lng: defaultAddr.lng,
            });
            if (defaultAddr.receiver_name || defaultAddr.receiver_phone) {
              setRecipient((prev) => ({
                ...prev,
                recipientName: defaultAddr.receiver_name || prev.recipientName,
                recipientPhone: defaultAddr.receiver_phone || prev.recipientPhone,
                deliveryLocation: defaultAddr.address_text,
              }));
            }
            return;
          }
        } catch {
          // ignore
        }

        // Rule: Fallback to profile address if available
        if (activeUser.address_text && activeUser.address_text.trim() !== '') {
          setLocation({
            addressText: activeUser.address_text,
            lat: activeUser.lat || 17.25,
            lng: activeUser.lng || 78.95,
          });
          setActiveSavedAddress({
            label: 'Home',
            addressText: activeUser.address_text,
            lat: activeUser.lat || 17.25,
            lng: activeUser.lng || 78.95,
          });
          return;
        }
      }


      // Rule: If NO saved location exists, request location permission & use current GPS location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            try {
              const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
              if (res.ok) {
                const data = await res.json();
                const address = data.display_name || `Live GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
                setLocation({ addressText: address, lat, lng });
                return;
              }
            } catch {
              // fallback
            }
            setLocation({ addressText: `Live GPS Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`, lat, lng });
          },
          () => {
            // Keep fallback
            if (activeUser?.address_text) {
              setLocation({ addressText: activeUser.address_text, lat: activeUser.lat || 17.25, lng: activeUser.lng || 78.95 });
            }
          },
          { timeout: 5000 }
        );
      }
    }

    initUserAndLocation();
  }, [isOpen]);

  useEffect(() => {
    async function loadCats() {
      const cats = await getCategories();
      setCategories(cats);
      if (cats.length > 0 && !selectedCategoryId) {
        const bricksCat = cats.find((c) => c.slug === 'bricks-building-materials');
        setSelectedCategoryId(bricksCat ? bricksCat.id : cats[0].id);
      }
    }
    if (isOpen) {
      loadCats();
    }
  }, [isOpen]);

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId || c.slug === selectedCategoryId);
  const dynamicFields: OpportunityFieldSpec[] = selectedCategory?.opportunity_fields || [];

  if (!isOpen) return null;

  const handleSelectMyself = () => {
    setTargetType('MYSELF');
    if (currentUser) {
      setRecipient((prev) => ({
        ...prev,
        recipientName: currentUser.full_name,
        recipientPhone: currentUser.phone || '',
        deliveryLocation: currentUser.address_text || location.addressText,
      }));
    }
  };

  const handleSelectSomeoneElse = () => {
    setTargetType('SOMEONE_ELSE');
    setRecipient({
      recipientName: '',
      recipientPhone: '',
      deliveryLocation: location.addressText,
      houseBuilding: '',
      streetArea: '',
      landmark: '',
      pincode: '',
      instructions: '',
    });
  };

  const handleCustomFieldChange = (key: string, val: any) => {
    setCustomValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleFileUpload = async (fieldKey: string, file: File) => {
    setUploadingFields((prev) => ({ ...prev, [fieldKey]: true }));
    try {
      const res = await uploadFile(file);
      handleCustomFieldChange(fieldKey, res.url);
    } catch (err: any) {
      alert(`File upload failed: ${err.message || 'Error'}`);
    } finally {
      setUploadingFields((prev) => ({ ...prev, [fieldKey]: false }));
    }
  };

  const validateStep1 = () => {
    if (targetType === 'SOMEONE_ELSE') {
      if (!recipient.recipientName.trim()) {
        setError('Please enter recipient name');
        return false;
      }
      if (!recipient.recipientPhone.trim()) {
        setError('Please enter recipient phone number');
        return false;
      }
      if (!recipient.deliveryLocation.trim()) {
        setError('Please enter recipient delivery address');
        return false;
      }
    }
    setError('');
    return true;
  };

  const validateStep2 = () => {
    for (const field of dynamicFields) {
      if (field.required && (!customValues[field.key] || customValues[field.key].toString().trim() === '')) {
        setError(`Please fill in required field: ${field.label}`);
        return false;
      }
    }
    setError('');
    return true;
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (validateStep1()) setStep(2);
    } else if (step === 2) {
      if (validateStep2()) setStep(3);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    try {
      const activeName = targetType === 'MYSELF' ? (currentUser?.full_name || 'Customer') : recipient.recipientName;
      const activePhone = targetType === 'MYSELF' ? (currentUser?.phone || '') : recipient.recipientPhone;
      
      let finalTitle = title.trim();
      let finalDesc = description.trim();

      if (cartItems.length > 0) {
        if (!finalTitle) {
          finalTitle = `Multi-Item Order (${cartItems.length} items: ${cartItems.map((c) => c.categoryName).join(', ')})`;
        }
        if (!finalDesc) {
          finalDesc = `Order containing ${cartItems.length} items for ${activeName}. Items: ${cartItems.map((c) => `${c.title} (x${c.quantity})`).join('; ')}`;
        }
      } else {
        const quantityVal = customValues['quantity'] || customValues['quantity_needed'] || customValues['quantity_bags'] || customValues['cargo_weight_tons'] || customValues['farm_area_acres'] || customValues['capacity'] || customValues['units'];
        if (!finalTitle) {
          finalTitle = `${selectedCategory?.name || 'Service'} Order (${quantityVal ? quantityVal + ' Units' : 'Request'})`;
        }
        if (!finalDesc) {
          finalDesc = `${selectedCategory?.name || 'Service'} request for ${targetType === 'MYSELF' ? 'self (' + activeName + ')' : recipient.recipientName}`;
        }
      }
      
      const deliveryAddr = targetType === 'SOMEONE_ELSE' && recipient.deliveryLocation 
        ? `${recipient.deliveryLocation}${recipient.houseBuilding ? ' (Building: ' + recipient.houseBuilding + ')' : ''}${recipient.landmark ? ' (Landmark: ' + recipient.landmark + ')' : ''}`
        : activeSavedAddress.addressText || location.addressText;

      const deliveryLat = targetType === 'SOMEONE_ELSE' ? location.lat : activeSavedAddress.lat || location.lat;
      const deliveryLng = targetType === 'SOMEONE_ELSE' ? location.lng : activeSavedAddress.lng || location.lng;

      const quantityVal = customValues['quantity'] || customValues['quantity_needed'] || customValues['quantity_bags'] || customValues['cargo_weight_tons'] || customValues['farm_area_acres'] || customValues['capacity'] || customValues['units'];
      const pickupVal = customValues['pickup_location'] || customValues['source_location'] || (selectedCategory?.slug?.includes('brick') ? 'Choutuppal Brick Yard' : 'Source Location / Dispatch Yard');

      const payload: Partial<Opportunity> & { user_id?: string; metadata?: Record<string, any> } = {
        type: 'NEED',
        category_id: selectedCategory?.id || selectedCategoryId || undefined,
        title: finalTitle,
        description: finalDesc,
        workflow_model: selectedCategory?.default_workflow || 'INSTANT',
        address_text: deliveryAddr,
        lat: deliveryLat,
        lng: deliveryLng,
        radius_km: 25,
        budget_max: cartItems.length > 0 ? cartTotal : (budgetMax ? parseFloat(budgetMax) : undefined),
        price_unit: priceUnit,
        scheduled_start: scheduledStart ? new Date(scheduledStart).toISOString() : undefined,
        user_id: currentUser?.id || undefined,
        metadata: {
          for_someone_else: targetType === 'SOMEONE_ELSE',
          customer_details: {
            id: currentUser?.id,
            name: currentUser?.full_name || 'Customer',
            phone: currentUser?.phone || '',
            email: currentUser?.email || '',
          },
          recipient_details: targetType === 'SOMEONE_ELSE' 
            ? recipient 
            : { recipientName: activeName, recipientPhone: activePhone, recipientEmail: currentUser?.email },
          delivery_address_details: {
            id: activeSavedAddress.id,
            label: activeSavedAddress.label,
            address_text: deliveryAddr,
            lat: deliveryLat,
            lng: deliveryLng,
            landmark: activeSavedAddress.landmark || recipient.landmark,
            receiver_name: activeName,
            receiver_phone: activePhone,
          },
          category_slug: selectedCategory?.slug,
          category_name: selectedCategory?.name,
          quantity: quantityVal ? (isNaN(Number(quantityVal)) ? quantityVal : Number(quantityVal)) : 1,
          pickup_location: pickupVal,
          delivery_location: deliveryAddr,
          custom_fields: customValues,
          cart_items: cartItems,
          charges_breakdown: cartItems.length > 0 ? {
            subtotal: cartSubtotal,
            platform_fee: platformFee,
            taxes: taxAmount,
            total: cartTotal,
          } : undefined,
          ...customValues,
        },
      };

      const created = await createOpportunity(payload);
      if (created) {
        if (cartItems.length > 0) {
          clearCart();
        }
        if (targetType === 'SOMEONE_ELSE' && recipient.saveRecipient && typeof window !== 'undefined') {
          try {
            const storedRecs = localStorage.getItem('uop_saved_recipients');
            const recs = storedRecs ? JSON.parse(storedRecs) : [];
            recs.push(recipient);
            localStorage.setItem('uop_saved_recipients', JSON.stringify(recs));
          } catch {
            // ignore
          }
        }
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          if (onCreated) onCreated(created);
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      console.error('Submit Opportunity Request Error:', err);
      setError('Unable to submit your request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
        <div className="relative w-full max-w-2xl bg-[#0d1322] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl my-8">
          <button
            onClick={onClose}
            className="absolute top-6 right-6 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Food-Delivery Style Location Header Bar (Swiggy / Zomato Style) */}
          <div className="mb-6 bg-gradient-to-r from-rose-950/40 via-slate-900 to-amber-950/40 border border-rose-500/30 p-4 rounded-2xl flex items-center justify-between shadow-lg shadow-rose-500/5">
            <div className="flex items-start gap-3 overflow-hidden pr-2">
              <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/30 mt-0.5">
                <MapPin className="w-5 h-5 text-rose-400 shrink-0 animate-pulse" />
              </div>
              <div className="overflow-hidden">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-400">DELIVER TO</span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-white font-bold text-[10px]">
                    {activeSavedAddress.label || 'Home'}
                  </span>
                </div>
                <div className="text-xs sm:text-sm font-bold text-white truncate mt-0.5">
                  {activeSavedAddress.addressText || location.addressText}
                </div>
                {activeSavedAddress.landmark && (
                  <div className="text-[11px] text-slate-400 truncate">Landmark: {activeSavedAddress.landmark}</div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsSavedAddressesModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/20 transition-all shrink-0 ml-2"
            >
              Change Address
            </button>
          </div>


          {/* Progress Indicator Steps */}
          <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>1</div>
              <span className={`text-xs font-semibold ${step >= 1 ? 'text-white' : 'text-slate-500'}`}>Recipient & Location</span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-600" />
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>2</div>
              <span className={`text-xs font-semibold ${step >= 2 ? 'text-white' : 'text-slate-500'}`}>Service & Specifications</span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-600" />
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step >= 3 ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>3</div>
              <span className={`text-xs font-semibold ${step >= 3 ? 'text-white' : 'text-slate-500'}`}>Review & Submit</span>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success ? (
            <div className="py-12 text-center space-y-4">
              <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto animate-bounce" />
              <h3 className="text-2xl font-bold text-white">Order Published Successfully!</h3>
              <p className="text-slate-400 text-sm">Matching with nearby providers using PostGIS spatial engine...</p>
            </div>
          ) : (
            <div>
              {/* STEP 1: Recipient & Location */}
              {step === 1 && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Who is this order for?</h3>
                    <p className="text-slate-400 text-xs">Select whether this request is for yourself or someone else.</p>
                  </div>

                  {/* Toggle Selector */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={handleSelectMyself}
                      className={`p-4 rounded-2xl border flex items-center gap-3 transition-all text-left ${
                        targetType === 'MYSELF'
                          ? 'bg-blue-600/15 border-blue-500 text-blue-300 shadow-lg shadow-blue-600/10'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <User className="w-5 h-5 flex-shrink-0 text-blue-400" />
                      <div>
                        <div className="font-bold text-sm">For myself</div>
                        <div className="text-[11px] text-slate-500">Uses your logged-in profile details</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={handleSelectSomeoneElse}
                      className={`p-4 rounded-2xl border flex items-center gap-3 transition-all text-left ${
                        targetType === 'SOMEONE_ELSE'
                          ? 'bg-purple-600/15 border-purple-500 text-purple-300 shadow-lg shadow-purple-600/10'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <Users className="w-5 h-5 flex-shrink-0 text-purple-400" />
                      <div>
                        <div className="font-bold text-sm">For someone else</div>
                        <div className="text-[11px] text-slate-500">Deliver to a friend, client or family member</div>
                      </div>
                    </button>
                  </div>

                  {/* Auto-Filled Details Card for "FOR MYSELF" */}
                  {targetType === 'MYSELF' && (
                    <div className="p-4.5 rounded-2xl bg-blue-950/20 border border-blue-500/20 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400">
                          Auto-Filled Profile Details (For Myself)
                        </h4>
                        <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>No Input Needed</span>
                        </span>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-3 text-xs">
                        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                          <span className="text-slate-500 text-[10px] block font-semibold uppercase">Customer Name</span>
                          <span className="text-slate-100 font-bold text-sm">{currentUser?.full_name || 'Logged-In User'}</span>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                          <span className="text-slate-500 text-[10px] block font-semibold uppercase">Phone Number</span>
                          <span className="text-slate-100 font-mono text-sm">{currentUser?.phone || 'Saved Profile Phone'}</span>
                        </div>
                      </div>

                      {currentUser?.email && (
                        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs">
                          <span className="text-slate-500 text-[10px] block font-semibold uppercase">Email Address</span>
                          <span className="text-slate-100 font-mono text-xs">{currentUser.email}</span>
                        </div>
                      )}

                      <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="text-slate-500 text-[10px] block font-semibold uppercase">
                            {currentUser?.address_text ? 'Saved Default Address' : 'Detected Service / Delivery Location'}
                          </span>
                          <span className="text-slate-100 font-medium text-xs line-clamp-1">{location.addressText}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsLocationModalOpen(true)}
                          className="px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 text-xs font-bold transition-all shrink-0 ml-2"
                        >
                          Change Location
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Recipient Input Fields for "SOMEONE ELSE" */}
                  {targetType === 'SOMEONE_ELSE' && (
                    <div className="p-4 rounded-2xl bg-purple-950/20 border border-purple-500/20 space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400">Recipient Contact & Delivery Details</h4>
                      
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-slate-300 mb-1">Recipient Name *</label>
                          <input
                            type="text"
                            placeholder="Full name of recipient"
                            value={recipient.recipientName}
                            onChange={(e) => setRecipient({ ...recipient, recipientName: e.target.value })}
                            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-purple-500"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-slate-300 mb-1">Recipient Phone *</label>
                          <input
                            type="text"
                            placeholder="+91 Mobile number"
                            value={recipient.recipientPhone}
                            onChange={(e) => setRecipient({ ...recipient, recipientPhone: e.target.value })}
                            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-purple-500"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-slate-300 mb-1">Recipient Delivery / Service Address *</label>
                        <input
                          type="text"
                          placeholder="Recipient address (e.g. Village/Town name)"
                          value={recipient.deliveryLocation}
                          onChange={(e) => setRecipient({ ...recipient, deliveryLocation: e.target.value })}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-purple-500"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">House / Flat / Building</label>
                          <input
                            type="text"
                            placeholder="Plot / Door No."
                            value={recipient.houseBuilding}
                            onChange={(e) => setRecipient({ ...recipient, houseBuilding: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-200 text-xs focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Street / Area</label>
                          <input
                            type="text"
                            placeholder="Main Road / Street"
                            value={recipient.streetArea}
                            onChange={(e) => setRecipient({ ...recipient, streetArea: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-200 text-xs focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Landmark</label>
                          <input
                            type="text"
                            placeholder="Near Bus Stand..."
                            value={recipient.landmark}
                            onChange={(e) => setRecipient({ ...recipient, landmark: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-200 text-xs focus:outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Special Delivery Instructions for Driver / Service Provider</label>
                        <textarea
                          rows={2}
                          placeholder="e.g. Call recipient before delivery, unload near gate"
                          value={recipient.instructions}
                          onChange={(e) => setRecipient({ ...recipient, instructions: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-200 text-xs focus:outline-none"
                        />
                      </div>

                      <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-800/80">
                        <div className="flex-1">
                          <label className="block text-[11px] text-slate-400 mb-1">Optional Alternate Contact</label>
                          <input
                            type="text"
                            placeholder="Secondary phone / relation (e.g. Brother)"
                            value={recipient.alternateContact || ''}
                            onChange={(e) => setRecipient({ ...recipient, alternateContact: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-200 text-xs focus:outline-none"
                          />
                        </div>

                        <label className="flex items-center gap-2 text-xs text-purple-300 font-semibold cursor-pointer shrink-0 pt-2 sm:pt-4">
                          <input
                            type="checkbox"
                            checked={Boolean(recipient.saveRecipient)}
                            onChange={(e) => setRecipient({ ...recipient, saveRecipient: e.target.checked })}
                            className="w-4 h-4 rounded bg-slate-900 border-slate-800 text-purple-600 focus:ring-0"
                          />
                          <span>Save recipient for future orders</span>
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="pt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={handleNextStep}
                      className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm flex items-center gap-2 shadow-lg shadow-blue-600/25 transition-all"
                    >
                      <span>Confirm Location & Continue</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: Category & DB-Driven Dynamic Specifications */}
              {step === 2 && (
                <div className="space-y-5">
                  {/* Category Selection */}
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 mb-1 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-blue-400" />
                      <span>Select Service Category *</span>
                    </label>
                    <select
                      value={selectedCategoryId}
                      onChange={(e) => setSelectedCategoryId(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                    >
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name} ({cat.slug})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* DB-Driven Dynamic Category Custom Fields */}
                  {dynamicFields.length > 0 && (
                    <div className="p-4 rounded-2xl bg-purple-950/20 border border-purple-500/20 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                          <FileText className="w-4 h-4" />
                          <span>DB Category Specifications ({selectedCategory?.name})</span>
                        </h4>
                        <span className="text-[10px] text-slate-500 font-mono">DB Configured</span>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-4">
                        {dynamicFields.map((field) => {
                          const value = customValues[field.key];
                          const isUploading = uploadingFields[field.key];

                          return (
                            <div key={field.key} className={`space-y-1 ${field.type === 'textarea' ? 'sm:col-span-2' : ''}`}>
                              <label className="block text-xs font-semibold text-slate-300">
                                {field.label} {field.required && <span className="text-rose-400">*</span>}
                              </label>

                              {field.type === 'select' ? (
                                <select
                                  value={value || ''}
                                  onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
                                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-purple-500"
                                  required={field.required}
                                >
                                  <option value="">-- Select {field.label} --</option>
                                  {field.options?.map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                </select>
                              ) : field.type === 'number' ? (
                                <input
                                  type="number"
                                  placeholder={field.placeholder || `Enter ${field.label}`}
                                  value={value || ''}
                                  onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
                                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-purple-500"
                                  required={field.required}
                                />
                              ) : field.type === 'textarea' ? (
                                <textarea
                                  rows={2}
                                  placeholder={field.placeholder || `Enter ${field.label}`}
                                  value={value || ''}
                                  onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
                                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-purple-500"
                                  required={field.required}
                                />
                              ) : (
                                <input
                                  type="text"
                                  placeholder={field.placeholder || `Enter ${field.label}`}
                                  value={value || ''}
                                  onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
                                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-purple-500"
                                  required={field.required}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Standard Common Fields: Schedule & Pricing */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-400 mb-1 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-blue-400" />
                        <span>Required Date / Time</span>
                      </label>
                      <input
                        type="datetime-local"
                        value={scheduledStart}
                        onChange={(e) => setScheduledStart(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-400 mb-1 flex items-center gap-1">
                        <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Max Budget / Offer Rate (₹)</span>
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          placeholder="Amount in ₹"
                          value={budgetMax}
                          onChange={(e) => setBudgetMax(e.target.value)}
                          className="w-1/2 px-3 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200 text-xs focus:outline-none"
                        />
                        <select
                          value={priceUnit}
                          onChange={(e) => setPriceUnit(e.target.value)}
                          className="w-1/2 px-3 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200 text-xs focus:outline-none"
                        >
                          <option value="FIXED">Fixed Price</option>
                          <option value="PER_UNIT">Per Unit</option>
                          <option value="PER_KM">Per KM</option>
                          <option value="HOURLY">Hourly</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">Additional Instructions / Notes</label>
                    <textarea
                      rows={2}
                      placeholder="Add any specific requirements, timing notes, or delivery terms..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200 text-xs focus:outline-none placeholder-slate-600"
                    />
                  </div>

                  <div className="pt-4 flex justify-between">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="px-5 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white text-xs font-bold flex items-center gap-1.5"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Back</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleNextStep}
                      className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm flex items-center gap-2 shadow-lg shadow-blue-600/25 transition-all"
                    >
                      <span>Review Before Submit</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3 — CHECKOUT SUMMARY & CONFIRMATION */}
              {step === 3 && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-extrabold text-white mb-1">CHECKOUT & DELIVERY CONFIRMATION</h3>
                    <p className="text-slate-400 text-xs">Verify your delivery details and order specifications before placing the order.</p>
                  </div>

                  <div className="bg-[#090d16] border border-rose-500/30 rounded-2xl p-6 space-y-5 shadow-xl">
                    {/* Food-Delivery Style Delivery Address Block */}
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-950/30 via-slate-900 to-slate-900 border border-rose-500/40 flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-rose-400 font-extrabold text-[10px] uppercase tracking-wider">DELIVERY ADDRESS</span>
                          <span className="px-2 py-0.5 rounded-full bg-rose-600/20 border border-rose-500/40 text-rose-300 font-bold text-[10px]">
                            {targetType === 'SOMEONE_ELSE' ? 'Custom Delivery' : (activeSavedAddress.label || 'Home')}
                          </span>
                        </div>
                        <p className="text-white font-bold text-xs sm:text-sm">
                          {targetType === 'SOMEONE_ELSE' ? recipient.deliveryLocation : (activeSavedAddress.addressText || location.addressText)}
                        </p>
                        {(activeSavedAddress.landmark || recipient.landmark) && (
                          <p className="text-slate-400 text-xs">Landmark: {activeSavedAddress.landmark || recipient.landmark}</p>
                        )}
                        <div className="pt-1 flex items-center gap-4 text-xs text-slate-300">
                          <span className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-rose-400" />
                            <strong className="text-white">Recipient:</strong> {targetType === 'MYSELF' ? (currentUser?.full_name || 'Self') : recipient.recipientName}
                          </span>
                          <span className="flex items-center gap-1 font-mono">
                            <PhoneIcon className="w-3.5 h-3.5 text-rose-400" />
                            <strong className="text-white">Phone:</strong> {targetType === 'MYSELF' ? (currentUser?.phone || '') : recipient.recipientPhone}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsSavedAddressesModalOpen(true)}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-400 border border-rose-500/30 text-xs font-bold transition-all shrink-0"
                      >
                        Change Address
                      </button>
                    </div>

                    {/* Cart Items Summary if Cart is Not Empty */}
                    {cartItems.length > 0 ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs font-bold uppercase text-slate-400 tracking-wider">
                          <span className="flex items-center gap-1.5">
                            <ShoppingBag className="w-3.5 h-3.5 text-blue-400" />
                            <span>Cart Order Items ({cartItems.length})</span>
                          </span>
                        </div>

                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {cartItems.map((item) => (
                            <div key={item.id} className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-3 text-xs">
                              <div>
                                <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[9px] font-bold uppercase">
                                  {item.categoryName}
                                </span>
                                <h5 className="font-bold text-white text-xs mt-0.5">{item.title}</h5>
                                {item.dynamicFields && Object.keys(item.dynamicFields).length > 0 && (
                                  <span className="text-[10px] text-slate-400 line-clamp-1">
                                    {Object.entries(item.dynamicFields).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' • ')}
                                  </span>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-slate-400 text-[11px] block">Qty: {item.quantity}</span>
                                <span className="text-emerald-400 font-bold font-mono">
                                  ₹{(item.totalPrice || item.unitPrice * item.quantity).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Charges Breakdown Table */}
                        <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between text-slate-400">
                            <span>Subtotal</span>
                            <span className="font-mono text-slate-200">₹{cartSubtotal.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between text-slate-400">
                            <span>Platform & Spatial Matching Fee</span>
                            <span className="font-mono text-slate-200">₹{platformFee}</span>
                          </div>
                          <div className="flex items-center justify-between text-slate-400">
                            <span>Estimated GST & Taxes (18%)</span>
                            <span className="font-mono text-slate-200">₹{taxAmount.toLocaleString()}</span>
                          </div>
                          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-sm font-extrabold text-white">
                            <span>Grand Total</span>
                            <span className="text-emerald-400 font-mono">₹{cartTotal.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Standalone Order Summary */
                      <div className="grid sm:grid-cols-2 gap-4 text-xs">
                        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                          <span className="text-slate-500 font-bold uppercase text-[10px] block">Service</span>
                          <span className="text-white font-extrabold text-sm flex items-center gap-2">
                            <Tag className="w-4 h-4 text-blue-400" />
                            <span>{selectedCategory?.name || 'General Service'}</span>
                          </span>
                        </div>

                        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                          <span className="text-slate-500 font-bold uppercase text-[10px] block">Quantity</span>
                          <span className="text-emerald-400 font-extrabold text-sm">
                            {customValues['quantity'] || customValues['quantity_bags'] || customValues['cargo_weight_tons'] || customValues['farm_area_acres'] || '1'} Units
                          </span>
                        </div>

                        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                          <span className="text-slate-500 font-bold uppercase text-[10px] block">Required Date</span>
                          <span className="text-blue-300 font-bold text-xs flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-blue-400" />
                            <span>{scheduledStart ? new Date(scheduledStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Flexible / Asap'}</span>
                          </span>
                        </div>

                        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                          <span className="text-slate-500 font-bold uppercase text-[10px] block">Pickup / Source Location</span>
                          <span className="text-amber-300 font-bold text-xs flex items-center gap-1.5">
                            <Building2 className="w-4 h-4 text-amber-400" />
                            <span>{customValues['pickup_location'] || customValues['source_location'] || (selectedCategory?.slug?.includes('brick') ? 'Choutuppal Brick Yard' : 'Source Location')}</span>
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Dynamic Category Specifications */}
                    {cartItems.length === 0 && Object.keys(customValues).length > 0 && (
                      <div className="pt-3 border-t border-slate-800/80">
                        <span className="text-slate-400 font-bold uppercase text-[10px] block mb-2">Category Dynamic Specifications</span>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {Object.entries(customValues).map(([k, v]) => {
                            const spec = dynamicFields.find((f) => f.key === k);
                            return (
                              <div key={k} className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                                <span className="text-slate-500 text-[10px] block">{spec?.label || k}</span>
                                <span className="text-slate-200 font-bold">{v?.toString()}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons: [ Edit ] and [ Confirm & Place Order ] */}
                  <div className="pt-2 flex justify-between items-center">
                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="px-5 py-2.5 rounded-xl border border-slate-800 text-slate-300 hover:text-white font-semibold text-xs flex items-center gap-1.5"
                      >
                        <Edit3 className="w-4 h-4" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={loading}
                        className="px-7 py-3.5 rounded-xl bg-gradient-to-r from-rose-600 via-amber-600 to-emerald-600 hover:from-rose-500 hover:to-emerald-500 text-white font-extrabold text-sm flex items-center gap-2 shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50"
                      >
                        {loading ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Processing Order...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            <span>Confirm & Place Order</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
            </div>
          )}
        </div>
      </div>


      <LocationSelectorModal
        isOpen={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
        currentLocation={location}
        onSelectLocation={(loc) => setLocation(loc)}
      />
      {/* Saved Addresses Manager Modal */}
      <SavedAddressesModal
        isOpen={isSavedAddressesModalOpen}
        onClose={() => setIsSavedAddressesModalOpen(false)}
        currentUser={currentUser}
        selectedAddressId={activeSavedAddress.id}
        onSelectAddress={(selected) => {
          setActiveSavedAddress(selected);
          setLocation({
            addressText: selected.addressText,
            lat: selected.lat,
            lng: selected.lng,
          });
          if (selected.receiverName || selected.receiverPhone) {
            setRecipient((prev) => ({
              ...prev,
              recipientName: selected.receiverName || prev.recipientName,
              recipientPhone: selected.receiverPhone || prev.recipientPhone,
              deliveryLocation: selected.addressText,
            }));
          }
        }}
      />
    </>
  );
}

