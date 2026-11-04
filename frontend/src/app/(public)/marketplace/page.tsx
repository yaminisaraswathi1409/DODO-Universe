'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Category,
  VendorCatalogItem,
  MarketplaceVendorCard,
  UserProfile,
  getCategories,
  searchMarketplaceCatalog,
  getEligibleVendorsByCategory,
  getStoredUser,
} from '@/lib/api';
import OfferingCard from '@/components/OfferingCard';
import VendorCard from '@/components/VendorCard';
import CompareFloatingBar from '@/components/CompareFloatingBar';
import VendorStorefrontModal from '@/components/VendorStorefrontModal';
import CartDrawerModal from '@/components/CartDrawerModal';
import { useCart } from '@/context/CartContext';
import {
  Search,
  Filter,
  Layers,
  Store,
  Package,
  SlidersHorizontal,
  X,
  ArrowUpDown,
  Sparkles,
  MapPin,
  Clock,
  ChevronRight,
  ShoppingCart,
  CheckCircle2,
} from 'lucide-react';

function CustomerMarketplaceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { cartCount, isCartOpen, setIsCartOpen } = useCart();

  // URL Query Parameters
  const initialCategory = searchParams?.get('category') || '';
  const initialQuery = searchParams?.get('q') || '';
  const initialVendor = searchParams?.get('vendor') || null;

  // View state
  const [activeTab, setActiveTab] = useState<'OFFERINGS' | 'VENDORS'>('OFFERINGS');
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);
  const [selectedSort, setSelectedSort] = useState<string>('relevance');
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);
  const [priceType, setPriceType] = useState<string>('ALL');

  // Data state
  const [categories, setCategories] = useState<Category[]>([]);
  const [offerings, setOfferings] = useState<VendorCatalogItem[]>([]);
  const [totalOfferings, setTotalOfferings] = useState(0);
  const [vendors, setVendors] = useState<MarketplaceVendorCard[]>([]);
  const [totalVendors, setTotalVendors] = useState(0);
  const [loading, setLoading] = useState(true);

  // Recently viewed
  const [recentlyViewed, setRecentlyViewed] = useState<VendorCatalogItem[]>([]);

  // Compare state
  const [comparedItems, setComparedItems] = useState<VendorCatalogItem[]>([]);

  // Vendor Storefront Modal
  const [storefrontOpen, setStorefrontOpen] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(initialVendor);

  // Filter drawer toggle for mobile
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Load categories
  useEffect(() => {
    getCategories()
      .then((cats) => {
        // Filter only active & selectable categories
        const activeCats = cats.filter((c) => c.is_selectable !== false);
        setCategories(activeCats);
      })
      .catch(() => {});
  }, []);

  // Load recently viewed from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('uop_recently_viewed_offerings');
        if (stored) {
          setRecentlyViewed(JSON.parse(stored).slice(0, 4));
        }
      } catch {}
    }
  }, []);

  // Load offerings and vendors
  const fetchData = async () => {
    setLoading(true);
    try {
      const minP = minPrice ? parseFloat(minPrice) : undefined;
      const maxP = maxPrice ? parseFloat(maxPrice) : undefined;

      // 1. Fetch Offerings
      const searchRes = await searchMarketplaceCatalog({
        query: searchQuery,
        category: selectedCategory,
        min_price: minP,
        max_price: maxP,
        price_type: priceType !== 'ALL' ? priceType : undefined,
        in_stock: inStockOnly,
        sort_by: selectedSort,
        limit: 24,
      });

      setOfferings(searchRes.items);
      setTotalOfferings(searchRes.total);

      // 2. Fetch Vendors for category
      const vendorRes = await getEligibleVendorsByCategory(
        selectedCategory || 'ALL',
        undefined,
        undefined,
        1,
        20
      );
      setVendors(vendorRes.vendors);
      setTotalVendors(vendorRes.total);
    } catch (err) {
      console.error('Marketplace fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedCategory, selectedSort, inStockOnly, priceType]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData();
  };

  // Compare item toggle
  const handleToggleCompare = (item: VendorCatalogItem) => {
    setComparedItems((prev) => {
      const exists = prev.some((it) => it.id === item.id);
      if (exists) {
        return prev.filter((it) => it.id !== item.id);
      } else {
        if (prev.length >= 4) {
          alert('You can compare a maximum of 4 offerings simultaneously.');
          return prev;
        }
        return [...prev, item];
      }
    });
  };

  const handleOpenStorefront = (vId: string) => {
    setSelectedVendorId(vId);
    setStorefrontOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-24">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-black flex items-center justify-center text-white font-black text-sm shadow-sm">
                D
              </div>
              <div>
                <span className="font-extrabold text-base tracking-tight text-slate-900 block leading-tight">
                  Marketplace
                </span>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Customer Discovery
                </span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-5 text-xs font-bold text-slate-600">
              <Link href="/marketplace" className="text-black font-extrabold">Browse All</Link>
              <Link href="/categories" className="hover:text-black transition-colors">Platform Categories</Link>
              <Link href="/opportunities" className="hover:text-black transition-colors">Custom Service Requests</Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors flex items-center gap-2 text-xs font-bold"
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">My Cart</span>
              {cartCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-black text-white text-[11px] font-black flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Search & Category Banner */}
      <section className="bg-white border-b border-slate-200 px-4 sm:px-8 pt-8 pb-10 shadow-sm">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="max-w-3xl">
            <span className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-black" />
              <span>Universal Catalog & Verified Providers</span>
            </span>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 mt-2 tracking-tight">
              Discover Products & Services
            </h1>
            <p className="text-sm sm:text-base text-slate-500 mt-2">
              Browse approved vendor catalogs, compare specifications side-by-side, and order directly with single-vendor fulfilment.
            </p>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 max-w-3xl">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products, materials, brick types, SKUs, or vendors..."
                className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-100/80 focus:bg-white border border-transparent focus:border-slate-900 text-sm font-medium transition-all outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="px-6 py-3.5 rounded-2xl bg-black hover:bg-slate-800 text-white font-bold text-sm shadow-md transition-all flex items-center gap-2 flex-shrink-0"
            >
              <span>Search</span>
            </button>
          </form>

          {/* Dynamic Platform Category Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedCategory('')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex-shrink-0 transition-all ${
                !selectedCategory
                  ? 'bg-black text-white shadow-sm'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              All Categories
            </button>
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat.slug;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(isSelected ? '' : cat.slug)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex-shrink-0 transition-all flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-black text-white shadow-sm'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  <span>{cat.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-10">
        {/* Controls Bar: Tabs, Filter Toggle, Sort Dropdown */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          {/* Discovery View Switcher */}
          <div className="flex items-center gap-2 bg-slate-200/70 p-1.5 rounded-2xl w-fit">
            <button
              type="button"
              onClick={() => setActiveTab('OFFERINGS')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'OFFERINGS'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-black'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Bookable Offerings ({totalOfferings})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('VENDORS')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'VENDORS'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-black'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>Approved Vendors ({totalVendors})</span>
            </button>
          </div>

          {/* Filter Bar Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Price Type Filter */}
            <select
              value={priceType}
              onChange={(e) => setPriceType(e.target.value)}
              className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 outline-none hover:border-slate-400 transition-colors"
            >
              <option value="ALL">All Pricing Types</option>
              <option value="FIXED">Fixed Price Only</option>
              <option value="QUOTATION">Custom Quote Only</option>
            </select>

            {/* In Stock Toggle */}
            <label className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer hover:border-slate-400 transition-colors">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-black focus:ring-black accent-black"
              />
              <span>In Stock Only</span>
            </label>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedSort}
                onChange={(e) => setSelectedSort(e.target.value)}
                className="bg-transparent outline-none font-bold text-slate-800 cursor-pointer"
              >
                <option value="relevance">Top Rated & Relevant</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="newest">Recently Listed</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tab 1: Bookable Offerings Grid */}
        {activeTab === 'OFFERINGS' && (
          <section className="space-y-6">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-pulse">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div key={i} className="h-80 bg-slate-200/70 rounded-3xl" />
                ))}
              </div>
            ) : offerings.length === 0 ? (
              <div className="text-center py-20 px-4 rounded-3xl bg-white border border-slate-200 space-y-4 shadow-sm">
                <Package className="w-14 h-14 text-slate-300 mx-auto" />
                <h3 className="text-lg font-black text-slate-900">No Offerings Found</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  No approved bookable offerings match your current filters. Try changing your search query or selecting a different category.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('');
                    setSearchQuery('');
                    setPriceType('ALL');
                    setInStockOnly(false);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-black text-white text-xs font-bold"
                >
                  Clear All Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {offerings.map((item) => {
                  const isCompared = comparedItems.some((i) => i.id === item.id);
                  return (
                    <OfferingCard
                      key={item.id}
                      item={item}
                      isCompared={isCompared}
                      onToggleCompare={handleToggleCompare}
                      onOpenStorefront={handleOpenStorefront}
                    />
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Tab 2: Approved Vendors Grid */}
        {activeTab === 'VENDORS' && (
          <section className="space-y-6">
            {loading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-pulse">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-64 bg-slate-200/70 rounded-3xl" />
                ))}
              </div>
            ) : vendors.length === 0 ? (
              <div className="text-center py-20 px-4 rounded-3xl bg-white border border-slate-200 space-y-4 shadow-sm">
                <Store className="w-14 h-14 text-slate-300 mx-auto" />
                <h3 className="text-lg font-black text-slate-900">No Approved Vendors Found</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  No verified vendors are currently registered for this category.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {vendors.map((vendor) => (
                  <VendorCard
                    key={vendor.vendor_id}
                    vendor={vendor}
                    onOpenStorefront={handleOpenStorefront}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Recently Viewed Section */}
        {recentlyViewed.length > 0 && (
          <section className="pt-10 border-t border-slate-200 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-500" />
                <span>Recently Viewed Offerings</span>
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {recentlyViewed.map((item) => (
                <OfferingCard
                  key={`recent_${item.id}`}
                  item={item}
                  isCompared={comparedItems.some((i) => i.id === item.id)}
                  onToggleCompare={handleToggleCompare}
                  onOpenStorefront={handleOpenStorefront}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Floating Comparison Bar */}
      <CompareFloatingBar
        items={comparedItems}
        onRemoveItem={(id) => setComparedItems((prev) => prev.filter((it) => it.id !== id))}
        onClearAll={() => setComparedItems([])}
      />

      {/* Vendor Storefront Modal */}
      <VendorStorefrontModal
        isOpen={storefrontOpen}
        onClose={() => setStorefrontOpen(false)}
        vendorId={selectedVendorId}
      />

      {/* Cart Drawer */}
      <CartDrawerModal
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
      />
    </div>
  );
}


export default function CustomerMarketplacePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-black rounded-full animate-spin" />
        </div>
      }
    >
      <CustomerMarketplaceContent />
    </Suspense>
  );
}
