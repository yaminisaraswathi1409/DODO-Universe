'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Opportunity,
  Category,
  VendorCatalogItem,
  UserServiceAsset,
  UserProfile,
  getPublicOpportunities,
  getCategories,
  searchCatalog,
  getProviderOffers,
  ProviderOffer,
} from '@/lib/api';
import CreateOpportunityModal from '@/components/CreateOpportunityModal';
import CreateOrderWizardModal from '@/components/CreateOrderWizardModal';
import VendorStorefrontModal from '@/components/VendorStorefrontModal';
import CartDrawerModal from '@/components/CartDrawerModal';
import { useCart } from '@/context/CartContext';
import {
  ArrowLeft,
  MapPin,
  Tag,
  Clock,
  HelpCircle,
  PlusCircle,
  Layers,
  Sparkles,
  Search,
  ShoppingBag,
  Filter,
  Package,
  Store,
  Star,
  ShieldCheck,
  ChevronRight,
  User,
  CheckCircle,
  Wrench,
  Send,
  Sliders,
} from 'lucide-react';

interface MarketplaceClientProps {
  initialOpportunities: Opportunity[];
  initialTotal: number;
  initialCategory: string;
  initialType: string;
}

export interface UnifiedVendor {
  vendorId: string;
  vendorName: string;
  vendorPhone?: string;
  vendorAvatar?: string;
  trustScore: number;
  isVerified: boolean;
  coverageRadiusKm: number;
  offers: ProviderOffer[];
  catalogItems: VendorCatalogItem[];
  vendorUser?: UserProfile;
}

