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
  getCustomerOrders,
  Opportunity,
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  UserNotification,
  getStoredUser,
  saveUserSession,
  clearUserSession,
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
import VendorCatalogManager from '@/components/VendorCatalogManager';

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

function UserDashboardContent() {
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

  // Notifications State & Fetching
  const [notificationsList, setNotificationsList] = useState<UserNotification[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  const fetchUserNotificationsData = async (userIdent: string) => {
    if (!userIdent) return;
    setLoadingNotifications(true);
    try {
      const res = await getUserNotifications(userIdent);
      setNotificationsList(res.notifications || []);
    } catch {
      // keep state
    } finally {
      setLoadingNotifications(false);
    }
  };

  useEffect(() => {
    if (user && (user.phone || user.id)) {
      fetchUserNotificationsData(user.phone || user.id);
    }
  }, [user, currentTab]);

  const handleMarkAllRead = async () => {
    if (!user) return;
    const ok = await markAllNotificationsAsRead(user.phone || user.id);
    if (ok) {
      setNotificationsList((prev) => prev.map((n) => ({ ...n, is_read: true })));
    }
  };

  const handleMarkSingleRead = async (id: string) => {
    if (!user) return;
    const ok = await markNotificationAsRead(id, user.phone || user.id);
    if (ok) {
      setNotificationsList((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    }
  };

  const handleNotificationItemClick = (notif: UserNotification) => {
    if (!notif.is_read) {
      handleMarkSingleRead(notif.id);
    }
    const meta = notif.metadata || {};
    const targetOppId = meta.opportunity_id || meta.parent_id || meta.order_id;
    if (targetOppId) {
      router.push(`/opportunities/${targetOppId}`);
    }
  };

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
      if (user && (user.phone || user.id)) {
        const myOrders = await getCustomerOrders(user.phone || user.id);
        if (myOrders && myOrders.length > 0) {
          setDbOpportunities(myOrders);
          if (!activeRootId) {
            setActiveRootId(myOrders[0].id);
          }
          return;
        }
      }
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
  }, [user]);

  const fetchUserData = async (phone: string, userId: string) => {
    try {
      const users = await listUsers();
      const fresh = users.find((u) => u.phone === phone || u.id === userId);
      if (fresh) {
        setUser(fresh);
        saveUserSession(fresh);
      }
      const services = await getUserServices(phone || userId);
      setUserServices(services);
    } catch (e) {
      console.error('Failed to reload user data:', e);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedUser = getStoredUser();
      if (storedUser) {
        setUser(storedUser);
        setAadhaarInput(storedUser.aadhaar_number || '');
        if (storedUser.phone || storedUser.id) {
          fetchUserData(storedUser.phone || '', storedUser.id || '');
        }
      } else {
        router.push('/login');
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
    clearUserSession();
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
      <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6 font-sans">
        <div className="flex items-center gap-3 text-slate-600">
          <RefreshCw className="w-5 h-5 animate-spin text-slate-900" />
          <span className="font-semibold text-sm">Loading Dashboard...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6 font-sans">
        <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center space-y-4 max-w-md shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">No Active Session Found</h2>
          <p className="text-xs text-slate-500">Please log in to access your user account dashboard.</p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-sm transition-all shadow-sm"
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
        {(currentTab === 'accepted' || currentTab === 'matching' || currentTab === 'requests') && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
              <div className="space-y-1">
                <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase bg-slate-100 text-slate-800 border border-slate-200">
                  {currentTab === 'matching' ? 'INCOMING MATCHING REQUESTS' : (currentTab === 'requests' ? 'CUSTOMER REQUESTS FEED' : 'PROVIDER JOBS & ACCEPTED ORDERS')}
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 pt-1">
                  {currentTab === 'matching' ? 'Incoming Service Requests' : (currentTab === 'requests' ? 'Customer Requests Feed' : 'My Jobs / Accepted Orders')}
                </h1>
                <p className="text-xs text-slate-500">
                  {currentTab === 'matching'
                    ? 'Customer requests matching your approved skills and services. Accept requests to start servicing.'
                    : (currentTab === 'requests'
                      ? 'Browse customer service requests and direct service opportunities.'
                      : 'Customer orders and service jobs that you have accepted or are servicing as a provider.')}
                </p>
              </div>

              <button
                type="button"
                onClick={loadDbOpps}
                className="px-4 py-2.5 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shrink-0 shadow-sm"
              >
                <RefreshCw className="w-4 h-4 text-white" />
                <span>Refresh Jobs & Requests</span>
              </button>
            </div>

            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 space-y-6 shadow-sm">
              <ProviderOrderFeed
                isAcceptedView={currentTab === 'accepted'}
                initialSubTab={currentTab === 'matching' ? 'matching' : (currentTab === 'accepted' ? 'accepted' : 'matching')}
              />
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 2. MY ORDERS TAB VIEW (currentTab === 'orders')                           */}
        {/* ========================================================================= */}
        {currentTab === 'orders' && (
          <div className="space-y-6">
            {/* Header Card */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
              <div className="space-y-1">
                <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase bg-slate-100 text-slate-800 border border-slate-200">
                  REAL DATABASE CUSTOMER ORDERS
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 pt-1">My Orders</h1>
                <p className="text-xs text-slate-500">Track active requests and review past orders from PostgreSQL database.</p>
              </div>

              <button
                onClick={loadDbOpps}
                className="px-4 py-2.5 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shrink-0 shadow-sm"
              >
                <RefreshCw className="w-4 h-4 text-white" />
                <span>Refresh Orders</span>
              </button>
            </div>

            {/* Orders Categorization & Listing Card */}
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 space-y-6 shadow-sm">
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
                      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                        <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                          <Package className="w-5 h-5 text-slate-900" />
                          <span>Active Orders ({activeOrders.length})</span>
                        </h3>
                        <span className="text-xs font-mono text-slate-800 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
                          Live In-Progress
                        </span>
                      </div>

                      {activeOrders.length === 0 ? (
                        <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-2">
                          <Package className="w-8 h-8 text-slate-400 mx-auto" />
                          <p className="text-xs text-slate-500 font-medium">No active orders right now.</p>
                          <Link href="/opportunities" className="text-xs text-black hover:underline font-bold inline-block pt-1">
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
                                className="p-5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-900 space-y-4 shadow-sm transition-all group block"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200 text-[10px] font-mono font-bold uppercase block w-fit mb-1">
                                      Order #UOP-{opp.id.slice(0, 8).toUpperCase()}
                                    </span>
                                    <h4 className="font-extrabold text-slate-900 text-base group-hover:text-black transition-colors">
                                      {opp.title}
                                    </h4>
                                    <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                                      <MapPin className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                                      <span className="truncate">{opp.address_text || meta.delivery_location || 'Choutuppal, Telangana'}</span>
                                    </p>
                                  </div>

                                  <span className="px-3 py-1 rounded-full text-xs font-bold font-mono bg-black text-white shrink-0 uppercase">
                                    {opp.status}
                                  </span>
                                </div>

                                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5 font-mono">
                                  <div className="flex justify-between">
                                    <span className="text-slate-500 font-bold uppercase text-[10px]">Service</span>
                                    <span className="text-slate-900 font-semibold">{catName}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-500 font-bold uppercase text-[10px]">Exact Quantity</span>
                                    <span className="text-slate-900 font-extrabold">{rawQuantity} units</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-500 font-bold uppercase text-[10px]">Order Date</span>
                                    <span className="text-slate-700 font-semibold">{formattedDate}</span>
                                  </div>
                                  {opp.budget_max && (
                                    <div className="flex justify-between pt-1 border-t border-slate-200">
                                      <span className="text-slate-500 font-bold uppercase text-[10px]">Total Amount</span>
                                      <span className="text-slate-900 font-extrabold">₹{Number(opp.budget_max).toLocaleString()}</span>
                                    </div>
                                  )}
                                </div>

                                <div className="pt-1 flex items-center justify-between text-xs text-slate-500">
                                  <span className="text-[11px]">Click to open order details</span>
                                  <span className="font-bold text-slate-900 group-hover:translate-x-1 transition-transform flex items-center gap-1">
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
                    <div className="space-y-4 pt-4 border-t border-slate-200">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                        <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                          <Clock className="w-5 h-5 text-slate-600" />
                          <span>Past & Closed Orders ({pastOrders.length})</span>
                        </h3>
                        <span className="text-xs font-mono text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
                          History Log
                        </span>
                      </div>

                      {pastOrders.length === 0 ? (
                        <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center">
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
                                className="p-5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 space-y-4 shadow-sm transition-all group block"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-mono font-bold uppercase block w-fit mb-1">
                                      Order #UOP-{opp.id.slice(0, 8).toUpperCase()}
                                    </span>
                                    <h4 className="font-bold text-slate-900 text-sm group-hover:text-black transition-colors">
                                      {opp.title}
                                    </h4>
                                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                                      {opp.address_text || meta.delivery_location || 'Choutuppal, Telangana'}
                                    </p>
                                  </div>

                                  <span className={`px-3 py-1 rounded-full text-xs font-bold font-mono border uppercase shrink-0 ${
                                    opp.status === 'COMPLETED' || opp.status === 'DELIVERED'
                                      ? 'bg-slate-100 text-slate-900 border-slate-300'
                                      : 'bg-slate-100 text-slate-600 border-slate-200'
                                  }`}>
                                    {opp.status}
                                  </span>
                                </div>

                                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1 font-mono">
                                  <div className="flex justify-between">
                                    <span className="text-slate-500 uppercase text-[10px]">Service</span>
                                    <span className="text-slate-900 font-semibold">{catName}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-500 uppercase text-[10px]">Exact Quantity</span>
                                    <span className="text-slate-900 font-bold">{rawQuantity} units</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-500 uppercase text-[10px]">Date</span>
                                    <span className="text-slate-600">{formattedDate}</span>
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
        )}        {/* ========================================================================= */}
        {/* SERVICES I PROVIDE TAB VIEW (currentTab === 'services')                   */}
        {/* ========================================================================= */}
        {currentTab === 'services' && (
          <div className="space-y-8">
            <VendorCatalogManager currentUser={user} userAssets={userServices} />
          </div>
        )}


        {/* ========================================================================= */}
        {/* SAVED ADDRESSES TAB VIEW (currentTab === 'addresses')                    */}
        {/* ========================================================================= */}
        {currentTab === 'addresses' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
              <div className="space-y-1">
                <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase bg-slate-100 text-slate-800 border border-slate-200">
                  FOOD-DELIVERY SAVED ADDRESSES
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 pt-1">Saved Addresses</h1>
                <p className="text-xs text-slate-500">Manage your saved delivery locations (Home, Work, Sites) for instant 1-click checkout.</p>
              </div>

              <button
                type="button"
                onClick={() => setSavedAddressesModalOpen(true)}
                className="px-5 py-3 rounded-xl bg-black hover:bg-slate-800 text-white font-extrabold text-xs shadow-sm flex items-center justify-center gap-2 transition-all shrink-0"
              >
                <PlusCircle className="w-4 h-4" />
                <span>+ Add / Manage Addresses</span>
              </button>
            </div>

            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 space-y-6 shadow-sm">
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
            <div className="bg-white p-6 rounded-3xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
              <div className="space-y-1">
                <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase bg-slate-100 text-slate-800 border border-slate-200">
                  REAL-TIME SYSTEM NOTIFICATIONS
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 pt-1">Notifications Center</h1>
                <p className="text-xs text-slate-500">Instant status updates, order acceptances, document approvals, and alerts.</p>
              </div>

              <button
                type="button"
                onClick={handleMarkAllRead}
                className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-800 hover:bg-slate-200 font-bold text-xs border border-slate-200 flex items-center gap-2 transition-all active:scale-95"
              >
                <CheckCircle2 className="w-4 h-4 text-slate-900" />
                <span>Mark All as Read</span>
              </button>
            </div>

            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 space-y-4 shadow-sm">
              {loadingNotifications ? (
                <div className="text-center py-12 text-slate-500 text-sm animate-pulse flex items-center justify-center gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-slate-900" />
                  <span>Loading real-time notifications...</span>
                </div>
              ) : notificationsList.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <Bell className="w-10 h-10 text-slate-400 mx-auto" />
                  <p className="text-sm text-slate-900 font-semibold">No notifications yet</p>
                  <p className="text-xs text-slate-500">Important system updates and order alerts will appear here.</p>
                </div>
              ) : (
                notificationsList.map((notif) => {
                  let icon = CheckCircle2;
                  let colorClass = 'text-slate-900 bg-slate-100 border-slate-200';
                  if (notif.type?.includes('REJECTED') || notif.type?.includes('CANCELLED')) {
                    icon = AlertTriangle;
                    colorClass = 'text-slate-900 bg-slate-100 border-slate-200';
                  } else if (notif.type?.includes('IN_TRANSIT') || notif.type?.includes('DISPATCHED')) {
                    icon = Truck;
                    colorClass = 'text-slate-900 bg-slate-100 border-slate-200';
                  } else if (notif.type?.includes('SERVICE') || notif.type?.includes('APPROVED')) {
                    icon = ShieldCheck;
                    colorClass = 'text-slate-900 bg-slate-100 border-slate-200';
                  }

                  const IconComp = icon;
                  const dateStr = notif.created_at ? new Date(notif.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Just now';

                  return (
                    <div
                      key={notif.id}
                      onClick={() => handleNotificationItemClick(notif)}
                      className={`p-4 rounded-2xl border flex items-start justify-between gap-4 transition-all cursor-pointer ${
                        !notif.is_read ? 'bg-slate-50 border-slate-300 shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start gap-3.5">
                        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${colorClass}`}>
                          <IconComp className="w-5 h-5 text-slate-900" />
                        </div>

                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-slate-900 text-sm">{notif.title}</h4>
                            {!notif.is_read && (
                              <span className="w-2 h-2 rounded-full bg-black animate-ping" />
                            )}
                          </div>
                          <p className="text-xs text-slate-600">{notif.message}</p>
                          <span className="text-[10px] text-slate-500 font-mono block pt-1">{dateStr}</span>
                        </div>
                      </div>

                      {!notif.is_read && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkSingleRead(notif.id);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-black text-white hover:bg-slate-800 text-[11px] font-semibold shrink-0"
                        >
                          Mark Read
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 4. MESSAGES TAB VIEW (currentTab === 'messages')                         */}
        {/* ========================================================================= */}
        {currentTab === 'messages' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
              <div className="space-y-1">
                <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase bg-slate-100 text-slate-800 border border-slate-200">
                  PROVIDER DIRECT CONTACT & CHAT
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 pt-1">Messages</h1>
                <p className="text-xs text-slate-500">Directly call or message service providers fulfilling your orders.</p>
              </div>
            </div>

            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 space-y-4 shadow-sm">
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-black text-white flex items-center justify-center font-extrabold text-lg">
                    R
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-base">Rajesh Logistics Services</h4>
                    <p className="text-xs text-slate-500">Choutuppal Building Supplies Co.</p>
                    <span className="text-xs text-slate-900 font-mono font-bold mt-1 block">+91 98765 43210</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href="tel:+919876543210"
                    className="px-4 py-2.5 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all"
                  >
                    <PhoneCall className="w-4 h-4" />
                    <span>Call Provider</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => alert('Message sent to provider Rajesh Logistics.')}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-800 border border-slate-200 font-bold text-xs flex items-center gap-2 hover:bg-slate-200"
                  >
                    <MessageSquare className="w-4 h-4 text-slate-800" />
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
            <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-4 shadow-sm">
              <h2 className="text-2xl font-extrabold text-slate-900">Account Profile & Credentials</h2>
              <div className="grid sm:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Full Name</span>
                  <div className="text-slate-900 font-extrabold text-base">{user.full_name}</div>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Mobile Phone</span>
                  <div className="text-slate-900 font-mono font-extrabold text-base">{user.phone || '+91 919640754927'}</div>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 sm:col-span-2">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Operating Address</span>
                  <div className="text-slate-800 font-bold text-sm">{user.address_text || 'Choutuppal, Telangana, India'}</div>
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
            <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-4 shadow-sm">
              <h2 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
                <HelpCircle className="w-6 h-6 text-slate-900" />
                <span>Help & 24/7 Support Center</span>
              </h2>
              <p className="text-xs text-slate-500">Have questions about your order, delivery delay, or verification? We are available 24/7.</p>
              
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-900 block">Toll-Free Platform Hotline</span>
                  <span className="text-slate-800 font-mono font-bold text-sm">+91 1800 123 4567</span>
                </div>
                <a href="tel:18001234567" className="px-4 py-2 rounded-xl bg-black text-white font-bold text-xs hover:bg-slate-800">Call Hotline</a>
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
            <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
              
              {/* Greeting & User Profile */}
              <div className="flex items-center gap-3.5">
                <div className="relative">
                  <img
                    src={user.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400'}
                    alt={user.full_name}
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl object-cover border-2 border-slate-200 shadow-sm"
                  />
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-black border-2 border-white flex items-center justify-center" title="Verified Customer Session">
                    <Check className="w-3 h-3 text-white font-bold" />
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{getGreeting()} 👋</div>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">{user.full_name}</h2>
                  <span className="text-[11px] font-mono text-slate-600 font-bold block">{user.phone || '+91 98765 43210'}</span>
                </div>
              </div>

              {/* Swiggy/Blinkit Location Selector Pill */}
              <button
                type="button"
                onClick={() => setSavedAddressesModalOpen(true)}
                className="w-full md:w-auto px-4 py-2.5 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-all flex items-center justify-between md:justify-start gap-3 group shadow-sm"
              >
                <div className="flex items-center gap-2.5 overflow-hidden text-left">
                  <div className="w-8 h-8 rounded-xl bg-black text-white flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div className="overflow-hidden">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Deliver to</span>
                    <span className="text-xs font-bold text-slate-900 truncate block max-w-[200px] sm:max-w-[280px]">
                      {currentLocation.addressText}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-slate-900 group-hover:text-black font-bold underline shrink-0">Change</span>
              </button>


              {/* Top Bar Quick Action Icons */}
              <div className="flex items-center gap-2 self-end md:self-auto">
                <button
                  type="button"
                  onClick={() => setVoiceModalOpen(true)}
                  className="p-3 rounded-2xl bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-900 transition-all shadow-sm"
                  title="Voice AI Ordering"
                >
                  <Zap className="w-5 h-5 text-slate-900" />
                </button>

                <Link
                  href="/dashboard?tab=notifications"
                  className="p-3 rounded-2xl bg-slate-100 border border-slate-200 text-slate-700 hover:text-black hover:bg-slate-200 transition-colors relative"
                  title="Notifications"
                >
                  <Bell className="w-5 h-5" />
                  <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-black animate-ping" />
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="p-3 rounded-2xl bg-slate-100 border border-slate-200 text-slate-700 hover:text-black hover:bg-slate-200 transition-colors"
                  title="Sign Out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Consumer App Hero Main Actions: "I Need Help" & "I Can Offer" */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Card A: I Need Help */}
              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4 hover:border-black transition-all group">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-900 font-extrabold text-xl shadow-sm">
                    🆘
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200">
                    Consumer Order Flow
                  </span>
                </div>

                <div>
                  <h3 className="text-2xl font-extrabold text-slate-900 group-hover:text-black transition-colors">I Need Help</h3>
                  <p className="text-xs text-slate-600 leading-relaxed mt-1">
                    Order goods, material supplies, machinery, equipment, or labor services delivered directly to your location.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setOrderWizardOpen(true)}
                  className="w-full py-3.5 rounded-2xl bg-black hover:bg-slate-800 text-white font-extrabold text-sm shadow-sm flex items-center justify-center gap-2 transition-all group-hover:scale-[1.01]"
                >
                  <PlusCircle className="w-5 h-5" />
                  <span>Start 3-Step Request Wizard →</span>
                </button>
              </div>

              {/* Card B: Provider Supply Flow */}
              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4 hover:border-black transition-all group">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-900 font-extrabold text-xl shadow-sm">
                    🤝
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200">
                    Provider Supply Flow
                  </span>
                </div>

                <div>
                  <h3 className="text-2xl font-extrabold text-slate-900 group-hover:text-black transition-colors">Provider Supply Flow</h3>
                  <p className="text-xs text-slate-600 leading-relaxed mt-1">
                    Register your vehicle fleet, spare inventory, labor skills, or equipment availability to fulfill customer orders.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCreateModalType('OFFER');
                    setCreateModalOpen(true);
                  }}
                  className="w-full py-3.5 rounded-2xl bg-black hover:bg-slate-800 text-white font-extrabold text-sm shadow-sm flex items-center justify-center gap-2 transition-all group-hover:scale-[1.01]"
                >
                  <PlusCircle className="w-5 h-5" />
                  <span>Publish Offer / Listing →</span>
                </button>
              </div>
            </div>

            {/* Popular Categories Bar */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-slate-900" />
                  <span>Popular Service Categories</span>
                </h4>
                <Link href="/opportunities" className="text-xs text-slate-900 hover:underline font-bold flex items-center gap-1">
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
                    className="p-3.5 rounded-2xl bg-white border border-slate-200 hover:border-black text-left space-y-1.5 transition-all group hover:scale-[1.02] shadow-sm"
                  >
                    <div className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-900 group-hover:bg-black group-hover:text-white transition-colors">
                      <Truck className="w-4 h-4" />
                    </div>
                    <div className="text-xs font-bold text-slate-900 group-hover:text-black truncate">{cat.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono uppercase">{cat.slug}</div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Dynamic Verification & Requirements Submission Modal */}
        {docModalAsset && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-3xl border border-slate-200 w-full max-w-lg space-y-6 relative max-h-[90vh] overflow-y-auto shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-slate-900" />
                    <span>Service Provider Verification for {docModalAsset.title}</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Category: <strong className="text-slate-800">{docModalAsset.category?.name || docModalAsset.asset_type}</strong>
                  </p>
                </div>
                <button onClick={() => setDocModalAsset(null)} className="text-slate-500 hover:text-slate-900 font-bold text-lg">✕</button>
              </div>

              {docError && (
                <div className="p-3 rounded-xl bg-slate-100 border border-slate-300 text-slate-900 text-xs">
                  {docError}
                </div>
              )}

              <form onSubmit={handleDocSubmit} className="space-y-4">
                {/* Aadhaar Verification Step if required */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Service Provider Aadhaar Number *
                  </label>
                  <input
                    type="text"
                    value={aadhaarInput}
                    onChange={(e) => setAadhaarInput(e.target.value)}
                    placeholder="e.g. 1234-5678-9012"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-black font-mono"
                    required
                  />
                  <span className="text-[11px] text-slate-500 block">
                    Aadhaar identity verification is mandatory to activate service provider status on UOP.
                  </span>
                </div>

                {/* Dynamic Category Required Documents Fields */}
                {docModalAsset.category?.required_documents && docModalAsset.category.required_documents.length > 0 && (
                  <div className="space-y-4 pt-2 border-t border-slate-200">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                      Category Verification Documents ({docModalAsset.category.name})
                    </h4>

                    {docModalAsset.category.required_documents.map((spec) => {
                      const value = docFormValues[spec.key];
                      const isUploading = uploadingFields[spec.key];

                      return (
                        <div key={spec.key} className="space-y-1.5 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                          <label className="block text-xs font-bold text-slate-800 flex items-center justify-between">
                            <span>{spec.label} {spec.required && <span className="text-red-500">*</span>}</span>
                            <span className="text-[10px] font-mono text-slate-600 uppercase">{spec.type}</span>
                          </label>

                          {spec.description && (
                            <p className="text-[11px] text-slate-500">{spec.description}</p>
                          )}

                          {spec.type === 'text' && (
                            <input
                              type="text"
                              value={value || ''}
                              onChange={(e) => setDocFormValues((prev) => ({ ...prev, [spec.key]: e.target.value }))}
                              placeholder={`Enter ${spec.label}`}
                              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-black font-mono"
                              required={spec.required}
                            />
                          )}

                          {spec.type === 'number' && (
                            <input
                              type="number"
                              value={value || ''}
                              onChange={(e) => setDocFormValues((prev) => ({ ...prev, [spec.key]: e.target.value }))}
                              placeholder={`Enter ${spec.label}`}
                              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-black font-mono"
                              required={spec.required}
                            />
                          )}

                          {spec.type === 'select' && (
                            <select
                              value={value || ''}
                              onChange={(e) => setDocFormValues((prev) => ({ ...prev, [spec.key]: e.target.value }))}
                              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-black"
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
                                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100 border border-slate-300 text-xs">
                                  <span className="text-slate-800 truncate font-mono">{value}</span>
                                  <button
                                    type="button"
                                    onClick={() => setDocFormValues((prev) => ({ ...prev, [spec.key]: '' }))}
                                    className="text-red-600 hover:underline text-[11px] font-bold shrink-0 ml-2"
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
                                    className="text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-900 file:text-white hover:file:bg-slate-800 cursor-pointer"
                                    required={spec.required && !value}
                                  />
                                  {isUploading && (
                                    <span className="text-xs text-slate-900 animate-pulse flex items-center gap-1">
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
                                    <div key={idx} className="relative group w-14 h-14 rounded-xl border border-slate-300 overflow-hidden">
                                      <img src={imgUrl} alt="Document" className="w-full h-full object-cover" />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const filtered = value.filter((_: any, i: number) => i !== idx);
                                          setDocFormValues((prev) => ({ ...prev, [spec.key]: filtered }));
                                        }}
                                        className="absolute inset-0 bg-black/70 text-white font-bold text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
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
                                  className="text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-900 file:text-white hover:file:bg-slate-800 cursor-pointer"
                                />
                                {isUploading && (
                                  <span className="text-xs text-slate-900 animate-pulse flex items-center gap-1">
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
                    className="w-1/2 py-3 rounded-xl bg-white text-slate-800 font-semibold text-xs border border-slate-300 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingDocs}
                    className="w-1/2 py-3 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-2"
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="relative w-full max-w-lg bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-xl space-y-5 my-8">
              <button
                type="button"
                onClick={() => setAddServiceModalOpen(false)}
                className="absolute top-5 right-5 p-2 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div>
                <div className="flex items-center gap-2 text-slate-900 mb-1 font-bold text-xs uppercase tracking-wider">
                  <Briefcase className="w-4 h-4" />
                  <span>Service Provider Registration</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                  Select Services You Want to Provide
                </h3>
                <p className="text-slate-500 text-xs mt-1">
                  Choose the categories you offer. Your selection will be submitted for Admin approval.
                </p>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {categories.map((cat) => {
                  const isChecked = selectedCategoryIds.includes(cat.id);
                  const isAlreadyRegistered = userServices.some(
                    (s) =>
                      s.category_id === cat.id ||
                      s.category?.slug === cat.slug ||
                      s.asset_type?.toLowerCase() === cat.slug.toLowerCase() ||
                      s.asset_type?.toLowerCase() === cat.name.toLowerCase()
                  );

                  return (
                    <label
                      key={cat.id}
                      className={`p-3.5 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                        isAlreadyRegistered
                          ? 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed'
                          : isChecked
                          ? 'bg-slate-100 border-slate-900 shadow-sm'
                          : 'bg-white border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{cat.icon || '🛠️'}</span>
                        <div>
                          <span className="font-bold text-slate-900 text-xs sm:text-sm block">{cat.name}</span>
                          <span className="text-[11px] text-slate-500">{cat.description || 'Service Category'}</span>
                        </div>
                      </div>

                      {isAlreadyRegistered ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold">
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
                          className="w-4 h-4 rounded text-black bg-white border-slate-300 focus:ring-black"
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
                  className="w-1/2 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors"
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
                  className="w-1/2 py-3 rounded-xl bg-black hover:bg-slate-800 text-white font-extrabold text-xs shadow-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
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

export default function UserDashboardPage() {
  return (
    <React.Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-500">
        <RefreshCw className="w-8 h-8 animate-spin text-black" />
      </div>
    }>
      <UserDashboardContent />
    </React.Suspense>
  );
}


