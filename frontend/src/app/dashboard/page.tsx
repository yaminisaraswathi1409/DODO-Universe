'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  UserProfile,
  listUsers,
  getCategories,
  getUserServices,
  addUserService,
  submitServiceDocuments,
  uploadFile,
  Category,
  UserServiceAsset,
  RequiredDocumentSpec,
  getOpportunityTree,
  triggerLogisticsCascade,
  generateWayManifest,
  uploadProofOfLoading,
  uploadProofOfDelivery,
  searchAutoParts,
  checkoutAutoPart,
  createVehicleDriverPairing,
  settleEscrowTree,
  OpportunityTreeNode,
  getPublicOpportunities,
  Opportunity,
} from '@/lib/api';
import UserSidebar from '@/components/UserSidebar';
import VoiceAssistantModal from '@/components/VoiceAssistantModal';
import OpportunityTreeVisualizer from '@/components/OpportunityTreeVisualizer';
import SOSEmergencyModal from '@/components/SOSEmergencyModal';
import CreateOpportunityModal from '@/components/CreateOpportunityModal';
import CreateOrderWizardModal from '@/components/CreateOrderWizardModal';
import LocationSelectorModal, { LocationData } from '@/components/LocationSelectorModal';
import SavedAddressesModal from '@/components/SavedAddressesModal';
import ProviderOrderFeed from '@/components/ProviderOrderFeed';

import {
  User,
  Smartphone,
  Mail,
  MapPin,
  ShieldCheck,
  Star,
  LogOut,
  Zap,
  Layers,
  PlusCircle,
  RefreshCw,
  FileText,
  Check,
  Plus,
  Wrench,
  Briefcase,
  Clock,
  AlertTriangle,
  Send,
  ShieldAlert,
  Upload,
  Film,
  Image as ImageIcon,
  File,
  ChevronRight,
  Bell,
  Search,
  Truck,
  Package,
  MessageSquare,
  PhoneCall,
  CheckCircle2,
  HelpCircle,
  X,
} from 'lucide-react';

