'use client';

import React, { useState, useEffect } from 'react';
import { Category, createOpportunity, getCategories, Opportunity, OpportunityFieldSpec, uploadFile, UserProfile, listUsers, getUserAddresses, UserAddress, VendorCatalogItem, UserServiceAsset, calculateDeliveryFee, DeliveryCalculationResult } from '@/lib/api';
import LocationSelectorModal, { LocationData } from './LocationSelectorModal';
import SavedAddressesModal from './SavedAddressesModal';
import { useCart } from '@/context/CartContext';
import { X, MapPin, User, Users, Calendar, Clock, Tag, FileText, CheckCircle, RefreshCw, ChevronRight, Edit3, Send, AlertCircle, ArrowLeft, Package, DollarSign, Mail, Phone as PhoneIcon, Home, Briefcase, Building2, Star, ShoppingBag, Truck, UserCheck, ExternalLink, Sparkles, Info, Wrench, Store } from 'lucide-react';
import { sanitizePhoneInput, validatePhoneNumber } from '@/lib/phoneUtils';


interface CreateOrderWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCategoryId?: string;
  initialCategorySlug?: string;
  onCreated?: (opp: Opportunity) => void;
  directOrderParams?: {
    vendorUser?: UserProfile;
    catalogItem?: VendorCatalogItem;
    serviceAsset?: UserServiceAsset;
    quantity?: number;
    categorySlug?: string;
    categoryId?: string;
  };
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

export interface TransportVehicleOption {
  id: string;
  type: string;
  providerName: string;
  estimatedCharge: number;
  distanceKm: number;
  availability: string;
  capacity: string;
}

const DEFAULT_VEHICLES: TransportVehicleOption[] = [
  {
    id: 'veh-10-wheeler',
    type: '10-Wheeler Heavy Tipper',
    providerName: 'Choutuppal Transport Logistics',
    estimatedCharge: 2500,
    distanceKm: 12,
    availability: 'Immediate Dispatch',
    capacity: '15 Ton Capacity',
  },
  {
    id: 'veh-12-wheeler',
    type: '12-Wheeler Heavy Hauler',
    providerName: 'NH-65 Heavy Cargo Logistics',
    estimatedCharge: 3000,
    distanceKm: 18,
    availability: 'Ready in 20 mins',
    capacity: '25 Ton Capacity',
  },
  {
    id: 'veh-tata-ace',
    type: 'Tata Ace Commercial',
    providerName: 'Choutuppal Local Express',
    estimatedCharge: 1500,
    distanceKm: 5,
    availability: 'Immediate Dispatch',
    capacity: '3.5 Ton Capacity',
  },
  {
    id: 'veh-tractor',
    type: 'Tractor Trailer',
    providerName: 'Telangana Rural Freight',
    estimatedCharge: 1800,
    distanceKm: 8,
    availability: 'Ready in 15 mins',
    capacity: '8 Ton Capacity',
  },
];

