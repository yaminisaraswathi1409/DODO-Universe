'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Opportunity, Category, getPublicOpportunities, getCategories } from '@/lib/api';
import CreateOpportunityModal from '@/components/CreateOpportunityModal';
import CreateOrderWizardModal from '@/components/CreateOrderWizardModal';
import ServiceDetailModal from '@/components/ServiceDetailModal';
import CartDrawerModal from '@/components/CartDrawerModal';
import { useCart } from '@/context/CartContext';
import {
  ArrowLeft,
  MapPin,
  Tag,
  Clock,
  ArrowUpRight,
  HelpCircle,
  Handshake,
  PlusCircle,
  Layers,
  Sparkles,
  Search,
  ShoppingBag,
  Filter,
  Package,
  Wrench,
  Truck,
  Tractor,
  Home,
  CheckCircle,
} from 'lucide-react';

interface MarketplaceClientProps {
  initialOpportunities: Opportunity[];
  initialTotal: number;
  initialCategory: string;
  initialType: string;
}

export default function OpportunitiesMarketplaceClient({
  initialOpportunities,
  initialTotal,
  initialCategory,
  initialType,
}: MarketplaceClientProps) {
  const { cartCount, isCartOpen, setIsCartOpen } = useCart();
  const [opportunities, setOpportunities] = useState<Opportunity[]>(initialOpportunities);
  const [total, setTotal] = useState<number>(initialTotal);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string>(initialCategory);
  const [activeType, setActiveType] = useState<string>(initialType);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDefaultType, setModalDefaultType] = useState<'NEED' | 'OFFER'>('NEED');
  const [orderWizardOpen, setOrderWizardOpen] = useState(false);
  const [serviceDetailModalOpen, setServiceDetailModalOpen] = useState(false);
  const [selectedCategoryForDetail, setSelectedCategoryForDetail] = useState<Category | null>(null);
  const [selectedOppForDetail, setSelectedOppForDetail] = useState<Opportunity | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    getCategories().then((cats) => {
      setCategories(cats);
    }).catch(() => {});
  }, []);

  const fetchUpdatedList = async (catSlug = selectedCategorySlug, typeFilter = activeType) => {
    setRefreshing(true);
    try {
      const res = await getPublicOpportunities(catSlug, typeFilter, 1);
      setOpportunities(res.data);
      setTotal(res.total);
    } catch {
      // Keep existing list if error
    } finally {
      setRefreshing(false);
    }
  };

  const handleCategorySelect = (slug: string) => {
    setSelectedCategorySlug(slug);
    fetchUpdatedList(slug, activeType);
  };

  const handleFilterType = (type: string) => {
    setActiveType(type);
    fetchUpdatedList(selectedCategorySlug, type);
  };

  const handleOpenModal = (type: 'NEED' | 'OFFER') => {
    setModalDefaultType(type);
    setModalOpen(true);
  };

  const handleOpportunityCreated = (newOpp: Opportunity) => {
    setOpportunities((prev) => [newOpp, ...prev]);
    setTotal((prev) => prev + 1);
    fetchUpdatedList();
  };

  const handleOpenServiceDetail = (cat: Category, opp?: Opportunity) => {
    setSelectedCategoryForDetail(cat);
    setSelectedOppForDetail(opp || null);
    setServiceDetailModalOpen(true);
  };

  // Filter opportunities by text search query
  const filteredOpportunities = opportunities.filter((opp) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const titleMatch = opp.title.toLowerCase().includes(q);
    const descMatch = opp.description.toLowerCase().includes(q);
    const catMatch = opp.category?.name.toLowerCase().includes(q) || opp.category?.slug.toLowerCase().includes(q);
    const metaMatch = opp.metadata ? JSON.stringify(opp.metadata).toLowerCase().includes(q) : false;
    return titleMatch || descMatch || catMatch || metaMatch;
  });

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 px-4 sm:px-6 py-8 sm:py-12">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Navigation & Cart Bar */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </Link>

          <div className="flex items-center gap-3">
            {/* Live Shopping Cart Drawer Trigger */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 hover:text-white text-xs font-bold flex items-center gap-2 transition-all shadow-md"
            >
              <ShoppingBag className="w-4 h-4 text-emerald-400" />
              <span>Cart</span>
              {cartCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white font-mono text-[10px] font-extrabold animate-pulse">
                  {cartCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setOrderWizardOpen(true)}
              className="inline-flex items-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl transition-all shadow-lg shadow-blue-600/30"
            >
              <PlusCircle className="w-4 h-4" />
              <span>New Order Wizard</span>
            </button>
          </div>
        </div>

        {/* Hero Header & Multi-Service Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 uppercase tracking-widest flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Multi-Service DB Marketplace ({total} Active)
              </span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
              Universal Marketplace
            </h1>
            <p className="text-slate-400 mt-2 text-sm sm:text-base max-w-2xl">
              Browse any category (Bricks, Cement, Transport, Vehicle Repair, Home Services, Agriculture) and customize dynamic attributes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              onClick={() => handleOpenModal('NEED')}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-xl shadow-blue-600/30 flex items-center gap-2 transition-all"
            >
              <HelpCircle className="w-4 h-4" />
              <span>Post a Need</span>
            </button>

            <button
              onClick={() => handleOpenModal('OFFER')}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-xl shadow-emerald-600/30 flex items-center gap-2 transition-all"
            >
              <Handshake className="w-4 h-4" />
              <span>Post an Offer</span>
            </button>
          </div>
        </div>

        {/* Dynamic Category Selector Bar */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-blue-400" />
              <span>Browse Categories</span>
            </span>
            {selectedCategorySlug && (
              <button
                onClick={() => handleCategorySelect('')}
                className="text-xs text-blue-400 hover:underline font-semibold"
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
                  ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-600/30'
                  : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
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
                      ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-600/30'
                      : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>{cat.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Search & Type Filter Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          {/* Live Search Input */}
          <div className="relative w-full sm:w-96">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Bricks, Cement, Transport, Mechanics, Farm..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500 font-mono"
            />
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3 text-slate-400" />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={() => handleFilterType('')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                !activeType ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              All Types
            </button>
            <button
              onClick={() => handleFilterType('NEED')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                activeType === 'NEED' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              Needs
            </button>
            <button
              onClick={() => handleFilterType('OFFER')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                activeType === 'OFFER' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              Offers
            </button>
          </div>
        </div>

        {/* Dynamic Category Cards Grid for Quick Selection */}
        {categories.length > 0 && !searchQuery && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">
              Popular Service & Product Catalog
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleOpenServiceDetail(cat)}
                  className="p-3.5 rounded-2xl bg-[#0d1322] hover:bg-slate-800/80 border border-slate-800 hover:border-blue-500/50 text-left transition-all group flex flex-col justify-between"
                >
                  <div>
                    <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 w-fit mb-2 text-blue-400 group-hover:scale-105 transition-transform">
                      <Layers className="w-4 h-4" />
                    </div>
                    <h4 className="text-xs font-bold text-white group-hover:text-blue-400 transition-colors line-clamp-1">
                      {cat.name}
                    </h4>
                    <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                      {cat.opportunity_fields?.length || 0} Dynamic Specs
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-blue-400 mt-3 inline-block">
                    Add to Cart →
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}


      </div>

      {/* Dynamic Creation Modal */}
      <CreateOpportunityModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        defaultType={modalDefaultType}
        onCreated={handleOpportunityCreated}
      />

      {/* Full Order Creation Wizard Modal */}
      <CreateOrderWizardModal
        isOpen={orderWizardOpen}
        onClose={() => setOrderWizardOpen(false)}
        onCreated={handleOpportunityCreated}
      />

      {/* Dynamic Service & Product Detail / Customization Modal */}
      <ServiceDetailModal
        isOpen={serviceDetailModalOpen}
        onClose={() => setServiceDetailModalOpen(false)}
        category={selectedCategoryForDetail}
        opportunity={selectedOppForDetail}
      />

      {/* Shopping Cart Slide-Over Drawer */}
      <CartDrawerModal
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        onProceedToCheckout={() => setOrderWizardOpen(true)}
      />
    </div>
  );
}