export default function UserDashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTab = searchParams ? searchParams.get('tab') : null;
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [userServices, setUserServices] = useState<UserServiceAsset[]>([]);
  const [addingService, setAddingService] = useState(false);
  const [selectedCatId, setSelectedCatId] = useState('');
  const [serviceTitle, setServiceTitle] = useState('');
  const [serviceDesc, setServiceDesc] = useState('');

  // Document Submission Modal State
  const [docModalAsset, setDocModalAsset] = useState<UserServiceAsset | null>(null);
  const [docFormValues, setDocFormValues] = useState<Record<string, any>>({});
  const [uploadingFields, setUploadingFields] = useState<Record<string, boolean>>({});
  const [aadhaarInput, setAadhaarInput] = useState('');
  const [submittingDocs, setSubmittingDocs] = useState(false);
  const [docError, setDocError] = useState('');

  // Real Dynamic Marketplace State
  const [addServiceModalOpen, setAddServiceModalOpen] = useState(false);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [sosModalOpen, setSosModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [orderWizardOpen, setOrderWizardOpen] = useState(false);
  const [savedAddressesModalOpen, setSavedAddressesModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'CUSTOMER' | 'PROVIDER'>('CUSTOMER');


  const [createModalType, setCreateModalType] = useState<'NEED' | 'OFFER'>('NEED');
  const [dbOpportunities, setDbOpportunities] = useState<Opportunity[]>([]);
  const [activeRootId, setActiveRootId] = useState<string>('');
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<LocationData>({
    addressText: 'Choutuppal, Telangana 508252',
    lat: 17.25,
    lng: 78.95,
  });

  useEffect(() => {
    if (user) {
      setCurrentLocation({
        addressText: user.address_text || 'Choutuppal, Telangana 508252',
        lat: user.lat || 17.25,
        lng: user.lng || 78.95,
      });
    }
  }, [user]);

  const loadDbOpps = async () => {
    try {
      const res = await getPublicOpportunities('', '', 1);
      if (res && res.data && res.data.length > 0) {
        setDbOpportunities(res.data);
        if (!activeRootId) {
          setActiveRootId(res.data[0].id);
        }
      }
    } catch {
      // Keep state
    }
  };

  useEffect(() => {
    loadDbOpps();
  }, []);

  const fetchUserData = async (phone: string, userId: string) => {
    try {
      const users = await listUsers();
      const fresh = users.find((u) => u.phone === phone || u.id === userId);
      if (fresh) {
        setUser(fresh);
        localStorage.setItem('uop_user', JSON.stringify(fresh));
      }
      const services = await getUserServices(phone || userId);
      setUserServices(services);
    } catch (e) {
      console.error('Failed to reload user data:', e);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('uop_user');
      if (stored) {
        try {
          const parsed: UserProfile = JSON.parse(stored);
          setUser(parsed);
          setAadhaarInput(parsed.aadhaar_number || '');
          if (parsed.phone || parsed.id) {
            fetchUserData(parsed.phone || '', parsed.id || '');
          }
        } catch (e) {
          console.error('Failed to parse user session:', e);
        }
      } else {
        router.replace('/login');
      }
    }

    getCategories().then(setCategories).catch(() => {});
    setLoading(false);
  }, [router]);

  const handleAddServiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedCatId) return;

    setAddingService(true);
    const cat = categories.find((c) => c.id === selectedCatId || c.slug === selectedCatId);
    const catName = cat ? cat.name : 'Custom Service';

    try {
      const newService = await addUserService({
        phone: user.phone,
        user_id: user.id,
        category_id: cat ? cat.id : undefined,
        asset_type: (cat ? cat.slug : 'SERVICE').toUpperCase().replace(/-/g, '_'),
        title: serviceTitle || catName,
        description: serviceDesc || `Provider request for ${catName}`,
      });

      if (newService && user.phone) {
        fetchUserData(user.phone, user.id);
      }
      setSelectedCatId('');
      setServiceTitle('');
      setServiceDesc('');
    } catch (err) {
      console.error('Failed to request service:', err);
    } finally {
      setAddingService(false);
    }
  };

  const openDocModal = (asset: UserServiceAsset) => {
    setDocModalAsset(asset);
    setDocFormValues(asset.documents || {});
    setDocError('');
  };

  const handleFileUpload = async (fieldKey: string, file: File, isMulti = false) => {
    setUploadingFields((prev) => ({ ...prev, [fieldKey]: true }));
    try {
      const res = await uploadFile(file);
      if (isMulti) {
        const existing = Array.isArray(docFormValues[fieldKey]) ? docFormValues[fieldKey] : [];
        setDocFormValues((prev) => ({ ...prev, [fieldKey]: [...existing, res.url] }));
      } else {
        setDocFormValues((prev) => ({ ...prev, [fieldKey]: res.url }));
      }
    } catch (err: any) {
      alert(`File upload failed: ${err.message || 'Error'}`);
    } finally {
      setUploadingFields((prev) => ({ ...prev, [fieldKey]: false }));
    }
  };

  const handleDocSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docModalAsset || !user) return;

    setSubmittingDocs(true);
    setDocError('');

    try {
      const updated = await submitServiceDocuments({
        asset_id: docModalAsset.id,
        user_id: user.id,
        phone: user.phone,
        documents: {
          ...docFormValues,
          aadhaar_number: aadhaarInput || user.aadhaar_number,
        },
      });

      if (updated && user.phone) {
        fetchUserData(user.phone, user.id);
      }
      setDocModalAsset(null);
    } catch (err: any) {
      setDocError(err.message || 'Failed to submit service documents.');
    } finally {
      setSubmittingDocs(false);
    }
  };

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('uop_user');
      localStorage.removeItem('uop_token');
      localStorage.removeItem('uop_phone');
    }
    router.push('/login');
  };

  const getServiceStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 w-fit">
            <Check className="w-3.5 h-3.5" />
            SERVICE ACTIVE
          </span>
        );
      case 'DOCUMENTS_PENDING':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 flex items-center gap-1.5 w-fit animate-pulse">
            <FileText className="w-3.5 h-3.5" />
            DOCUMENTS REQUIRED
          </span>
        );
      case 'UNDER_REVIEW':
      case 'VERIFICATION_PENDING':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30 flex items-center gap-1.5 w-fit">
            <Clock className="w-3.5 h-3.5" />
            VERIFICATION PENDING REVIEW
          </span>
        );
      case 'REJECTED':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center gap-1.5 w-fit">
            <AlertTriangle className="w-3.5 h-3.5" />
            REJECTED BY ADMIN
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1.5 w-fit">
            <Clock className="w-3.5 h-3.5" />
            PENDING ADMIN APPROVAL
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#090d16] text-white flex items-center justify-center p-6">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
          <span>Loading Dashboard...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#090d16] text-white flex items-center justify-center p-6">
        <div className="glass-panel p-8 rounded-3xl border border-slate-800 text-center space-y-4 max-w-md">
          <h2 className="text-xl font-bold text-white">No Active Session Found</h2>
          <p className="text-xs text-slate-400">Please log in to access your user account dashboard.</p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-all shadow-lg shadow-blue-600/30"
          >
            Go to User Login
          </Link>
        </div>
      </div>
    );
  }

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <UserSidebar>
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        
        {/* ========================================================================= */}
        {/* 1. ACCEPTED ORDERS TAB VIEW (currentTab === 'accepted' || currentTab === 'requests') */}
        {/* ========================================================================= */}
        {(currentTab === 'accepted' || currentTab === 'requests') && (
          <div className="space-y-6">
            <div className="glass-panel p-6 rounded-3xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-br from-emerald-950/40 via-slate-900 to-indigo-950/40">
              <div className="space-y-1">
                <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  PROVIDER ACCEPTED ORDERS
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white pt-1">Accepted Orders</h1>
                <p className="text-xs text-slate-400">Customer orders that you have accepted or are servicing as a provider.</p>
              </div>

              <button
                type="button"
                onClick={loadDbOpps}
                className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold text-xs flex items-center justify-center gap-2 transition-all shrink-0"
              >
                <RefreshCw className="w-4 h-4 text-emerald-400" />
                <span>Refresh Accepted Orders</span>
              </button>
            </div>

            <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 space-y-6">
              <ProviderOrderFeed />
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 2. MY ORDERS TAB VIEW (currentTab === 'orders')                           */}
        {/* ========================================================================= */}
        {currentTab === 'orders' && (
          <div className="space-y-6">
            {/* Header Card */}
            <div className="glass-panel p-6 rounded-3xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-br from-emerald-950/40 via-slate-900 to-teal-950/40">
              <div className="space-y-1">
                <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  REAL DATABASE CUSTOMER ORDERS
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white pt-1">My Orders</h1>
                <p className="text-xs text-slate-400">Track active requests and review past orders from PostgreSQL database.</p>
              </div>

              <button
                onClick={loadDbOpps}
                className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold text-xs flex items-center justify-center gap-2 transition-all shrink-0"
              >
                <RefreshCw className="w-4 h-4 text-emerald-400" />
                <span>Refresh Orders</span>
              </button>
            </div>

            {/* Orders Categorization & Listing Card */}
            <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 space-y-6">
              {(() => {
                const activeOrders = dbOpportunities.filter((o) =>
                  ['OPEN', 'ACCEPTED', 'IN_PROGRESS', 'DISPATCHED', 'ENROUTE', 'VEHICLE_PROBLEM', 'ARRIVED', 'ORDER_PLACED'].includes(o.status)
                );
                const pastOrders = dbOpportunities.filter((o) =>
                  ['COMPLETED', 'DELIVERED', 'REJECTED', 'DECLINED', 'CANCELLED'].includes(o.status)
                );

                return (
                  <div className="space-y-8">
                    {/* ACTIVE ORDERS SECTION */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                          <Package className="w-5 h-5 text-emerald-400" />
                          <span>Active Orders ({activeOrders.length})</span>
                        </h3>
                        <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                          Live In-Progress
                        </span>
                      </div>

                      {activeOrders.length === 0 ? (
                        <div className="p-8 rounded-2xl bg-slate-950/60 border border-slate-800 text-center space-y-2">
                          <Package className="w-8 h-8 text-slate-600 mx-auto" />
                          <p className="text-xs text-slate-400 font-medium">No active orders right now.</p>
                          <Link href="/opportunities" className="text-xs text-blue-400 hover:underline font-bold inline-block pt-1">
                            Browse Marketplace & Create Order →
                          </Link>
                        </div>
                      ) : (
                        <div className="grid md:grid-cols-2 gap-4">
                          {activeOrders.map((opp) => {
                            const meta = opp.metadata || {};
                            const cf = meta.custom_fields || {};
                            const rawQuantity = meta.quantity ?? cf.quantity ?? meta.quantity_bags ?? cf.quantity_bags ?? meta.cargo_weight_tons ?? 1;
                            const catName = opp.category?.name || meta.category_name || opp.title || 'General Service';
                            const formattedDate = opp.created_at
                              ? new Date(opp.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                              : 'Recent';

                            return (
                              <Link
                                key={opp.id}
                                href={`/opportunities/${opp.id}`}
                                className="p-5 rounded-2xl bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-emerald-500/50 space-y-4 shadow-xl transition-all group block"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono font-bold uppercase block w-fit mb-1">
                                      Order #UOP-{opp.id.slice(0, 8).toUpperCase()}
                                    </span>
                                    <h4 className="font-extrabold text-white text-base group-hover:text-emerald-400 transition-colors">
                                      {opp.title}
                                    </h4>
                                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                                      <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                      <span className="truncate">{opp.address_text || meta.delivery_location || 'Choutuppal, Telangana'}</span>
                                    </p>
                                  </div>

                                  <span className="px-3 py-1 rounded-full text-xs font-bold font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 shrink-0 uppercase">
                                    {opp.status}
                                  </span>
                                </div>

                                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs space-y-1.5 font-mono">
                                  <div className="flex justify-between">
                                    <span className="text-slate-500 font-bold uppercase text-[10px]">Service</span>
                                    <span className="text-slate-200 font-semibold">{catName}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-500 font-bold uppercase text-[10px]">Exact Quantity</span>
                                    <span className="text-emerald-400 font-extrabold">{rawQuantity} units</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-500 font-bold uppercase text-[10px]">Order Date</span>
                                    <span className="text-blue-300 font-semibold">{formattedDate}</span>
                                  </div>
                                  {opp.budget_max && (
                                    <div className="flex justify-between pt-1 border-t border-slate-800">
                                      <span className="text-slate-500 font-bold uppercase text-[10px]">Total Amount</span>
                                      <span className="text-emerald-400 font-extrabold">₹{Number(opp.budget_max).toLocaleString()}</span>
                                    </div>
                                  )}
                                </div>

                                <div className="pt-1 flex items-center justify-between text-xs text-slate-400">
                                  <span className="text-[11px]">Click to open order details</span>
                                  <span className="font-bold text-emerald-400 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                                    <span>Details</span>
                                    <ChevronRight className="w-4 h-4" />
                                  </span>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* PAST ORDERS SECTION */}
                    <div className="space-y-4 pt-4 border-t border-slate-800">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <h3 className="font-extrabold text-base text-slate-300 flex items-center gap-2">
                          <Clock className="w-5 h-5 text-slate-400" />
                          <span>Past & Closed Orders ({pastOrders.length})</span>
                        </h3>
                        <span className="text-xs font-mono text-slate-500 bg-slate-900 border border-slate-800 px-2.5 py-0.5 rounded-full">
                          History Log
                        </span>
                      </div>

                      {pastOrders.length === 0 ? (
                        <div className="p-6 rounded-2xl bg-slate-950/40 border border-slate-800/80 text-center">
                          <p className="text-xs text-slate-500 italic">No past or closed orders found.</p>
                        </div>
                      ) : (
                        <div className="grid md:grid-cols-2 gap-4">
                          {pastOrders.map((opp) => {
                            const meta = opp.metadata || {};
                            const cf = meta.custom_fields || {};
                            const rawQuantity = meta.quantity ?? cf.quantity ?? meta.quantity_bags ?? 1;
                            const catName = opp.category?.name || meta.category_name || opp.title;
                            const formattedDate = opp.created_at
                              ? new Date(opp.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                              : 'Past';

                            return (
                              <Link
                                key={opp.id}
                                href={`/opportunities/${opp.id}`}
                                className="p-5 rounded-2xl bg-slate-950/80 hover:bg-slate-900/90 border border-slate-800 hover:border-slate-700 space-y-4 shadow-md transition-all group block opacity-85 hover:opacity-100"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <span className="px-2.5 py-0.5 rounded-md bg-slate-900 text-slate-400 border border-slate-800 text-[10px] font-mono font-bold uppercase block w-fit mb-1">
                                      Order #UOP-{opp.id.slice(0, 8).toUpperCase()}
                                    </span>
                                    <h4 className="font-bold text-slate-200 text-sm group-hover:text-white transition-colors">
                                      {opp.title}
                                    </h4>
                                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                                      {opp.address_text || meta.delivery_location || 'Choutuppal, Telangana'}
                                    </p>
                                  </div>

                                  <span className={`px-3 py-1 rounded-full text-xs font-bold font-mono border uppercase shrink-0 ${
                                    opp.status === 'COMPLETED' || opp.status === 'DELIVERED'
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                  }`}>
                                    {opp.status}
                                  </span>
                                </div>

                                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs space-y-1 font-mono">
                                  <div className="flex justify-between">
                                    <span className="text-slate-500 uppercase text-[10px]">Service</span>
                                    <span className="text-slate-300 font-semibold">{catName}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-500 uppercase text-[10px]">Exact Quantity</span>
                                    <span className="text-slate-200 font-bold">{rawQuantity} units</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-500 uppercase text-[10px]">Date</span>
                                    <span className="text-slate-400">{formattedDate}</span>
                                  </div>
                                </div>

                                <div className="pt-1 flex items-center justify-between text-xs text-slate-500">
                                  <span>View order record</span>
                                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SERVICES I PROVIDE TAB VIEW (currentTab === 'services')                   */}
        {/* ========================================================================= */}
        {currentTab === 'services' && (
          <div className="space-y-6">
            <div className="glass-panel p-6 rounded-3xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-br from-indigo-950/40 via-slate-900 to-purple-950/40">
              <div className="space-y-1">
                <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase bg-purple-500/15 text-purple-400 border border-purple-500/30 flex items-center gap-1.5 w-fit">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  SERVICE PROVIDER VERIFICATION PORTAL
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white pt-1">Services I Provide</h1>
                <p className="text-xs text-slate-400">Select services/categories you want to provide, submit requests for admin approval, and upload required verification documents.</p>
              </div>

              <button
                type="button"
                onClick={() => setAddServiceModalOpen(true)}
                className="px-5 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 transition-all shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>+ Select Services to Provide</span>
              </button>
            </div>

            {userServices.length === 0 ? (
              <div className="glass-panel p-10 rounded-3xl border border-slate-800 space-y-4 text-center">
                <div className="w-16 h-16 rounded-3xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 mx-auto">
                  <Briefcase className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-white">No Registered Provider Services Yet</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Register the service categories you offer (e.g. Agriculture Farming, Home Repairs, Logistics Transport) to start receiving customer orders.
                </p>
                <button
                  type="button"
                  onClick={() => setAddServiceModalOpen(true)}
                  className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-600/25 transition-all inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Select Services I Want to Provide</span>
                </button>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {userServices.map((asset) => {
                  const cat = asset.category || categories.find((c) => c.id === asset.category_id);
                  const isDocsPending = asset.status === 'DOCUMENTS_PENDING';
                  const isPendingApproval = asset.status === 'PENDING_APPROVAL';
                  const isActive = asset.status === 'ACTIVE';
                  const isRejected = asset.status === 'REJECTED';

                  return (
                    <div key={asset.id} className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-4 shadow-xl flex flex-col justify-between">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="px-2.5 py-0.5 rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/30 text-[10px] font-mono font-bold uppercase block w-fit mb-1">
                              {cat?.name || asset.title}
                            </span>
                            <h4 className="font-extrabold text-white text-lg">{asset.title}</h4>
                            <p className="text-xs text-slate-400 mt-0.5">{asset.description || `Registered provider for ${cat?.name || 'Service'}`}</p>
                          </div>

                          {getServiceStatusBadge(asset.status)}
                        </div>

                        {isPendingApproval && (
                          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
                            <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold block">Awaiting Admin Approval</span>
                              <span className="text-[11px] text-amber-200/80">Admin is reviewing your request. Once approved, you will get the verification document form.</span>
                            </div>
                          </div>
                        )}

                        {isDocsPending && (
                          <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2">
                              <FileText className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-bold block text-indigo-200">Initial Approval Granted!</span>
                                <span className="text-[11px] text-indigo-300/80">Please upload required verification documents (licenses, photos, RC/PDF) to activate this service.</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {isActive && (
                          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold block">Service Verified & Active</span>
                              <span className="text-[11px] text-emerald-200/80">You are active to receive matching customer service requests for this category.</span>
                            </div>
                          </div>
                        )}

                        {isRejected && (
                          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold block">Request Rejected</span>
                              <span className="text-[11px] text-rose-200/80">{asset.rejection_reason || 'Rejection reason provided by platform administrator.'}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {isDocsPending && (
                        <button
                          type="button"
                          onClick={() => openDocModal(asset)}
                          className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-extrabold text-xs shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all mt-2"
                        >
                          <Upload className="w-4 h-4" />
                          <span>Upload Required Verification Documents →</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* SAVED ADDRESSES TAB VIEW (currentTab === 'addresses')                    */}
        {/* ========================================================================= */}
        {currentTab === 'addresses' && (
          <div className="space-y-6">
            <div className="glass-panel p-6 rounded-3xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-br from-rose-950/40 via-slate-900 to-amber-950/40">
              <div className="space-y-1">
                <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase bg-rose-500/15 text-rose-400 border border-rose-500/30">
                  FOOD-DELIVERY SAVED ADDRESSES
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white pt-1">Saved Addresses</h1>
                <p className="text-xs text-slate-400">Manage your saved delivery locations (Home, Work, Sites) for instant 1-click checkout.</p>
              </div>

              <button
                type="button"
                onClick={() => setSavedAddressesModalOpen(true)}
                className="px-5 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-extrabold text-xs shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2 transition-all shrink-0"
              >
                <PlusCircle className="w-4 h-4" />
                <span>+ Add / Manage Addresses</span>
              </button>
            </div>

            <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 space-y-6">
              <SavedAddressesModal
                isOpen={true}
                inline={true}
                onClose={() => {}}
                currentUser={user}
                onSelectAddress={(addr) => {
                  if (user) {
                    const updatedUser = { ...user, address_text: addr.addressText, lat: addr.lat, lng: addr.lng };
                    setUser(updatedUser);
                    setCurrentLocation({ addressText: addr.addressText, lat: addr.lat, lng: addr.lng });
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('uop_user', JSON.stringify(updatedUser));
                    }
                  }
                }}
              />
            </div>
          </div>

        )}

        {/* ========================================================================= */}
        {/* 3. NOTIFICATIONS TAB VIEW (currentTab === 'notifications')               */}
        {/* ========================================================================= */}

        {currentTab === 'notifications' && (
          <div className="space-y-6">
            <div className="glass-panel p-6 rounded-3xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-br from-indigo-950/40 via-slate-900 to-purple-950/40">
              <div className="space-y-1">
                <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase bg-purple-500/15 text-purple-400 border border-purple-500/30">
                  REAL-TIME SYSTEM NOTIFICATIONS
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white pt-1">Notifications Center</h1>
                <p className="text-xs text-slate-400">Instant status updates, order acceptances, and vehicle breakdown alerts.</p>
              </div>

              <button
                type="button"
                onClick={() => alert('All notifications marked as read.')}
                className="px-4 py-2.5 rounded-xl glass-panel text-slate-300 hover:text-white font-bold text-xs border border-slate-800 flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Mark All as Read</span>
              </button>
            </div>

            <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 space-y-4">
              {[
                {
                  id: 1,
                  icon: CheckCircle2,
                  color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
                  title: 'Provider Accepted Your Request!',
                  desc: 'Rajesh Logistics Services (+91 98765 43210) accepted your order #UOP-1024 for 100 Bricks.',
                  time: '10 mins ago',
                  unread: true,
                },
                {
                  id: 2,
                  icon: Truck,
                  color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
                  title: 'Order Status Updated to IN TRANSIT',
                  desc: 'Order #UOP-1008 is en route to Choutuppal delivery site.',
                  time: '45 mins ago',
                  unread: true,
                },
                {
                  id: 3,
                  icon: AlertTriangle,
                  color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
                  title: 'Delivery Delayed Due to Vehicle Issue',
                  desc: 'Order #UOP-1008 reported clutch breakdown on NH65. Emergency roadside mechanic dispatched.',
                  time: '2 hours ago',
                  unread: false,
                },
                {
                  id: 4,
                  icon: ShieldCheck,
                  color: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
                  title: 'Service Provider Document Approved',
                  desc: 'Admin approved your Tractor Logistics verification documents. Your service is now ACTIVE!',
                  time: 'Yesterday',
                  unread: false,
                },
              ].map((notif) => (
                <div
                  key={notif.id}
                  className={`p-4 rounded-2xl border flex items-start justify-between gap-4 transition-all ${
                    notif.unread ? 'bg-slate-900/90 border-purple-500/40 shadow-lg' : 'bg-slate-950 border-slate-800/80'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${notif.color}`}>
                      <notif.icon className="w-5 h-5" />
                    </div>

                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-white text-sm">{notif.title}</h4>
                        {notif.unread && (
                          <span className="w-2 h-2 rounded-full bg-purple-500 animate-ping" />
                        )}
                      </div>
                      <p className="text-xs text-slate-300">{notif.desc}</p>
                      <span className="text-[10px] text-slate-500 font-mono block pt-1">{notif.time}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 4. MESSAGES TAB VIEW (currentTab === 'messages')                         */}
        {/* ========================================================================= */}
        {currentTab === 'messages' && (
          <div className="space-y-6">
            <div className="glass-panel p-6 rounded-3xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-br from-blue-950/40 via-slate-900 to-indigo-950/40">
              <div className="space-y-1">
                <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase bg-blue-500/15 text-blue-400 border border-blue-500/30">
                  PROVIDER DIRECT CONTACT & CHAT
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white pt-1">Messages</h1>
                <p className="text-xs text-slate-400">Directly call or message service providers fulfilling your orders.</p>
              </div>
            </div>

            <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-800 space-y-4">
              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300 font-extrabold text-lg">
                    R
                  </div>
                  <div>
                    <h4 className="font-extrabold text-white text-base">Rajesh Logistics Services</h4>
                    <p className="text-xs text-slate-400">Choutuppal Building Supplies Co.</p>
                    <span className="text-xs text-emerald-400 font-mono font-bold mt-1 block">+91 98765 43210</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href="tel:+919876543210"
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/30 transition-all"
                  >
                    <PhoneCall className="w-4 h-4" />
                    <span>Call Provider</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => alert('Message sent to provider Rajesh Logistics.')}
                    className="px-4 py-2.5 rounded-xl bg-blue-600/20 text-blue-300 border border-blue-500/30 font-bold text-xs flex items-center gap-2"
                  >
                    <MessageSquare className="w-4 h-4 text-blue-400" />
                    <span>Send SMS</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 5. PROFILE TAB VIEW (currentTab === 'profile')                           */}
        {/* ========================================================================= */}
        {currentTab === 'profile' && (
          <div className="space-y-6">
            <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-4">
              <h2 className="text-2xl font-extrabold text-white">Account Profile & Credentials</h2>
              <div className="grid sm:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Full Name</span>
                  <div className="text-white font-extrabold text-base">{user.full_name}</div>
                </div>
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Mobile Phone</span>
                  <div className="text-emerald-400 font-mono font-extrabold text-base">{user.phone || '+91 919640754927'}</div>
                </div>
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 sm:col-span-2">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Operating Address</span>
                  <div className="text-slate-200 font-bold text-sm">{user.address_text || 'Choutuppal, Telangana, India'}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 6. HELP & SUPPORT TAB VIEW (currentTab === 'support')                    */}
        {/* ========================================================================= */}
        {currentTab === 'support' && (
          <div className="space-y-6">
            <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-4">
              <h2 className="text-2xl font-extrabold text-white flex items-center gap-2">
                <HelpCircle className="w-6 h-6 text-blue-400" />
                <span>Help & 24/7 Support Center</span>
              </h2>
              <p className="text-xs text-slate-400">Have questions about your order, delivery delay, or verification? We are available 24/7.</p>
              
              <div className="p-4 rounded-2xl bg-blue-950/40 border border-blue-800/60 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-white block">Toll-Free Platform Hotline</span>
                  <span className="text-blue-300 font-mono font-bold text-sm">+91 1800 123 4567</span>
                </div>
                <a href="tel:18001234567" className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs">Call Hotline</a>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 7. DEFAULT CONSUMER DASHBOARD VIEW (!currentTab || currentTab === 'dashboard') */}
        {/* ========================================================================= */}
        {(!currentTab || currentTab === 'dashboard') && (
          <>
            {/* Consumer App Top Area Header Bar */}
            <div className="glass-panel p-4 sm:p-5 rounded-3xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-gradient-to-r from-blue-950/30 via-slate-900 to-indigo-950/30">
              
              {/* Greeting & User Profile */}
              <div className="flex items-center gap-3.5">
                <div className="relative">
                  <img
                    src={user.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400'}
                    alt={user.full_name}
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl object-cover border-2 border-blue-500 shadow-md shadow-blue-500/20"
                  />
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-[#090d16] flex items-center justify-center" title="Verified Customer Session">
                    <Check className="w-3 h-3 text-slate-950 font-bold" />
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{getGreeting()} 👋</div>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">{user.full_name}</h2>
                  <span className="text-[11px] font-mono text-emerald-400 font-bold block">{user.phone || '+91 98765 43210'}</span>
                </div>
              </div>

              {/* Swiggy/Blinkit Location Selector Pill */}
              <button
                type="button"
                onClick={() => setSavedAddressesModalOpen(true)}
                className="w-full md:w-auto px-4 py-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-rose-500/50 transition-all flex items-center justify-between md:justify-start gap-3 group shadow-md"
              >
                <div className="flex items-center gap-2.5 overflow-hidden text-left">
                  <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div className="overflow-hidden">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 block">Deliver to</span>
                    <span className="text-xs font-bold text-white truncate block max-w-[200px] sm:max-w-[280px]">
                      {currentLocation.addressText}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-rose-400 group-hover:text-rose-300 font-bold underline shrink-0">Change</span>
              </button>


              {/* Top Bar Quick Action Icons */}
              <div className="flex items-center gap-2 self-end md:self-auto">
                <button
                  type="button"
                  onClick={() => setVoiceModalOpen(true)}
                  className="p-3 rounded-2xl bg-gradient-to-tr from-purple-600/20 to-indigo-600/20 border border-purple-500/30 hover:border-purple-500 text-purple-300 transition-all shadow-lg shadow-purple-600/20"
                  title="Voice AI Ordering"
                >
                  <Zap className="w-5 h-5 text-purple-400 animate-pulse" />
                </button>

                <Link
                  href="/dashboard?tab=notifications"
                  className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-colors relative"
                  title="Notifications"
                >
                  <Bell className="w-5 h-5" />
                  <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400 transition-colors"
                  title="Sign Out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Consumer App Hero Main Actions: "I Need Help" & "I Can Offer" */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Card A: I Need Help */}
              <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-blue-500/30 bg-gradient-to-br from-blue-950/40 via-slate-900 to-indigo-950/30 shadow-2xl space-y-4 hover:border-blue-500/60 transition-all group">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-extrabold text-xl shadow-lg shadow-blue-500/20">
                    🆘
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-blue-500/10 text-blue-300 border border-blue-500/30">
                    Consumer Order Flow
                  </span>
                </div>

                <div>
                  <h3 className="text-2xl font-extrabold text-white group-hover:text-blue-300 transition-colors">I Need Help</h3>
                  <p className="text-xs text-slate-300 leading-relaxed mt-1">
                    Order goods, material supplies, machinery, equipment, or labor services delivered directly to your location.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setOrderWizardOpen(true)}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-sm shadow-xl shadow-blue-600/30 flex items-center justify-center gap-2 transition-all group-hover:scale-[1.01]"
                >
                  <PlusCircle className="w-5 h-5" />
                  <span>Start 3-Step Request Wizard →</span>
                </button>
              </div>

              {/* Card B: I Can Offer */}
              <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 via-slate-900 to-teal-950/30 shadow-2xl space-y-4 hover:border-emerald-500/60 transition-all group">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-extrabold text-xl shadow-lg shadow-emerald-500/20">
                    🤝
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                    Provider Supply Flow
                  </span>
                </div>

                <div>
                  <h3 className="text-2xl font-extrabold text-white group-hover:text-emerald-300 transition-colors">I Can Offer</h3>
                  <p className="text-xs text-slate-300 leading-relaxed mt-1">
                    Register your vehicle fleet, spare inventory, labor skills, or equipment availability to fulfill customer orders.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCreateModalType('OFFER');
                    setCreateModalOpen(true);
                  }}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all group-hover:scale-[1.01]"
                >
                  <PlusCircle className="w-5 h-5" />
                  <span>Publish Offer / Listing →</span>
                </button>
              </div>
            </div>

            {/* Popular Categories Bar */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-400" />
                  <span>Popular Service Categories</span>
                </h4>
                <Link href="/opportunities" className="text-xs text-blue-400 hover:underline font-bold flex items-center gap-1">
                  <span>View All Categories</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                {categories.slice(0, 6).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setOrderWizardOpen(true);
                    }}
                    className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-blue-500/50 text-left space-y-1.5 transition-all group hover:scale-[1.02] shadow-md"
                  >
                    <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <Truck className="w-4 h-4" />
                    </div>
                    <div className="text-xs font-bold text-slate-200 group-hover:text-white truncate">{cat.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono uppercase">{cat.slug}</div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Dynamic Verification & Requirements Submission Modal */}
        {docModalAsset && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="glass-panel p-8 rounded-3xl border border-slate-800 w-full max-w-lg space-y-6 relative max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <FileText className="w-5 h-5 text-purple-400" />
                    <span>Service Provider Verification for {docModalAsset.title}</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Category: <strong className="text-purple-300">{docModalAsset.category?.name || docModalAsset.asset_type}</strong>
                  </p>
                </div>
                <button onClick={() => setDocModalAsset(null)} className="text-slate-400 hover:text-white font-bold text-lg">✕</button>
              </div>

              {docError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                  {docError}
                </div>
              )}

              <form onSubmit={handleDocSubmit} className="space-y-4">
                {/* Aadhaar Verification Step if required */}
                <div className="p-4 rounded-2xl bg-blue-950/40 border border-blue-800/60 space-y-2">
                  <label className="block text-xs font-bold text-blue-300 uppercase tracking-wider">
                    Service Provider Aadhaar Number *
                  </label>
                  <input
                    type="text"
                    value={aadhaarInput}
                    onChange={(e) => setAadhaarInput(e.target.value)}
                    placeholder="e.g. 1234-5678-9012"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm focus:outline-none focus:border-blue-500 font-mono"
                    required
                  />
                  <span className="text-[11px] text-slate-400 block">
                    Aadhaar identity verification is mandatory to activate service provider status on UOP.
                  </span>
                </div>

                {/* Dynamic Category Required Documents Fields */}
                {docModalAsset.category?.required_documents && docModalAsset.category.required_documents.length > 0 && (
                  <div className="space-y-4 pt-2 border-t border-slate-800">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400">
                      Category Verification Documents ({docModalAsset.category.name})
                    </h4>

                    {docModalAsset.category.required_documents.map((spec) => {
                      const value = docFormValues[spec.key];
                      const isUploading = uploadingFields[spec.key];

                      return (
                        <div key={spec.key} className="space-y-1.5 p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                          <label className="block text-xs font-bold text-slate-200 flex items-center justify-between">
                            <span>{spec.label} {spec.required && <span className="text-rose-400">*</span>}</span>
                            <span className="text-[10px] font-mono text-purple-400 uppercase">{spec.type}</span>
                          </label>

                          {spec.description && (
                            <p className="text-[11px] text-slate-400">{spec.description}</p>
                          )}

                          {spec.type === 'text' && (
                            <input
                              type="text"
                              value={value || ''}
                              onChange={(e) => setDocFormValues((prev) => ({ ...prev, [spec.key]: e.target.value }))}
                              placeholder={`Enter ${spec.label}`}
                              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-purple-500 font-mono"
                              required={spec.required}
                            />
                          )}

                          {spec.type === 'number' && (
                            <input
                              type="number"
                              value={value || ''}
                              onChange={(e) => setDocFormValues((prev) => ({ ...prev, [spec.key]: e.target.value }))}
                              placeholder={`Enter ${spec.label}`}
                              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-purple-500 font-mono"
                              required={spec.required}
                            />
                          )}

                          {spec.type === 'select' && (
                            <select
                              value={value || ''}
                              onChange={(e) => setDocFormValues((prev) => ({ ...prev, [spec.key]: e.target.value }))}
                              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-purple-500"
                              required={spec.required}
                            >
                              <option value="">-- Select {spec.label} --</option>
                              {(spec.options || []).map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          )}

                          {(spec.type === 'pdf' || spec.type === 'image' || spec.type === 'video') && (
                            <div className="space-y-2">
                              {value ? (
                                <div className="flex items-center justify-between p-2.5 rounded-xl bg-purple-950/40 border border-purple-800/60 text-xs">
                                  <span className="text-purple-300 truncate font-mono">{value}</span>
                                  <button
                                    type="button"
                                    onClick={() => setDocFormValues((prev) => ({ ...prev, [spec.key]: '' }))}
                                    className="text-rose-400 hover:underline text-[11px] font-bold shrink-0 ml-2"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-3">
                                  <input
                                    type="file"
                                    accept={spec.type === 'pdf' ? 'application/pdf' : spec.type === 'video' ? 'video/*' : 'image/*'}
                                    onChange={(e) => {
                                      if (e.target.files && e.target.files[0]) {
                                        handleFileUpload(spec.key, e.target.files[0], false);
                                      }
                                    }}
                                    className="text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-purple-600/20 file:text-purple-300 hover:file:bg-purple-600/30 cursor-pointer"
                                    required={spec.required && !value}
                                  />
                                  {isUploading && (
                                    <span className="text-xs text-purple-400 animate-pulse flex items-center gap-1">
                                      <RefreshCw className="w-3 h-3 animate-spin" /> Uploading...
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {spec.type === 'multi_image' && (
                            <div className="space-y-2">
                              {Array.isArray(value) && value.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {value.map((imgUrl: string, idx: number) => (
                                    <div key={idx} className="relative group w-14 h-14 rounded-xl border border-slate-800 overflow-hidden">
                                      <img src={imgUrl} alt="Document" className="w-full h-full object-cover" />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const filtered = value.filter((_: any, i: number) => i !== idx);
                                          setDocFormValues((prev) => ({ ...prev, [spec.key]: filtered }));
                                        }}
                                        className="absolute inset-0 bg-black/70 text-rose-400 font-bold text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="flex items-center gap-3">
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                      handleFileUpload(spec.key, e.target.files[0], true);
                                    }
                                  }}
                                  className="text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-purple-600/20 file:text-purple-300 hover:file:bg-purple-600/30 cursor-pointer"
                                />
                                {isUploading && (
                                  <span className="text-xs text-purple-400 animate-pulse flex items-center gap-1">
                                    <RefreshCw className="w-3 h-3 animate-spin" /> Uploading...
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setDocModalAsset(null)}
                    className="w-1/2 py-3 rounded-xl glass-panel text-slate-300 font-semibold text-xs border border-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingDocs}
                    className="w-1/2 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs transition-all shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2"
                  >
                    {submittingDocs ? 'Submitting...' : 'Submit Verification for Admin Review'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Select Services To Provide Modal */}
        {addServiceModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="relative w-full max-w-lg bg-[#0d1322] border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 my-8">
              <button
                type="button"
                onClick={() => setAddServiceModalOpen(false)}
                className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div>
                <div className="flex items-center gap-2 text-purple-400 mb-1 font-bold text-xs uppercase tracking-wider">
                  <Briefcase className="w-4 h-4" />
                  <span>Service Provider Registration</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-extrabold text-white">
                  Select Services You Want to Provide
                </h3>
                <p className="text-slate-400 text-xs mt-1">
                  Choose the categories you offer. Your selection will be submitted for Admin approval.
                </p>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {categories.map((cat) => {
                  const isChecked = selectedCategoryIds.includes(cat.id);
                  const isAlreadyRegistered = userServices.some((s) => s.category_id === cat.id);

                  return (
                    <label
                      key={cat.id}
                      className={`p-3.5 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                        isAlreadyRegistered
                          ? 'bg-slate-900/50 border-slate-800/60 opacity-60 cursor-not-allowed'
                          : isChecked
                          ? 'bg-purple-600/20 border-purple-500/60 shadow-lg'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{cat.icon || '🛠️'}</span>
                        <div>
                          <span className="font-bold text-white text-xs sm:text-sm block">{cat.name}</span>
                          <span className="text-[11px] text-slate-400">{cat.description || 'Service Category'}</span>
                        </div>
                      </div>

                      {isAlreadyRegistered ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-bold">
                          Already Registered
                        </span>
                      ) : (
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCategoryIds((prev) => [...prev, cat.id]);
                            } else {
                              setSelectedCategoryIds((prev) => prev.filter((id) => id !== cat.id));
                            }
                          }}
                          className="w-4 h-4 rounded text-purple-600 bg-slate-900 border-slate-700 focus:ring-purple-500"
                        />
                      )}
                    </label>
                  );
                })}
              </div>

              <div className="pt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => setAddServiceModalOpen(false)}
                  className="w-1/2 py-3 rounded-xl border border-slate-800 text-slate-300 font-bold text-xs hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={selectedCategoryIds.length === 0 || addingService}
                  onClick={async () => {
                    if (!user || selectedCategoryIds.length === 0) return;
                    setAddingService(true);
                    try {
                      for (const catId of selectedCategoryIds) {
                        const cat = categories.find((c) => c.id === catId);
                        await addUserService({
                          phone: user.phone,
                          user_id: user.id,
                          category_id: catId,
                          asset_type: (cat ? cat.slug : 'SERVICE').toUpperCase().replace(/-/g, '_'),
                          title: cat ? cat.name : 'Service Provider',
                          description: `Provider registration request for ${cat?.name}`,
                        });
                      }
                      if (user.phone || user.id) {
                        await fetchUserData(user.phone || '', user.id);
                      }
                      setSelectedCategoryIds([]);
                      setAddServiceModalOpen(false);
                    } catch (err: any) {
                      alert(`Error registering services: ${err.message || 'Error'}`);
                    } finally {
                      setAddingService(false);
                    }
                  }}
                  className="w-1/2 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {addingService ? 'Submitting Request...' : `Submit Request (${selectedCategoryIds.length})`}
                </button>
              </div>
            </div>
          </div>
        )}


        <CreateOpportunityModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          defaultType={createModalType}
          onCreated={(newOpp) => {
            setDbOpportunities((prev) => [newOpp, ...prev]);
            setActiveRootId(newOpp.id);
          }}
        />

        <CreateOrderWizardModal
          isOpen={orderWizardOpen}
          onClose={() => setOrderWizardOpen(false)}
          onCreated={(newOpp) => {
            setDbOpportunities((prev) => [newOpp, ...prev]);
            setActiveRootId(newOpp.id);
            router.push(`/order/${newOpp.id}`);
          }}
        />
        {/* Saved Addresses Modal */}
        <SavedAddressesModal
          isOpen={savedAddressesModalOpen}
          onClose={() => setSavedAddressesModalOpen(false)}
          currentUser={user}
          onSelectAddress={(addr) => {
            if (user) {
              const updatedUser = { ...user, address_text: addr.addressText, lat: addr.lat, lng: addr.lng };
              setUser(updatedUser);
              setCurrentLocation({ addressText: addr.addressText, lat: addr.lat, lng: addr.lng });
              if (typeof window !== 'undefined') {
                localStorage.setItem('uop_user', JSON.stringify(updatedUser));
              }
            }
            setSavedAddressesModalOpen(false);
          }}
        />

      </div>
    </UserSidebar>
  );
}