export default function OpportunitiesMarketplaceClient({
  initialOpportunities,
  initialTotal,
  initialCategory,
  initialType,
}: MarketplaceClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { cartCount, isCartOpen, setIsCartOpen } = useCart();

  const vendorParam = searchParams ? searchParams.get('vendor') : null;
  const categoryParam = searchParams ? searchParams.get('category') : null;

  // TWO primary customer choices:
  // 1. 'SHOPS' = BROWSE SHOPS / BRANDS (Vendor-centric flow)
  // 2. 'REQUEST_WHAT_YOU_NEED' = REQUEST WHAT YOU NEED (Service broadcast flow with custom quantity)
  const [activeTab, setActiveTab] = useState<'SHOPS' | 'REQUEST_WHAT_YOU_NEED'>('SHOPS');
  const [showSubmittedRequests, setShowSubmittedRequests] = useState(false);

  const [opportunities, setOpportunities] = useState<Opportunity[]>(initialOpportunities);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string>(initialCategory);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Provider Offers State
  const [providerOffers, setProviderOffers] = useState<ProviderOffer[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);

  // Catalog State
  const [catalogItems, setCatalogItems] = useState<VendorCatalogItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // Modals state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDefaultType, setModalDefaultType] = useState<'NEED' | 'OFFER'>('NEED');
  const [selectedModalCatId, setSelectedModalCatId] = useState<string | undefined>(undefined);
  const [reqModalInitialQty, setReqModalInitialQty] = useState<number | undefined>(undefined);
  const [reqModalInitialUnit, setReqModalInitialUnit] = useState<string | undefined>(undefined);
  const [reqModalInitialValues, setReqModalInitialValues] = useState<Record<string, any> | undefined>(undefined);
  const [orderWizardOpen, setOrderWizardOpen] = useState(false);
  const [checkoutOpenedFromCart, setCheckoutOpenedFromCart] = useState(false);

  // Vendor Storefront Modal State
  const [storefrontOpen, setStorefrontOpen] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [selectedVendorUser, setSelectedVendorUser] = useState<UserProfile | null>(null);

  // Sync vendor storefront modal open state with URL search params (enables Back & Forward)
  useEffect(() => {
    if (vendorParam) {
      setSelectedVendorId(vendorParam);
      setStorefrontOpen(true);
    } else {
      setStorefrontOpen(false);
      setSelectedVendorId(null);
    }
  }, [vendorParam]);

  useEffect(() => {
    if (categoryParam !== null && categoryParam !== selectedCategorySlug) {
      setSelectedCategorySlug(categoryParam);
    }
  }, [categoryParam]);

  // Order Wizard Pre-fill State for Direct Catalog/Service Order
  const [directOrderParams, setDirectOrderParams] = useState<{
    vendorUser?: UserProfile;
    catalogItem?: VendorCatalogItem;
    serviceAsset?: UserServiceAsset;
    quantity?: number;
    categorySlug?: string;
    categoryId?: string;
  }>({});

  useEffect(() => {
    getCategories().then((cats) => setCategories(cats)).catch(() => {});
  }, []);

  // Fetch Provider Offers
  const fetchProviderOffersData = async (catSlug = selectedCategorySlug, query = searchQuery) => {
    setLoadingProviders(true);
    try {
      let offers: ProviderOffer[] = [];
      if (catSlug) {
        offers = await getProviderOffers(catSlug);
      } else {
        offers = await getProviderOffers('');
      }

      const filtered = offers.filter((off) => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return (
          off.provider_name.toLowerCase().includes(q) ||
          off.title.toLowerCase().includes(q) ||
          (off.description && off.description.toLowerCase().includes(q)) ||
          (off.category_name && off.category_name.toLowerCase().includes(q)) ||
          (off.category_slug && off.category_slug.toLowerCase().includes(q))
        );
      });

      setProviderOffers(filtered);
    } catch {
      setProviderOffers([]);
    } finally {
      setLoadingProviders(false);
    }
  };

  useEffect(() => {
    fetchProviderOffersData();
  }, [searchQuery, selectedCategorySlug, categories]);

  // Fetch Catalog items
  const fetchCatalogData = async (query = searchQuery, catSlug = selectedCategorySlug) => {
    setLoadingCatalog(true);
    try {
      const res = await searchCatalog(query, catSlug);
      setCatalogItems(res.items);
    } catch {
      // Keep existing list
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    fetchCatalogData();
  }, [searchQuery, selectedCategorySlug]);

  const fetchUpdatedOpportunities = async () => {
    try {
      const res = await getPublicOpportunities(selectedCategorySlug, 'NEED', 1);
      setOpportunities(res.data);
    } catch {
      // ignore
    }
  };

  const handleCategorySelect = (slug: string) => {
    setSelectedCategorySlug(slug);
    fetchCatalogData(searchQuery, slug);
    fetchProviderOffersData(slug, searchQuery);
    fetchUpdatedOpportunities();

    const params = new URLSearchParams(searchParams ? searchParams.toString() : '');
    if (slug) {
      params.set('category', slug);
    } else {
      params.delete('category');
    }
    const q = params.toString();
    router.push(q ? `/opportunities?${q}` : '/opportunities');
  };

  const handleOpenRequestServiceForCategory = (category: Category) => {
    setSelectedModalCatId(category.id);
    setModalDefaultType('NEED');
    setModalOpen(true);
  };

  const handleOpportunityCreated = (newOpp: Opportunity) => {
    setOpportunities((prev) => [newOpp, ...prev]);
    fetchUpdatedOpportunities();
  };

  const handleOpenVendorStorefront = (vendorUser: UserProfile) => {
    setSelectedVendorId(vendorUser.id);
    setSelectedVendorUser(vendorUser);
    setStorefrontOpen(true);

    const params = new URLSearchParams(searchParams ? searchParams.toString() : '');
    params.set('vendor', vendorUser.id);
    params.delete('cat');
    params.delete('opt');
    router.push(`/opportunities?${params.toString()}`);
  };

  const handleCloseVendorStorefront = () => {
    setStorefrontOpen(false);
    setSelectedVendorId(null);
    setSelectedVendorUser(null);

    const params = new URLSearchParams(searchParams ? searchParams.toString() : '');
    if (params.has('vendor')) {
      router.back();
    } else {
      params.delete('vendor');
      params.delete('cat');
      params.delete('opt');
      const q = params.toString();
      router.push(q ? `/opportunities?${q}` : '/opportunities');
    }
  };

  const handleSelectCatalogItemForOrder = (vendor: UserProfile, item: VendorCatalogItem, quantity: number) => {
    setStorefrontOpen(false);
    setDirectOrderParams({
      vendorUser: vendor,
      catalogItem: item,
      quantity: quantity,
    });
    setOrderWizardOpen(true);
  };

  const handleSelectServiceForOrder = (vendor: UserProfile, asset: UserServiceAsset) => {
    setStorefrontOpen(false);
    const catSlug = asset.category?.slug || '';
    const catId = asset.category_id || asset.category?.id || '';
    setDirectOrderParams({
      vendorUser: vendor,
      serviceAsset: asset,
      categorySlug: catSlug,
      categoryId: catId,
    });
    setOrderWizardOpen(true);
  };

  // =========================================================================
  // 1. CANONICAL SERVICE CATEGORY DEDUPLICATION (For REQUEST A SERVICE)
  // Driven EXCLUSIVELY by database category definitions (`getCategories()`)
  // =========================================================================
  const uniqueServiceCategories = categories.filter((cat) => {
    if (selectedCategorySlug && cat.slug !== selectedCategorySlug) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      cat.name.toLowerCase().includes(q) ||
      cat.slug.toLowerCase().includes(q) ||
      (cat.description && cat.description.toLowerCase().includes(q))
    );
  });

  // =========================================================================
  // 2. VENDOR SHOPS DEDUPLICATION (For BROWSE SHOPS / BRANDS)
  // Grouped authoritatively by Vendor User ID so EACH VENDOR APPEARS ONLY ONCE
  // =========================================================================
  const unifiedVendorsMap = new Map<string, UnifiedVendor>();

  // Step 1: Group Catalog Items strictly by Authoritative Vendor User UUID
  catalogItems.forEach((it) => {
    const vUser = it.vendor_user;
    const vendorId = (vUser?.id || it.vendor_user_id || '').trim();
    if (!vendorId) return;

    if (!unifiedVendorsMap.has(vendorId)) {
      const rawName = (vUser?.full_name || '').trim();
      const rawPhone = (vUser?.phone || '').trim();
      unifiedVendorsMap.set(vendorId, {
        vendorId,
        vendorName: rawName || 'Verified Vendor Shop',
        vendorPhone: rawPhone,
        vendorAvatar: vUser?.avatar_url || '',
        trustScore: vUser?.trust_score || 5.0,
        isVerified: vUser?.is_verified ?? true,
        coverageRadiusKm: 50,
        offers: [],
        catalogItems: [],
        vendorUser: vUser || {
          id: vendorId,
          supabase_uid: vendorId,
          full_name: rawName || 'Verified Vendor Shop',
          phone: rawPhone,
          avatar_url: '',
          trust_score: 5.0,
          is_verified: true,
          lat: 17.25,
          lng: 78.95,
        },
      });
    }

    const entry = unifiedVendorsMap.get(vendorId)!;
    if (vUser && entry?.vendorUser && !entry.vendorUser.avatar_url && vUser.avatar_url) {
      entry.vendorUser = vUser;
      entry.vendorAvatar = vUser.avatar_url;
    }
    if (!entry.catalogItems.some((existing) => existing.id === it.id)) {
      entry.catalogItems.push(it);
    }
  });

  // Step 2: Group Provider Offers strictly by Authoritative Vendor User UUID
  providerOffers.forEach((offer) => {
    const vendorId = (offer.provider_id || '').trim();
    if (!vendorId) return;

    if (!unifiedVendorsMap.has(vendorId)) {
      const rawName = (offer.provider_name || '').trim();
      const rawPhone = (offer.provider_phone || '').trim();
      unifiedVendorsMap.set(vendorId, {
        vendorId,
        vendorName: rawName || 'Verified Vendor Shop',
        vendorPhone: rawPhone,
        vendorAvatar: offer.provider_avatar || '',
        trustScore: offer.trust_score || 5.0,
        isVerified: true,
        coverageRadiusKm: offer.coverage_radius_km || 50,
        offers: [],
        catalogItems: [],
        vendorUser: {
          id: vendorId,
          supabase_uid: vendorId,
          full_name: rawName || 'Verified Vendor Shop',
          phone: rawPhone,
          avatar_url: offer.provider_avatar || '',
          trust_score: offer.trust_score || 5.0,
          is_verified: true,
          lat: 17.25,
          lng: 78.95,
        },
      });
    }

    const entry = unifiedVendorsMap.get(vendorId)!;
    if (!entry.offers.some((o) => o.offer_id === offer.offer_id)) {
      entry.offers.push(offer);
    }
  });

  const unifiedVendors = Array.from(unifiedVendorsMap.values());

  const filteredUnifiedVendors = unifiedVendors.filter((v) => {
    const q = searchQuery.trim().toLowerCase();
    const catSlug = selectedCategorySlug.toLowerCase();

    const hasMatchingCategory =
      !catSlug ||
      v.catalogItems.some((it) => it.category?.slug?.toLowerCase() === catSlug) ||
      v.offers.some(
        (off) =>
          off.category_slug?.toLowerCase() === catSlug ||
          off.category_name?.toLowerCase().includes(catSlug)
      );

    if (!hasMatchingCategory) return false;
    if (!q) return true;

    const nameMatch =
      v.vendorName.toLowerCase().includes(q) ||
      (v.vendorPhone && v.vendorPhone.includes(q));

    const catalogMatch = v.catalogItems.some(
      (it) =>
        it.title.toLowerCase().includes(q) ||
        (it.description && it.description.toLowerCase().includes(q)) ||
        (it.category?.name && it.category.name.toLowerCase().includes(q))
    );

    const offerMatch = v.offers.some(
      (off) =>
        off.title.toLowerCase().includes(q) ||
        (off.description && off.description.toLowerCase().includes(q)) ||
        (off.category_name && off.category_name.toLowerCase().includes(q))
    );

    return nameMatch || catalogMatch || offerMatch;
  });

  // Filter submitted opportunities for the separate requests feed
  const filteredSubmittedOpportunities = opportunities.filter((opp) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return opp.title.toLowerCase().includes(q) || opp.description.toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 px-4 sm:px-6 py-8 sm:py-12 selection:bg-black selection:text-white">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Navigation & Cart Bar */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined' && window.history.length > 1 && document.referrer && !document.referrer.endsWith('/opportunities') && !document.referrer.endsWith('/')) {
                router.back();
              } else {
                router.push('/dashboard');
              }
            }}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-black transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 hover:text-black hover:bg-slate-100 text-xs font-bold flex items-center gap-2 transition-all shadow-sm"
            >
              <ShoppingBag className="w-4 h-4 text-black" />
              <span>Cart</span>
              {cartCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-black text-white font-mono text-[10px] font-extrabold">
                  {cartCount}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                setDirectOrderParams({});
                setOrderWizardOpen(true);
              }}
              className="inline-flex items-center gap-2 text-xs font-bold text-white bg-black hover:bg-slate-800 px-4 py-2 rounded-xl transition-all shadow-md"
            >
              <PlusCircle className="w-4 h-4 text-white" />
              <span>New Order Wizard</span>
            </button>
          </div>
        </div>

        {/* Hero Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold text-slate-900 bg-white border border-slate-300 uppercase tracking-widest flex items-center gap-1.5 shadow-sm">
                <Sparkles className="w-3.5 h-3.5 text-slate-800" />
                Universal Customer Platform
              </span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
              Marketplace
            </h1>
            <p className="text-slate-600 mt-2 text-sm sm:text-base max-w-2xl">
              Request any service by defining your custom requirement & location, or browse verified vendor shops to book direct catalog items.
            </p>
          </div>
        </div>

        {/* PRIMARY MARKETPLACE CHOICES (EXACTLY TWO CARDS) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* CARD 1: BROWSE SHOPS / BRANDS */}
          <button
            onClick={() => setActiveTab('SHOPS')}
            className={`p-8 rounded-3xl border text-left transition-all relative overflow-hidden group flex flex-col justify-between space-y-6 ${
              activeTab === 'SHOPS'
                ? 'bg-white border-black text-slate-900 shadow-md ring-2 ring-black'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-900'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="p-4 rounded-2xl bg-black text-white shrink-0">
                <Store className="w-8 h-8 text-white" />
              </div>
              {activeTab === 'SHOPS' && (
                <span className="px-3 py-1 rounded-full bg-black text-white text-xs font-bold flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-white" />
                  Selected
                </span>
              )}
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-extrabold text-slate-900 group-hover:underline transition-colors">
                BROWSE SHOPS / BRANDS
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Choose a shop, brand, or vendor and book their available products and services directly.
              </p>
            </div>

            <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
              <span className="px-5 py-2.5 rounded-xl bg-black hover:bg-slate-800 text-white font-extrabold text-xs inline-flex items-center gap-2 shadow-md transition-all">
                <span>Browse Shops</span>
                <ChevronRight className="w-4 h-4 text-white" />
              </span>
              <span className="text-xs text-slate-500 font-medium">Direct vendor catalog orders</span>
            </div>
          </button>

          {/* CARD 2: REQUEST WHAT YOU NEED */}
          <button
            onClick={() => setActiveTab('REQUEST_WHAT_YOU_NEED')}
            className={`p-8 rounded-3xl border text-left transition-all relative overflow-hidden group flex flex-col justify-between space-y-6 ${
              activeTab === 'REQUEST_WHAT_YOU_NEED'
                ? 'bg-white border-black text-slate-900 shadow-md ring-2 ring-black'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-900'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="p-4 rounded-2xl bg-black text-white shrink-0">
                <Wrench className="w-8 h-8 text-white" />
              </div>
              {activeTab === 'REQUEST_WHAT_YOU_NEED' && (
                <span className="px-3 py-1 rounded-full bg-black text-white text-xs font-bold flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-white" />
                  Selected
                </span>
              )}
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-extrabold text-slate-900 group-hover:underline transition-colors">
                REQUEST WHAT YOU NEED
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Tell us exactly what you need, including custom quantity and location. We&apos;ll find eligible providers.
              </p>
            </div>

            <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
              <span className="px-5 py-2.5 rounded-xl bg-black hover:bg-slate-800 text-white font-extrabold text-xs inline-flex items-center gap-2 shadow-md transition-all">
                <span>Make a Request</span>
                <ChevronRight className="w-4 h-4 text-white" />
              </span>
              <span className="text-xs text-slate-500 font-medium">Match local providers</span>
            </div>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* PATH 2: REQUEST WHAT YOU NEED (STEP 1: SELECT A SERVICE) */}
        {/* ========================================================================= */}
        {activeTab === 'REQUEST_WHAT_YOU_NEED' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                  REQUEST WHAT YOU NEED
                </h2>
                <p className="text-slate-600 text-xs sm:text-sm mt-1">
                  What do you need? Select a service category to specify your requirement details.
                </p>
              </div>
            </div>

            {/* Search and Category Filter */}
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <div className="relative w-full">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search for what you need... (e.g. Bricks, Driver, Cement, Plumbing)"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-black font-sans"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                </div>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                <button
                  onClick={() => handleCategorySelect('')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition-all border ${
                    !selectedCategorySlug
                      ? 'bg-black border-black text-white shadow-md'
                      : 'bg-white border-slate-300 text-slate-700 hover:text-black hover:bg-slate-50'
                  }`}
                >
                  All
                </button>

                {categories.map((cat) => {
                  const isSelected = selectedCategorySlug === cat.slug;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => handleCategorySelect(cat.slug)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition-all border flex items-center gap-2 ${
                        isSelected
                          ? 'bg-black border-black text-white shadow-md'
                          : 'bg-white border-slate-300 text-slate-700 hover:text-black hover:bg-slate-50'
                      }`}
                    >
                      <Tag className="w-3.5 h-3.5" />
                      <span>{cat.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Service Selection Cards Grid */}
            {uniqueServiceCategories.length === 0 ? (
              <div className="text-center py-16 px-4 rounded-3xl bg-white border border-slate-200 space-y-4 shadow-sm">
                <Wrench className="w-12 h-12 text-slate-400 mx-auto" />
                <h4 className="text-base font-bold text-slate-900">No Services Found</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  No service categories match your search. Try clearing your search query or filters.
                </p>
                <button
                  onClick={() => handleCategorySelect('')}
                  className="px-4 py-2 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs"
                >
                  Clear Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {uniqueServiceCategories.map((cat) => {
                  const slug = (cat.slug || cat.name || '').toLowerCase();
                  let emoji = '📦';
                  if (slug.includes('brick') || slug.includes('building')) emoji = '🧱';
                  else if (slug.includes('cement') || slug.includes('construction')) emoji = '🏗️';
                  else if (slug.includes('agri') || slug.includes('farm')) emoji = '🌾';
                  else if (slug.includes('driver') || slug.includes('transport') || slug.includes('logistics') || slug.includes('vehicle')) emoji = '🚚';
                  else if (slug.includes('labour') || slug.includes('labor') || slug.includes('site')) emoji = '👷';
                  else if (slug.includes('plumb')) emoji = '🚰';
                  else if (slug.includes('electr')) emoji = '⚡';
                  else if (slug.includes('repair') || slug.includes('mechanic')) emoji = '🛠️';
                  else if (slug.includes('medicine') || slug.includes('health')) emoji = '🩺';
                  else if (slug.includes('tutor') || slug.includes('education')) emoji = '📚';

                  return (
                    <div
                      key={cat.id}
                      className="p-6 rounded-3xl bg-white border border-slate-200 hover:border-slate-400 transition-all flex flex-col justify-between space-y-6 shadow-sm group"
                    >
                      <div className="space-y-3">
                        <div className="text-4xl">{emoji}</div>
                        <h3 className="text-xl font-extrabold text-slate-900 group-hover:underline transition-colors">
                          {cat.name}
                        </h3>
                        <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                          {cat.description || `Verified ${cat.name} services, offerings, and custom requirements.`}
                        </p>
                      </div>

                      <div className="pt-4 border-t border-slate-200 flex items-center justify-end">
                        <button
                          onClick={() => handleOpenRequestServiceForCategory(cat)}
                          className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-black hover:bg-slate-800 text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-2 transition-all"
                        >
                          <span>SELECT</span>
                          <ChevronRight className="w-4 h-4 text-white" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: BROWSE SHOPS / BRANDS (DEDUPLICATED BY VENDOR USER ID) */}
        {/* Predefined packages are allowed ONLY inside VendorStorefrontModal */}
        {/* ========================================================================= */}
        {activeTab === 'SHOPS' && (
          <div className="space-y-6">
            {/* Search and Category Filter for Shops Path */}
            <div className="space-y-4 pt-2">
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <div className="relative w-full">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search vendor shops or catalog products (e.g. XYZ Services, Bricks, Cement)..."
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-black font-mono"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-slate-800" />
                    <span>Filter Shops by Category</span>
                  </span>
                  {selectedCategorySlug && (
                    <button
                      onClick={() => handleCategorySelect('')}
                      className="text-xs text-black hover:underline font-semibold"
                    >
                      Clear Category Filter
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                  <button
                    onClick={() => handleCategorySelect('')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition-all border ${
                      !selectedCategorySlug
                        ? 'bg-black border-black text-white shadow-md'
                        : 'bg-white border-slate-300 text-slate-700 hover:text-black hover:bg-slate-50'
                    }`}
                  >
                    All Categories
                  </button>

                  {categories.map((cat) => {
                    const isSelected = selectedCategorySlug === cat.slug;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => handleCategorySelect(cat.slug)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition-all border flex items-center gap-2 ${
                          isSelected
                            ? 'bg-black border-black text-white shadow-md'
                            : 'bg-white border-slate-300 text-slate-700 hover:text-black hover:bg-slate-50'
                        }`}
                      >
                        <Tag className="w-3.5 h-3.5" />
                        <span>{cat.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-extrabold uppercase text-slate-900 tracking-wider flex items-center gap-2">
                <Store className="w-4 h-4 text-slate-800" />
                <span>Verified Vendor Shops ({filteredUnifiedVendors.length} Vendors Found)</span>
              </h3>
              <span className="text-xs text-slate-500 font-mono">Each vendor appears EXACTLY ONCE</span>
            </div>

            {loadingCatalog || loadingProviders ? (
              <div className="text-center py-16 px-4 rounded-3xl bg-white border border-slate-200 space-y-3 shadow-sm">
                <Clock className="w-8 h-8 text-black animate-spin mx-auto" />
                <p className="text-xs text-slate-500">Loading verified vendor storefronts...</p>
              </div>
            ) : filteredUnifiedVendors.length === 0 ? (
              <div className="text-center py-16 px-4 rounded-3xl bg-white border border-slate-200 space-y-4 shadow-sm">
                <Store className="w-12 h-12 text-slate-400 mx-auto" />
                <h4 className="text-base font-bold text-slate-900">No Vendor Shops Found</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  No verified vendor shops match your current search query or filter. Try clearing filters or switch to &quot;Request a Service&quot;.
                </p>
                <button
                  onClick={() => handleCategorySelect('')}
                  className="px-4 py-2 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs"
                >
                  Clear Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {filteredUnifiedVendors.map((v) => {
                  const vendorUserObj: UserProfile = v.vendorUser || {
                    id: v.vendorId,
                    supabase_uid: v.vendorId,
                    full_name: v.vendorName,
                    phone: v.vendorPhone,
                    avatar_url: v.vendorAvatar,
                    trust_score: v.trustScore,
                    is_verified: v.isVerified,
                    lat: 17.25,
                    lng: 78.95,
                  };

                  const offeringNames = Array.from(
                    new Set([
                      ...v.catalogItems.map((it) => it.title || it.category?.name),
                      ...v.offers.map((off) => off.title || off.category_name),
                    ])
                  ).filter((name): name is string => Boolean(name));

                  const MAX_DISPLAY = 5;
                  const displayedOfferings = offeringNames.slice(0, MAX_DISPLAY);
                  const remainingCount = offeringNames.length - MAX_DISPLAY;

                  return (
                    <div
                      key={v.vendorId}
                      className="p-6 rounded-3xl bg-white border border-slate-200 hover:border-slate-400 transition-all flex flex-col justify-between space-y-5 group shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                          <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                            {v.vendorAvatar ? (
                              <img src={v.vendorAvatar} alt={v.vendorName} className="w-full h-full object-cover" />
                            ) : (
                              <Store className="w-7 h-7 text-black" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-lg font-extrabold text-slate-900 group-hover:underline transition-colors">
                                {v.vendorName}
                              </h4>
                              {v.isVerified && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black text-white text-[10px] font-extrabold">
                                  <ShieldCheck className="w-3 h-3 text-white" />
                                  VERIFIED VENDOR
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 text-slate-700 shrink-0" />
                                <span>Coverage Area ({v.coverageRadiusKm}km radius)</span>
                              </span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold shrink-0">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                          <span>{v.trustScore ? v.trustScore.toFixed(1) : '5.0'}</span>
                        </div>
                      </div>

                      {offeringNames.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">
                            Available Products &amp; Services:
                          </span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {displayedOfferings.map((name) => (
                              <span
                                key={name}
                                className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold"
                              >
                                {name}
                              </span>
                            ))}
                            {remainingCount > 0 && (
                              <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold">
                                +{remainingCount} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      <button
                        onClick={() => handleOpenVendorStorefront(vendorUserObj)}
                        className="w-full py-3.5 rounded-2xl bg-black hover:bg-slate-800 text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-2 transition-all"
                      >
                        <Store className="w-4 h-4 text-white" />
                        <span>View Shop & Storefront</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SECONDARY FOOTER SECTION: SUBMITTED REQUESTS & ORDER LOGS */}
        {/* Kept OUT of the top primary choice area */}
        <div className="pt-8 border-t border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-700" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Submitted Requests & Order History
              </h3>
            </div>
            <button
              onClick={() => setShowSubmittedRequests(!showSubmittedRequests)}
              className="text-xs text-black hover:underline font-semibold flex items-center gap-1"
            >
              <span>{showSubmittedRequests ? 'Hide History Logs' : `Show History Logs (${opportunities.length})`}</span>
            </button>
          </div>

          {showSubmittedRequests && (
            <div className="p-6 rounded-3xl bg-slate-50 border border-slate-200 space-y-4 animate-in fade-in">
              {filteredSubmittedOpportunities.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">No submitted requests found.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredSubmittedOpportunities.map((opp) => {
                    const qtyMeta = opp.metadata && typeof opp.metadata === 'object'
                      ? (opp.metadata as any).quantity
                      : opp.quantity;

                    return (
                      <div
                        key={opp.id}
                        className="p-4 rounded-2xl bg-white border border-slate-200 flex flex-col justify-between space-y-3 text-xs shadow-sm"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 text-[10px] font-bold uppercase">
                              {opp.type === 'NEED' ? 'REQUEST' : 'OFFER'}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-[10px] text-slate-700 font-mono">
                              {opp.status}
                            </span>
                          </div>
                          <h5 className="font-bold text-slate-900 text-xs">{opp.title}</h5>
                          <p className="text-[11px] text-slate-600 line-clamp-2">{opp.description}</p>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600">
                          {qtyMeta ? <span>Qty: {qtyMeta} Units</span> : <span>Broadcast</span>}
                          <span className="font-mono text-emerald-700 font-bold">
                            {opp.budget_max ? `₹${opp.budget_max.toLocaleString()}` : 'Broadcast Match'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Vendor Storefront Modal */}
        <VendorStorefrontModal
          isOpen={storefrontOpen}
          onClose={handleCloseVendorStorefront}
          vendorId={selectedVendorId}
          initialVendorUser={selectedVendorUser}
          onSelectCatalogItemForOrder={handleSelectCatalogItemForOrder}
          onSelectServiceForOrder={handleSelectServiceForOrder}
          onSwitchToRequestWhatYouNeed={(catSlug, initialQty, itemTitle) => {
            const cat = categories.find((c) => c.slug === catSlug || c.id === catSlug);
            setSelectedModalCatId(cat ? cat.id : catSlug);
            setReqModalInitialQty(initialQty || 750);
            setReqModalInitialUnit('Pieces');
            if (itemTitle) {
              setReqModalInitialValues({ offering_name: itemTitle });
            }
            setModalDefaultType('NEED');
            setModalOpen(true);
          }}
        />

        {/* Create Order Wizard Modal */}
        <CreateOrderWizardModal
          isOpen={orderWizardOpen}
          onClose={() => {
            setOrderWizardOpen(false);
            if (checkoutOpenedFromCart) {
              setCheckoutOpenedFromCart(false);
              setIsCartOpen(true);
            }
          }}
          initialCategorySlug={selectedCategorySlug}
          directOrderParams={directOrderParams}
          onCreated={handleOpportunityCreated}
        />

        {/* Create Opportunity Modal for Model 2: Request What You Need */}
        <CreateOpportunityModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          defaultType={modalDefaultType}
          initialCategoryId={selectedModalCatId}
          initialQuantity={reqModalInitialQty}
          initialUnit={reqModalInitialUnit}
          initialCustomValues={reqModalInitialValues}
          onCreated={handleOpportunityCreated}
        />

        {/* Cart Drawer Modal */}
        <CartDrawerModal
          isOpen={isCartOpen}
          onClose={() => setIsCartOpen(false)}
          onProceedToCheckout={() => {
            setIsCartOpen(false);
            setDirectOrderParams({});
            setCheckoutOpenedFromCart(true);
            setOrderWizardOpen(true);
          }}
        />
      </div>
    </div>
  );
}