export default function CreateOrderWizardModal({
  isOpen,
  onClose,
  initialCategoryId,
  initialCategorySlug,
  onCreated,
  directOrderParams,
}: CreateOrderWizardModalProps) {
  const { cartItems, cartSubtotal, platformFee, taxAmount, cartTotal, clearCart, removeFromCart } = useCart();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'UPI' | 'ESCROW'>('COD');

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

  // 100% Dynamic Service Resource State (Generic map by resource key)
  const [resourceChoices, setResourceChoices] = useState<Record<string, string>>({});
  const [resourceFieldValues, setResourceFieldValues] = useState<Record<string, Record<string, string>>>({});

  // Transport Arrangement Choice State
  const [transportOption, setTransportOption] = useState<'NEED_TRANSPORT' | 'OWN_VEHICLE' | 'ARRANGE_MYSELF'>('NEED_TRANSPORT');
  const [vehicleDetailsInput, setVehicleDetailsInput] = useState<string>('');
  const [availableVehicles, setAvailableVehicles] = useState<TransportVehicleOption[]>(DEFAULT_VEHICLES);
  const [selectedVehicle, setSelectedVehicle] = useState<TransportVehicleOption | null>(DEFAULT_VEHICLES[0]);

  // Location-Based Delivery Calculation State
  const [deliveryCalcResult, setDeliveryCalcResult] = useState<DeliveryCalculationResult | null>(null);
  const [calculatingDelivery, setCalculatingDelivery] = useState(false);
  const [ineligibleCartItems, setIneligibleCartItems] = useState<Record<string, { reason: string; vendorName: string; title: string }>>({});

  // Trigger Live Delivery Calculation Preview when location, saved address, catalog item, or cartItems change
  useEffect(() => {
    async function runDeliveryCalculation() {
      if (!isOpen) return;

      const customerLat = activeSavedAddress.lat || location.lat || 17.25;
      const customerLng = activeSavedAddress.lng || location.lng || 78.95;

      if (cartItems.length > 0) {
        setCalculatingDelivery(true);
        const ineligibleMap: Record<string, { reason: string; vendorName: string; title: string }> = {};
        let totalCartDeliveryCharge = 0;
        let firstRes: DeliveryCalculationResult | null = null;

        for (const item of cartItems) {
          try {
            const addonIds = (item.selectedAddons || []).map((a) => a.id).concat((item.dynamicFields?.addon_ids as string[]) || []);
            const res = await calculateDeliveryFee({
              vendor_user_id: item.vendorId,
              catalog_item_id: item.catalogItemId,
              vendor_asset_id: item.vendorAssetId,
              category_id: item.categoryId,
              option_id: item.optionId,
              variant_id: item.selectedVariant?.id || (item.dynamicFields?.variant_id as string),
              addon_ids: addonIds.length > 0 ? addonIds : undefined,
              quantity: item.quantity,
              customer_lat: customerLat,
              customer_lng: customerLng,
            });

            if (res) {
              if (!firstRes) firstRes = res;
              if (!res.is_eligible) {
                ineligibleMap[item.id] = {
                  reason: res.rejection_reason || `Location (${res.distance_km.toFixed(1)} km) is outside vendor's maximum service radius (${res.max_service_radius_km} km).`,
                  vendorName: item.vendorName || 'Brand',
                  title: item.title,
                };
              } else {
                totalCartDeliveryCharge += res.delivery_charge || 0;
              }
            }
          } catch {
            // ignore
          }
        }

        setIneligibleCartItems(ineligibleMap);

        const totalSubtotal = cartSubtotal;
        const finalPayable = totalSubtotal + totalCartDeliveryCharge + platformFee + taxAmount;

        setDeliveryCalcResult({
          is_eligible: Object.keys(ineligibleMap).length === 0,
          rejection_reason: Object.keys(ineligibleMap).length > 0 ? `${Object.keys(ineligibleMap).length} service(s) unavailable at selected location.` : '',
          distance_km: firstRes?.distance_km || 5.0,
          max_service_radius_km: firstRes?.max_service_radius_km || 50.0,
          unit_price: 0,
          quantity: 1,
          subtotal: totalSubtotal,
          delivery_charge: totalCartDeliveryCharge,
          transport_charge: 0,
          driver_charge: 0,
          driver_included: true,
          loading_charge: 0,
          unloading_charge: 0,
          service_fee: platformFee,
          total_charges: totalCartDeliveryCharge + platformFee + taxAmount,
          final_payable: finalPayable,
          pricing_model: 'FIXED',
          item_title: `Multi-Brand Order (${cartItems.length} items)`,
        });
        setCalculatingDelivery(false);
      } else {
        setIneligibleCartItems({});
        const targetVendorId = directOrderParams?.vendorUser?.id;
        const targetCatalogItemId = directOrderParams?.catalogItem?.id;
        const targetServiceAssetId = directOrderParams?.serviceAsset?.id;
        const targetCategoryId = directOrderParams?.categoryId || selectedCategoryId;

        if (targetVendorId || targetCatalogItemId || targetServiceAssetId) {
          setCalculatingDelivery(true);
          const qtyVal = directOrderParams?.quantity || (customValues.quantity ? parseFloat(customValues.quantity) : 1);
          const res = await calculateDeliveryFee({
            vendor_user_id: targetVendorId,
            catalog_item_id: targetCatalogItemId,
            vendor_asset_id: targetServiceAssetId,
            category_id: targetCategoryId,
            quantity: qtyVal,
            customer_lat: customerLat,
            customer_lng: customerLng,
          });
          setDeliveryCalcResult(res);
          setCalculatingDelivery(false);
        } else {
          setDeliveryCalcResult(null);
        }
      }
    }
    runDeliveryCalculation();
  }, [isOpen, activeSavedAddress, location, directOrderParams, selectedCategoryId, customValues.quantity, cartItems, cartSubtotal, platformFee, taxAmount]);

  // Lock background body scrolling when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const origOverflow = document.body.style.overflow;
    const origDocOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = origOverflow;
      document.documentElement.style.overflow = origDocOverflow;
    };
  }, [isOpen]);

  // Handle browser popstate / back button inside CreateOrderWizardModal
  useEffect(() => {
    if (!isOpen) return;

    if (typeof window !== 'undefined') {
      const currentState = window.history.state;
      if (!currentState || currentState.modal !== 'order_wizard' || currentState.step !== step) {
        window.history.pushState({ modal: 'order_wizard', step }, '', window.location.href);
      }
    }

    const handlePopState = (e: PopStateEvent) => {
      const state = e.state;
      if (state && state.modal === 'order_wizard' && typeof state.step === 'number') {
        setStep(state.step as 1 | 2 | 3);
      } else {
        onClose();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isOpen, step, onClose]);

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
      if (cats.length > 0) {
        const cartItemCatSlug = cartItems.length > 0 ? cartItems[0].categorySlug : undefined;
        const cartItemCatId = cartItems.length > 0 ? cartItems[0].categoryId : undefined;

        const targetSlug = directOrderParams?.categorySlug || directOrderParams?.serviceAsset?.category?.slug || directOrderParams?.catalogItem?.category?.slug || cartItemCatSlug || initialCategorySlug;
        const targetId = directOrderParams?.categoryId || directOrderParams?.serviceAsset?.category_id || directOrderParams?.serviceAsset?.category?.id || directOrderParams?.catalogItem?.category_id || cartItemCatId || initialCategoryId;

        if (targetId) {
          const match = cats.find((c) => c.id === targetId || c.slug === targetId);
          if (match) setSelectedCategoryId(match.id);
          else if (targetSlug) {
            const slugMatch = cats.find((c) => c.slug === targetSlug);
            if (slugMatch) setSelectedCategoryId(slugMatch.id);
            else if (!selectedCategoryId) setSelectedCategoryId(cats[0].id);
          } else if (!selectedCategoryId) setSelectedCategoryId(cats[0].id);
        } else if (targetSlug) {
          const match = cats.find((c) => c.slug === targetSlug);
          if (match) setSelectedCategoryId(match.id);
          else if (!selectedCategoryId) setSelectedCategoryId(cats[0].id);
        } else if (!selectedCategoryId) {
          setSelectedCategoryId(cats[0].id);
        }
      }
    }
    if (isOpen) {
      loadCats();
    }
  }, [isOpen, initialCategorySlug, initialCategoryId, directOrderParams, cartItems]);

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId || c.slug === selectedCategoryId);
  const isDirectCatalogOrder = !!directOrderParams?.vendorUser && !!directOrderParams?.catalogItem;
  const isDirectServiceOrder = !!directOrderParams?.vendorUser && !!directOrderParams?.serviceAsset;
  const isDirectOrder = isDirectCatalogOrder || isDirectServiceOrder;
  const isPredefinedPack = false;
  const dynamicFields: OpportunityFieldSpec[] = (selectedCategory?.opportunity_fields || []).filter(
    (f) => f.key !== 'quantity' && f.key !== 'quantity_bags' && f.key !== 'delivery_access' && f.label !== 'Site Access Type'
  );
  const activeResources = (selectedCategory?.resources || []).filter(
    (r) => r.active && r.requirement_level !== 'NOT_APPLICABLE'
  );



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
      const phoneValidation = validatePhoneNumber(recipient.recipientPhone.trim());
      if (!phoneValidation.isValid) {
        setError(phoneValidation.error || 'Please enter a valid 10-digit mobile number for recipient');
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
    for (const res of activeResources) {
      const optKey = `resource_${res.key}`;
      const defaultChoice = (res.options && res.options.length > 0)
        ? res.options[0].key
        : `BOOK_${res.key.toUpperCase()}`;
      const choice = customValues[optKey] || resourceChoices[res.key] || defaultChoice;

      if (res.requirement_level === 'REQUIRED' && !choice) {
        setError(`Please select an option for required resource: ${res.name}`);
        return false;
      }

      if (choice.startsWith('HAVE_') && res.fields && res.fields.length > 0) {
        const fields = resourceFieldValues[res.key] || {};
        for (const field of res.fields) {
          if (field.required) {
            const fieldValKey = `${res.key}_${field.key}`;
            const val = fields[field.key] || customValues[fieldValKey];
            if (!val || val.trim() === '') {
              setError(`Please provide ${field.label} for ${res.name}`);
              return false;
            }
          }
        }
      }
    }
    if (selectedCategory?.default_workflow === 'SCHEDULED' && (!scheduledStart || scheduledStart.trim() === '')) {
      setError('Please select a scheduled start date and time slot');
      return false;
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

    if (Object.keys(ineligibleCartItems).length > 0) {
      setError('Please remove unavailable services or change your delivery location before placing your order.');
      setLoading(false);
      return;
    }

    try {
      const activeName = targetType === 'MYSELF' ? (currentUser?.full_name || 'Customer') : recipient.recipientName;
      const activePhone = targetType === 'MYSELF' ? (currentUser?.phone || '') : recipient.recipientPhone;

      let finalTitle = title.trim();
      let finalDesc = description.trim();

      // Group cartItems by vendor for brand-wise sub-orders
      const vendorGroupsMap: Record<string, { vendorId?: string; vendorName?: string; items: any[]; subtotal: number }> = {};
      if (cartItems.length > 0) {
        cartItems.forEach((item) => {
          const vKey = item.vendorId || 'general_broadcast';
          if (!vendorGroupsMap[vKey]) {
            vendorGroupsMap[vKey] = {
              vendorId: item.vendorId,
              vendorName: item.vendorName || 'Brand Vendor',
              items: [],
              subtotal: 0,
            };
          }
          vendorGroupsMap[vKey].items.push(item);
          vendorGroupsMap[vKey].subtotal += (item.totalPrice || item.unitPrice * item.quantity);
        });
      }

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

      const quantityVal = directOrderParams?.quantity ||
        (cartItems.length > 0 ? cartItems[0].quantity : undefined) ||
        customValues['quantity'] ||
        customValues['quantity_needed'] ||
        customValues['quantity_bags'] ||
        customValues['cargo_weight_tons'] ||
        customValues['farm_area_acres'] ||
        customValues['capacity'] ||
        customValues['units'] ||
        1;
      const pickupVal = customValues['pickup_location'] || customValues['source_location'] || (selectedCategory?.slug?.includes('brick') ? 'Choutuppal Brick Yard' : 'Source Location / Dispatch Yard');
      const hasTransportIncluded = cartItems.some(item => item.includedServices?.includes('TRANSPORT')) ||
        (deliveryCalcResult?.transport_charge === 0 && deliveryCalcResult?.item_title?.includes('Transport'));
      const transportCharge = (transportOption === 'NEED_TRANSPORT' && !hasTransportIncluded && selectedVehicle) ? selectedVehicle.estimatedCharge : 0;
      const workerCount = customValues.number_of_workers ? parseInt(customValues.number_of_workers) : 1;
      const ratePerUnit = customValues.rate_per_unit ? parseFloat(customValues.rate_per_unit) : 500;
      const calculatedDynamicBudget = (selectedCategory?.slug?.includes('labour') || customValues.number_of_workers) ? (workerCount * ratePerUnit) : undefined;

      // 100% Dynamic Resource Selections map
      const resourceSelectionsMap: Record<string, any> = {};
      activeResources.forEach((res) => {
        const optKey = `resource_${res.key}`;
        const defaultChoice = (res.options && res.options.length > 0) ? res.options[0].key : `BOOK_${res.key.toUpperCase()}`;
        const choice = customValues[optKey] || resourceChoices[res.key] || defaultChoice;
        const fields = resourceFieldValues[res.key] || {};

        resourceSelectionsMap[res.key] = {
          resource_id: res.id,
          resource_key: res.key,
          resource_name: res.name,
          requirement_level: res.requirement_level,
          choice,
          details: choice.startsWith('HAVE_') ? fields : undefined,
        };
      });

      // Optional legacy getters ONLY if vehicle/driver resource is explicitly configured for this category
      const hasVehicleConfigured = resourceSelectionsMap['vehicle'] !== undefined || activeResources.some(r => r.key === 'vehicle');
      const hasDriverConfigured = resourceSelectionsMap['driver'] !== undefined || activeResources.some(r => r.key === 'driver');

      const vehResChoice = hasVehicleConfigured ? (resourceSelectionsMap['vehicle']?.choice || 'BOOK_VEHICLE') : undefined;
      const drvResChoice = hasDriverConfigured ? (resourceSelectionsMap['driver']?.choice || 'BOOK_DRIVER') : undefined;
      const vehResDetails = resourceSelectionsMap['vehicle']?.details;
      const drvResDetails = resourceSelectionsMap['driver']?.details;

      const isDirectCatalogOrder = !!directOrderParams?.vendorUser && !!directOrderParams?.catalogItem;
      const isDirectServiceOrder = !!directOrderParams?.vendorUser && !!directOrderParams?.serviceAsset;
      const isDirectOrder = isDirectCatalogOrder || isDirectServiceOrder;

      const targetCatId = directOrderParams?.serviceAsset?.category_id || directOrderParams?.serviceAsset?.category?.id || directOrderParams?.catalogItem?.category_id || selectedCategoryId || undefined;

      const unitPriceVal = directOrderParams?.catalogItem?.unit_price || directOrderParams?.serviceAsset?.hourly_rate || directOrderParams?.serviceAsset?.daily_rate;

      const payload: Partial<Opportunity> = {
        category_id: targetCatId,
        type: 'NEED',
        order_mode: (isDirectOrder || cartItems.length > 0) ? 'CATALOG_ORDER' : 'GENERAL_BROADCAST',
        target_vendor_id: directOrderParams?.vendorUser?.id || (cartItems.length > 0 ? cartItems[0].vendorId : undefined),
        catalog_item_id: directOrderParams?.catalogItem?.id || (cartItems.length > 0 ? cartItems[0].catalogItemId : undefined),
        quantity: directOrderParams?.quantity || (cartItems.length > 0 ? cartItems.reduce((sum, item) => sum + item.quantity, 0) : (typeof quantityVal === 'number' ? quantityVal : parseFloat(quantityVal || '1'))),
        unit_price: directOrderParams?.catalogItem?.unit_price || (cartItems.length > 0 ? cartItems[0].unitPrice : unitPriceVal),
        total_price: directOrderParams?.catalogItem
          ? directOrderParams.catalogItem.unit_price * (directOrderParams.quantity || 1)
          : (cartItems.length > 0 ? cartTotal : (unitPriceVal && directOrderParams?.quantity ? unitPriceVal * directOrderParams.quantity : undefined)),
        title: directOrderParams?.serviceAsset
          ? `Direct Service Order: ${directOrderParams.serviceAsset.title}`
          : (directOrderParams?.catalogItem
            ? `Direct Order: ${directOrderParams.catalogItem.title}`
            : (title || (selectedCategory ? `${selectedCategory.name} Request` : 'Labour Service Request'))),
        description: directOrderParams?.serviceAsset
          ? `Direct Service Order for ${directOrderParams.serviceAsset.title} from ${directOrderParams.vendorUser?.full_name}`
          : (directOrderParams?.catalogItem
            ? `Direct Catalog Order for ${directOrderParams.catalogItem.title} (Qty: ${directOrderParams.quantity}) from ${directOrderParams.vendorUser?.full_name}`
            : (description || `Request for ${selectedCategory?.name || 'Labour Service'}`)),
        workflow_model: selectedCategory?.default_workflow || 'INSTANT',
        address_text: deliveryAddr,
        lat: deliveryLat,
        lng: deliveryLng,
        radius_km: 25,
        budget_max: isDirectCatalogOrder && directOrderParams?.catalogItem
          ? directOrderParams.catalogItem.unit_price * (directOrderParams.quantity || 1)
          : (cartItems.length > 0 ? (cartTotal + transportCharge) : (unitPriceVal ? unitPriceVal : (budgetMax ? parseFloat(budgetMax) + transportCharge : calculatedDynamicBudget))),
        price_unit: isDirectCatalogOrder ? directOrderParams?.catalogItem?.price_unit : priceUnit,
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
          vendor_details: directOrderParams?.vendorUser ? {
            id: directOrderParams.vendorUser.id,
            name: directOrderParams.vendorUser.full_name,
            brand_name: directOrderParams.vendorUser.full_name,
            phone: directOrderParams.vendorUser.phone,
            avatar_url: directOrderParams.vendorUser.avatar_url,
          } : (cartItems.length > 0 ? {
            id: cartItems[0].vendorId,
            name: cartItems[0].vendorName,
            brand_name: cartItems[0].vendorBrandName || cartItems[0].vendorName,
            phone: cartItems[0].vendorPhone,
            avatar_url: cartItems[0].vendorAvatar,
          } : undefined),
          booking_date: scheduledStart ? new Date(scheduledStart).toLocaleDateString() : undefined,
          booking_time: scheduledStart ? new Date(scheduledStart).toLocaleTimeString() : undefined,
          // Store 100% Dynamic Resource Selections
          resource_selections: resourceSelectionsMap,
          // Legacy fields for backward compatibility ONLY if vehicle/driver resource is explicitly configured
          vehicle_option_code: vehResChoice,
          driver_option_code: drvResChoice,
          vehicle_choice: hasVehicleConfigured ? (vehResChoice === 'HAVE_VEHICLE' ? 'I have a vehicle / Myself' : (vehResChoice === 'BOOK_VEHICLE' ? 'I will book a vehicle' : 'I do not have a vehicle')) : undefined,
          driver_choice: hasDriverConfigured ? (drvResChoice === 'HAVE_DRIVER' ? 'I have a driver / Myself' : (drvResChoice === 'BOOK_DRIVER' ? 'I will book a driver' : 'I do not have a driver')) : undefined,
          has_vehicle: hasVehicleConfigured ? (vehResChoice === 'HAVE_VEHICLE') : undefined,
          has_driver: hasDriverConfigured ? (drvResChoice === 'HAVE_DRIVER') : undefined,
          vehicle_details: vehResChoice === 'HAVE_VEHICLE' ? vehResDetails : undefined,
          driver_details: drvResChoice === 'HAVE_DRIVER' ? drvResDetails : undefined,
          transport_option: hasVehicleConfigured ? (vehResChoice === 'HAVE_VEHICLE' ? 'OWN_VEHICLE' : 'NEED_TRANSPORT') : undefined,
          pickup_location: pickupVal,
          delivery_location: deliveryAddr,
          custom_fields: customValues,
          cart_items: cartItems,
          vendor_groups: Object.values(vendorGroupsMap),
          charges_breakdown: {
            subtotal: cartItems.length > 0 ? cartSubtotal : (budgetMax ? parseFloat(budgetMax) : 2000),
            platform_fee: platformFee,
            transport_charge: transportCharge,
            taxes: taxAmount,
            total: (cartItems.length > 0 ? cartTotal : (budgetMax ? parseFloat(budgetMax) : 2000)) + transportCharge,
          },
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
      let errMsg = err?.message || 'Unable to submit your request. Please try again.';
      if (typeof errMsg === 'string' && errMsg.startsWith('{')) {
        try {
          const parsed = JSON.parse(errMsg);
          errMsg = parsed.error || parsed.message || errMsg;
        } catch {
          // ignore
        }
      }
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 overflow-hidden">
        <div className="relative w-full max-w-2xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] my-auto bg-white border border-slate-200 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-900">

          {/* Modal Fixed Header */}
          <div className="p-5 sm:p-6 border-b border-slate-200 flex-none relative bg-white/95 backdrop-blur-sm">
            <button
              onClick={onClose}
              className="absolute top-5 right-5 p-2 rounded-full text-slate-500 hover:text-black hover:bg-slate-100 transition-colors z-10"
              aria-label="Close wizard"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Food-Delivery Style Location Header Bar */}
            <div className="mb-4 bg-slate-100 border border-slate-300 p-3.5 sm:p-4 rounded-2xl flex items-center justify-between shadow-sm">
              <div className="flex items-start gap-3 overflow-hidden pr-2">
                <div className="p-2 rounded-xl bg-white border border-slate-300 mt-0.5">
                  <MapPin className="w-5 h-5 text-black shrink-0" />
                </div>
                <div className="overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-900">DELIVER TO</span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-900 font-bold text-[10px]">
                      {activeSavedAddress.label || 'Home'}
                    </span>
                  </div>
                  <div className="text-xs sm:text-sm font-bold text-slate-900 truncate mt-0.5">
                    {activeSavedAddress.addressText || location.addressText}
                  </div>
                  {activeSavedAddress.landmark && (
                    <div className="text-[11px] text-slate-600 truncate">Landmark: {activeSavedAddress.landmark}</div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSavedAddressesModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all shrink-0 ml-2"
              >
                Change Address
              </button>
            </div>

            {/* Fast 1-Screen Checkout Header Badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-slate-100 border border-slate-300 text-slate-900 font-black text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-black" />
                  <span>FAST 1-CLICK CHECKOUT</span>
                </span>
                <span className="text-slate-600 text-xs font-semibold">Pre-filled Customer & Address</span>
              </div>
              <span className="text-xs text-black font-mono font-bold">Secure Instant Order</span>
            </div>
          </div>

          {/* Modal Scrollable Body */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-5 sm:p-6 space-y-6 touch-pan-y overscroll-contain">

            {error && (
              <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success ? (
              <div className="py-12 text-center space-y-4">
                <CheckCircle className="w-16 h-16 text-black mx-auto animate-bounce" />
                <h3 className="text-2xl font-black text-slate-900">Order Placed Successfully!</h3>
                <p className="text-slate-600 text-sm">Matching with nearby providers using PostGIS spatial engine...</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* CARD 1: Customer Contact & Delivery Details (Pre-filled & Editable) */}
                <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                      <User className="w-4 h-4 text-black" />
                      <span>Customer & Delivery Details</span>
                    </h4>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setTargetType(targetType === 'MYSELF' ? 'SOMEONE_ELSE' : 'MYSELF')}
                        className="text-[11px] font-bold text-black hover:underline"
                      >
                        {targetType === 'MYSELF' ? 'Deliver to someone else?' : 'Deliver to myself'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsSavedAddressesModalOpen(true)}
                        className="px-3 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-black border border-slate-300 text-xs font-bold transition-all shrink-0"
                      >
                        Change Address
                      </button>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Customer / Receiver Name *</label>
                      <input
                        type="text"
                        value={recipient.recipientName || (targetType === 'MYSELF' ? (currentUser?.full_name || '') : '')}
                        onChange={(e) => setRecipient({ ...recipient, recipientName: e.target.value })}
                        placeholder="Enter full name"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs font-semibold focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Mobile Number *</label>
                      <input
                        type="tel"
                        value={recipient.recipientPhone || (targetType === 'MYSELF' ? (currentUser?.phone || '') : '')}
                        onChange={(e) => {
                          setError('');
                          setRecipient({ ...recipient, recipientPhone: sanitizePhoneInput(e.target.value) });
                        }}
                        placeholder="+91 Mobile number"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs font-mono font-semibold focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3 text-xs">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Delivery Address *</label>
                      <input
                        type="text"
                        value={recipient.deliveryLocation || activeSavedAddress.addressText || location.addressText}
                        onChange={(e) => setRecipient({ ...recipient, deliveryLocation: e.target.value })}
                        placeholder="Street address, house number, area..."
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Pincode</label>
                      <input
                        type="text"
                        value={recipient.pincode || ''}
                        onChange={(e) => setRecipient({ ...recipient, pincode: e.target.value })}
                        placeholder="e.g. 508252"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs font-mono focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
                      />
                    </div>
                  </div>
                </div>

                {/* CARD: Scheduled Booking Date & Time Slot (Only for SCHEDULED categories) */}
                {selectedCategory?.default_workflow === 'SCHEDULED' && (
                  <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-300 space-y-3 shadow-sm">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-black" />
                        <span>Scheduled Booking Date & Time Slot *</span>
                      </h4>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      This service requires a scheduled booking time slot. Please select your preferred date and time.
                    </p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Select Date & Start Time *</label>
                        <input
                          type="datetime-local"
                          value={scheduledStart ? scheduledStart.substring(0, 16) : ''}
                          onChange={(e) => setScheduledStart(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs font-mono focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
                          required
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* CARD 2: Order Summary & Pricing Breakdown */}
                <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                      <ShoppingBag className="w-4 h-4 text-black" />
                      <span>Order Summary ({cartItems.length > 0 ? `${cartItems.length} items` : '1 item'})</span>
                    </h4>
                  </div>

                  {Object.keys(ineligibleCartItems).length > 0 && (
                    <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 space-y-3">
                      <div className="flex items-center gap-2 text-rose-700 font-extrabold text-xs uppercase tracking-wider">
                        <AlertCircle className="w-4 h-4 shrink-0 animate-bounce" />
                        <span>Service Unavailable at Selected Location</span>
                      </div>
                      <div className="space-y-2">
                        {Object.entries(ineligibleCartItems).map(([itemId, info]) => (
                          <div key={itemId} className="p-3 rounded-xl bg-white border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                                  {info.vendorName}
                                </span>
                                <span className="font-bold text-slate-900">{info.title}</span>
                              </div>
                              <p className="text-[11px] text-rose-700 mt-1">{info.reason}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                              <button
                                type="button"
                                onClick={() => removeFromCart(itemId)}
                                className="px-3 py-1.5 rounded-lg bg-black hover:bg-slate-800 text-white text-[11px] font-bold transition-all shadow-sm"
                              >
                                Remove Item
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsSavedAddressesModalOpen(true)}
                                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-900 text-[11px] font-bold transition-all border border-slate-300"
                              >
                                Change Location
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {cartItems.length > 0 ? (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {cartItems.map((item) => {
                        const isIneligible = !!ineligibleCartItems[item.id];
                        const optionTitle = item.selectedOptionTitle || item.selectedVariant?.name;
                        const addonsList = item.selectedAddons || [];

                        return (
                          <div key={item.id} className={`p-3 rounded-xl bg-slate-50 border flex items-center justify-between gap-3 text-xs ${isIneligible ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`}>
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {item.vendorName && (
                                  <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-900 text-[9px] font-bold uppercase">
                                    {item.vendorName}
                                  </span>
                                )}
                                <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-900 text-[9px] font-bold uppercase">
                                  {item.categoryName || 'Service'}
                                </span>
                                {isIneligible && (
                                  <span className="px-2 py-0.5 rounded bg-rose-200 text-rose-800 text-[9px] font-bold uppercase">
                                    Unavailable at location
                                  </span>
                                )}
                              </div>

                              <h5 className="font-bold text-slate-900 text-xs mt-0.5">{item.title}</h5>

                              {optionTitle && (
                                <p className="text-[11px] text-slate-700 font-semibold">
                                  Package: {optionTitle}
                                </p>
                              )}

                              {addonsList.length > 0 && (
                                <p className="text-[10px] text-slate-600 font-mono">
                                  Add-ons: {addonsList.map((a) => `${a.title} (+₹${a.price})`).join(', ')}
                                </p>
                              )}

                              <span className="text-[11px] text-slate-500 font-mono block">
                                ₹{item.unitPrice.toLocaleString()} × {item.quantity} units
                              </span>
                            </div>

                            <div className="text-right shrink-0 flex items-center gap-3">
                              <span className="text-slate-900 font-black text-sm font-mono block">
                                ₹{(item.totalPrice || item.unitPrice * item.quantity).toLocaleString()}
                              </span>
                              {isIneligible && (
                                <button
                                  type="button"
                                  onClick={() => removeFromCart(item.id)}
                                  className="text-rose-600 hover:text-rose-800 p-1 hover:bg-rose-100 rounded transition-all"
                                  title="Remove item"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : isDirectCatalogOrder ? (
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 text-xs">
                      <div className="space-y-1">
                        <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-900 text-[9px] font-bold uppercase">
                          {directOrderParams?.vendorUser?.full_name || 'Vendor Product'}
                        </span>
                        <h5 className="font-bold text-slate-900 text-sm">{directOrderParams?.catalogItem?.title}</h5>
                        <p className="text-slate-600 text-[11px] line-clamp-1">{directOrderParams?.catalogItem?.description}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs text-slate-500 font-mono block">Qty: {customValues['quantity'] || directOrderParams?.quantity || 1}</span>
                        <span className="text-slate-900 font-black text-base font-mono block">
                          ₹{((directOrderParams?.catalogItem?.unit_price || 0) * (parseFloat(customValues['quantity']) || directOrderParams?.quantity || 1)).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ) : isDirectServiceOrder ? (
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 text-xs">
                      <div className="space-y-1">
                        <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-900 text-[9px] font-bold uppercase">
                          {directOrderParams?.vendorUser?.full_name || 'Service Provider'}
                        </span>
                        <h5 className="font-bold text-slate-900 text-sm">{directOrderParams?.serviceAsset?.title}</h5>
                        <p className="text-slate-600 text-[11px] line-clamp-1">{directOrderParams?.serviceAsset?.description}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-slate-900 font-black text-base font-mono block">
                          ₹{(directOrderParams?.serviceAsset?.hourly_rate || directOrderParams?.serviceAsset?.daily_rate || 500).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 text-xs">
                      <div>
                        <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-900 text-[9px] font-bold uppercase">
                          {selectedCategory?.name || 'General Service'}
                        </span>
                        <h5 className="font-bold text-slate-900 text-sm mt-1">{title || (selectedCategory ? `${selectedCategory.name} Order` : 'Service Request')}</h5>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs text-slate-500 font-mono block">Qty: {customValues['quantity'] || 1}</span>
                      </div>
                    </div>
                  )}

                  {/* Financial Breakdown Table */}
                  {calculatingDelivery ? (
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center gap-2 text-xs text-slate-600">
                      <RefreshCw className="w-4 h-4 animate-spin text-black" />
                      <span>Calculating delivery distance & charges...</span>
                    </div>
                  ) : deliveryCalcResult ? (
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs font-mono">
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Items Subtotal</span>
                        <span className="text-slate-900 font-semibold">₹{deliveryCalcResult.subtotal.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-900 font-bold">
                        <span>Delivery Fee ({deliveryCalcResult.distance_km.toFixed(1)} km)</span>
                        <span>{deliveryCalcResult.delivery_charge > 0 ? `₹${deliveryCalcResult.delivery_charge.toLocaleString()}` : 'FREE'}</span>
                      </div>
                      <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-sm font-black text-slate-900">
                        <span>Total Payable</span>
                        <span className="text-slate-900 font-black text-base">₹{deliveryCalcResult.final_payable.toLocaleString()}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs font-mono">
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Items Subtotal</span>
                        <span className="text-slate-900 font-semibold">₹{(cartItems.length > 0 ? cartSubtotal : (directOrderParams?.catalogItem ? directOrderParams.catalogItem.unit_price * (directOrderParams.quantity || 1) : 500)).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Platform & Spatial Fee</span>
                        <span className="text-slate-900 font-semibold">₹{platformFee}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Taxes & GST (18%)</span>
                        <span className="text-slate-900 font-semibold">₹{taxAmount.toLocaleString()}</span>
                      </div>
                      <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-sm font-black text-slate-900">
                        <span>Total Payable</span>
                        <span className="text-slate-900 font-black text-base">₹{(cartItems.length > 0 ? cartTotal : (directOrderParams?.catalogItem ? directOrderParams.catalogItem.unit_price * (directOrderParams.quantity || 1) : 500)).toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* CARD 3: Payment Method Selector */}
                <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 space-y-3 shadow-sm">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-black" />
                    <span>Payment Method</span>
                  </h4>
                  <div className="grid grid-cols-3 gap-2.5 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('COD')}
                      className={`p-3 rounded-xl border flex flex-col items-center justify-center text-center transition-all ${
                        paymentMethod === 'COD'
                          ? 'bg-black text-white border-black shadow-md'
                          : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-xs font-black">Pay on Delivery</span>
                      <span className={`text-[9px] font-normal mt-0.5 ${paymentMethod === 'COD' ? 'text-slate-300' : 'text-slate-500'}`}>Cash / UPI at doorstep</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('UPI')}
                      className={`p-3 rounded-xl border flex flex-col items-center justify-center text-center transition-all ${
                        paymentMethod === 'UPI'
                          ? 'bg-black text-white border-black shadow-md'
                          : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-xs font-black">UPI / Cards</span>
                      <span className={`text-[9px] font-normal mt-0.5 ${paymentMethod === 'UPI' ? 'text-slate-300' : 'text-slate-500'}`}>Instant Online Payment</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('ESCROW')}
                      className={`p-3 rounded-xl border flex flex-col items-center justify-center text-center transition-all ${
                        paymentMethod === 'ESCROW'
                          ? 'bg-black text-white border-black shadow-md'
                          : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-xs font-black">UOP Escrow</span>
                      <span className={`text-[9px] font-normal mt-0.5 ${paymentMethod === 'ESCROW' ? 'text-slate-300' : 'text-slate-500'}`}>Protected Release</span>
                    </button>
                  </div>
                </div>

                {/* CARD 4: Single Action Button — [ Place Order ] */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading || (deliveryCalcResult !== null && !deliveryCalcResult.is_eligible)}
                    className="w-full py-4 rounded-2xl bg-black hover:bg-slate-800 text-white font-black text-base flex items-center justify-center gap-2.5 shadow-md transition-all disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        <span>Placing Your Order...</span>
                      </>
                    ) : deliveryCalcResult !== null && !deliveryCalcResult.is_eligible ? (
                      <>
                        <AlertCircle className="w-5 h-5" />
                        <span>Location Outside Service Area</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-5 h-5 text-white" />
                        <span>Place Order • ₹{(deliveryCalcResult?.final_payable || (cartItems.length > 0 ? cartTotal : (directOrderParams?.catalogItem ? (directOrderParams.catalogItem.unit_price * (directOrderParams.quantity || 1)) : 500))).toLocaleString()}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
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

