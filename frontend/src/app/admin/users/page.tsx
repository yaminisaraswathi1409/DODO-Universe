'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminSidebar from '@/components/AdminSidebar';
import {
  listUsers,
  inviteUser,
  createCategory,
  deleteCategory,
  getCategories,
  updateUserStatus,
  listAllServiceRequests,
  adminApproveServiceRequest,
  adminReviewServiceDocuments,
  updateCategoryRequirements,
  updateCategoryOpportunityFields,
  getPublicOpportunities,
  Opportunity,
  UserProfile,
  Category,
  UserServiceAsset,
  RequiredDocumentSpec,
  OpportunityFieldSpec,
} from '@/lib/api';
import {
  UserPlus,
  ShieldCheck,
  Smartphone,
  CheckCircle,
  Clock,
  RefreshCw,
  ArrowLeft,
  Mail,
  User,
  Layers,
  Trash2,
  Plus,
  Briefcase,
  AlertTriangle,
  FileText,
  Check,
  X,
  Edit,
  Eye,
  File,
  Film,
  Image as ImageIcon,
  Search,
  ArrowUp,
  ArrowDown,
  ChevronUp,
  ChevronDown,
  MapPin,
  Package,
  ChevronRight,
} from 'lucide-react';

export default function AdminUserManagementPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams ? searchParams.get('tab') : null;

  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'service_approvals' | 'categories' | 'opportunities'>('dashboard');

  useEffect(() => {
    if (tabParam === 'dashboard') {
      setActiveTab('dashboard');
    } else if (tabParam === 'users') {
      setActiveTab('users');
    } else if (tabParam === 'categories' || tabParam === 'requirements') {
      setActiveTab('categories');
    } else if (tabParam === 'service_approvals' || tabParam === 'providers' || tabParam === 'verification') {
      setActiveTab('service_approvals');
    } else if (tabParam === 'opportunities' || tabParam === 'orders' || tabParam === 'workflows') {
      setActiveTab('opportunities');
    } else {
      setActiveTab('dashboard');
    }
  }, [tabParam]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [serviceRequests, setServiceRequests] = useState<UserServiceAsset[]>([]);
  const [adminOpportunities, setAdminOpportunities] = useState<Opportunity[]>([]);
  const [serviceStatusFilter, setServiceStatusFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);

  // Invite Form State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('USER');
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<any>(null);
  const [error, setError] = useState('');

  // Category State
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catIcon, setCatIcon] = useState('Wrench');
  const [creatingCat, setCreatingCat] = useState(false);

  // Verification Inspection Modal State
  const [inspectingAsset, setInspectingAsset] = useState<UserServiceAsset | null>(null);

  // Edit Category Requirements Schema Modal State
  const [editingReqCategory, setEditingReqCategory] = useState<Category | null>(null);
  const [reqSchemaJson, setReqSchemaJson] = useState('');
  const [savingReqs, setSavingReqs] = useState(false);

  // Visual Requirement Builder State
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldDesc, setNewFieldDesc] = useState('');
  const [newFieldType, setNewFieldType] = useState<RequiredDocumentSpec['type']>('text');
  const [newFieldRequired, setNewFieldRequired] = useState(true);
  const [newFieldOptions, setNewFieldOptions] = useState('');
  const [newFieldMaxSize, setNewFieldMaxSize] = useState('10');

  // Rejection Modal State
  const [rejectingAsset, setRejectingAsset] = useState<UserServiceAsset | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);

  const fetchAllAdminData = async () => {
    setLoading(true);
    try {
      const [uList, cList, sList, oppList] = await Promise.all([
        listUsers(),
        getCategories(),
        listAllServiceRequests(serviceStatusFilter),
        getPublicOpportunities(),
      ]);
      setUsers(uList);
      setCategories(cList);
      setServiceRequests(sList);
      setAdminOpportunities(oppList.data);
    } catch (e) {
      console.error('Failed to load admin data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllAdminData();
  }, [serviceStatusFilter]);

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !fullName) {
      setError('Full Name and Mobile Phone Number are required.');
      return;
    }

    setInviting(true);
    setError('');
    setInviteResult(null);

    try {
      const res = await inviteUser({ full_name: fullName, phone, email, role });
      setInviteResult(res);
      fetchAllAdminData();
      setFullName('');
      setPhone('');
      setEmail('');
    } catch (err: any) {
      setError(err.message || 'Failed to invite user');
    } finally {
      setInviting(false);
    }
  };

  const handleCreateCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName) return;

    setCreatingCat(true);
    try {
      await createCategory({ name: catName, description: catDesc, icon: catIcon });
      setCatName('');
      setCatDesc('');
      setShowCategoryModal(false);
      fetchAllAdminData();
    } catch (err) {
      console.error('Failed to create category:', err);
    } finally {
      setCreatingCat(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;
    await deleteCategory(id);
    fetchAllAdminData();
  };

  const handleApproveInitialRequest = async (assetId: string) => {
    try {
      await adminApproveServiceRequest(assetId);
      setInspectingAsset(null);
      fetchAllAdminData();
    } catch (err) {
      console.error('Failed to approve request:', err);
    }
  };

  const handleApproveDocuments = async (assetId: string) => {
    try {
      await adminReviewServiceDocuments(assetId, true);
      setInspectingAsset(null);
      fetchAllAdminData();
    } catch (err) {
      console.error('Failed to approve documents:', err);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingAsset || !rejectionReasonInput) return;

    setSubmittingReject(true);
    try {
      await adminReviewServiceDocuments(rejectingAsset.id, false, rejectionReasonInput);
      setRejectingAsset(null);
      setInspectingAsset(null);
      setRejectionReasonInput('');
      fetchAllAdminData();
    } catch (err) {
      console.error('Failed to reject service request:', err);
    } finally {
      setSubmittingReject(false);
    }
  };

  const openEditReqModal = (cat: Category) => {
    setEditingReqCategory(cat);
    const defaultSchema = cat.required_documents && cat.required_documents.length > 0
      ? cat.required_documents
      : [
          { key: 'registration_number', label: 'Registration / Serial Number', type: 'text', required: true },
          { key: 'document_photo_url', label: 'Document / License Photo URL', type: 'image', required: true },
        ];
    setReqSchemaJson(JSON.stringify(defaultSchema, null, 2));
  };

  const handleAddFieldToSchema = () => {
    if (!newFieldKey || !newFieldLabel) return;
    try {
      const currentList: RequiredDocumentSpec[] = reqSchemaJson ? JSON.parse(reqSchemaJson) : [];
      const newField: RequiredDocumentSpec = {
        key: newFieldKey.toLowerCase().replace(/\s+/g, '_'),
        label: newFieldLabel,
        description: newFieldDesc,
        type: newFieldType,
        required: newFieldRequired,
        options: newFieldOptions ? newFieldOptions.split(',').map((s) => s.trim()) : undefined,
        max_file_size_mb: newFieldMaxSize ? parseInt(newFieldMaxSize, 10) : 10,
      };
      const updated = [...currentList, newField];
      setReqSchemaJson(JSON.stringify(updated, null, 2));
      setNewFieldKey('');
      setNewFieldLabel('');
      setNewFieldDesc('');
      setNewFieldOptions('');
    } catch (e) {
      alert('Invalid JSON structure in editor');
    }
  };

  const handleSaveReqSchema = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReqCategory) return;

    setSavingReqs(true);
    try {
      const parsed: RequiredDocumentSpec[] = JSON.parse(reqSchemaJson);
      await updateCategoryRequirements(editingReqCategory.id, parsed);
      setEditingReqCategory(null);
      fetchAllAdminData();
    } catch (err: any) {
      alert(`Invalid JSON format: ${err.message}`);
    } finally {
      setSavingReqs(false);
    }
  };

  // Opportunity Posting Custom Fields Builder State
  const [editingOppFieldsCategory, setEditingOppFieldsCategory] = useState<Category | null>(null);
  const [oppFieldsJson, setOppFieldsJson] = useState('');
  const [savingOppFields, setSavingOppFields] = useState(false);

  const [newOppKey, setNewOppKey] = useState('');
  const [newOppLabel, setNewOppLabel] = useState('');
  const [newOppType, setNewOppType] = useState<OpportunityFieldSpec['type']>('text');
  const [newOppReq, setNewOppReq] = useState(true);
  const [newOppOptions, setNewOppOptions] = useState('');

  const openEditOppFieldsModal = (cat: Category) => {
    setEditingOppFieldsCategory(cat);
    const defaultFields = cat.opportunity_fields && cat.opportunity_fields.length > 0
      ? cat.opportunity_fields
      : [
          { key: 'quantity', label: 'Quantity / Count', type: 'number', required: true, placeholder: 'e.g. 10000' },
          { key: 'pickup_location', label: 'Pickup Yard / Address', type: 'location', required: true, placeholder: 'e.g. Yard Location' },
        ];
    setOppFieldsJson(JSON.stringify(defaultFields, null, 2));
  };

  const handleAddOppFieldToSchema = () => {
    if (!newOppKey || !newOppLabel) return;
    try {
      const currentList: OpportunityFieldSpec[] = oppFieldsJson ? JSON.parse(oppFieldsJson) : [];
      const newField: OpportunityFieldSpec = {
        key: newOppKey.toLowerCase().replace(/\s+/g, '_'),
        label: newOppLabel,
        type: newOppType,
        required: newOppReq,
        options: newOppOptions ? newOppOptions.split(',').map((s) => s.trim()) : undefined,
      };
      const updated = [...currentList, newField];
      setOppFieldsJson(JSON.stringify(updated, null, 2));
      setNewOppKey('');
      setNewOppLabel('');
      setNewOppOptions('');
    } catch (e) {
      alert('Invalid JSON structure in editor');
    }
  };

  // Side-Panel Category Governance State
  const [selectedAdminCatId, setSelectedAdminCatId] = useState<string>('');
  const [catSearchTerm, setCatSearchTerm] = useState('');
  const [catSubTab, setCatSubTab] = useState<'PROVIDER_VERIFICATION' | 'NEED_OFFER_FIELDS'>('PROVIDER_VERIFICATION');

  useEffect(() => {
    if (categories.length > 0 && !selectedAdminCatId) {
      setSelectedAdminCatId(categories[0].id);
    }
  }, [categories, selectedAdminCatId]);

  const handleMoveReqField = async (cat: Category, fromIdx: number, toIdx: number) => {
    const list = [...(cat.required_documents || [])];
    if (toIdx < 0 || toIdx >= list.length) return;
    const [item] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, item);
    try {
      await updateCategoryRequirements(cat.id, list);
      fetchAllAdminData();
    } catch (err: any) {
      alert(`Reorder failed: ${err.message}`);
    }
  };

  const handleDeleteReqField = async (cat: Category, idx: number) => {
    if (!confirm('Delete this verification requirement field?')) return;
    const list = [...(cat.required_documents || [])];
    list.splice(idx, 1);
    try {
      await updateCategoryRequirements(cat.id, list);
      fetchAllAdminData();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleMoveOppField = async (cat: Category, fromIdx: number, toIdx: number) => {
    const list = [...(cat.opportunity_fields || [])];
    if (toIdx < 0 || toIdx >= list.length) return;
    const [item] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, item);
    try {
      await updateCategoryOpportunityFields(cat.id, list);
      fetchAllAdminData();
    } catch (err: any) {
      alert(`Reorder failed: ${err.message}`);
    }
  };

  const handleDeleteOppField = async (cat: Category, idx: number) => {
    if (!confirm('Delete this opportunity form field?')) return;
    const list = [...(cat.opportunity_fields || [])];
    list.splice(idx, 1);
    try {
      await updateCategoryOpportunityFields(cat.id, list);
      fetchAllAdminData();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleAddReqFieldDirect = async (cat: Category) => {
    if (!newFieldLabel.trim()) return;
    const key = newFieldKey ? newFieldKey.toLowerCase().replace(/\s+/g, '_') : newFieldLabel.toLowerCase().replace(/\s+/g, '_');
    const newField: RequiredDocumentSpec = {
      key,
      label: newFieldLabel.trim(),
      description: newFieldDesc.trim() || undefined,
      type: newFieldType,
      required: newFieldRequired,
      options: newFieldOptions ? newFieldOptions.split(',').map((s) => s.trim()) : undefined,
      max_file_size_mb: newFieldMaxSize ? parseInt(newFieldMaxSize, 10) : 10,
    };
    const list = [...(cat.required_documents || []), newField];
    try {
      await updateCategoryRequirements(cat.id, list);
      setNewFieldKey('');
      setNewFieldLabel('');
      setNewFieldDesc('');
      setNewFieldOptions('');
      fetchAllAdminData();
    } catch (err: any) {
      alert(`Add field failed: ${err.message}`);
    }
  };

  const handleAddOppFieldDirect = async (cat: Category) => {
    if (!newOppLabel.trim()) return;
    const key = newOppKey ? newOppKey.toLowerCase().replace(/\s+/g, '_') : newOppLabel.toLowerCase().replace(/\s+/g, '_');
    const newField: OpportunityFieldSpec = {
      key,
      label: newOppLabel.trim(),
      type: newOppType,
      required: newOppReq,
      options: newOppOptions ? newOppOptions.split(',').map((s) => s.trim()) : undefined,
    };
    const list = [...(cat.opportunity_fields || []), newField];
    try {
      await updateCategoryOpportunityFields(cat.id, list);
      setNewOppKey('');
      setNewOppLabel('');
      setNewOppOptions('');
      fetchAllAdminData();
    } catch (err: any) {
      alert(`Add field failed: ${err.message}`);
    }
  };

  const handleSaveOppFieldsSchema = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOppFieldsCategory) return;

    setSavingOppFields(true);
    try {
      const parsed: OpportunityFieldSpec[] = JSON.parse(oppFieldsJson);
      await updateCategoryOpportunityFields(editingOppFieldsCategory.id, parsed);
      setEditingOppFieldsCategory(null);
      fetchAllAdminData();
    } catch (err: any) {
      alert(`Invalid JSON format: ${err.message}`);
    } finally {
      setSavingOppFields(false);
    }
  };

  const handleUpdateStatus = async (userId: string, newStatus: string) => {
    try {
      await updateUserStatus(userId, newStatus);
      fetchAllAdminData();
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const getServiceStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 w-fit">
            <CheckCircle className="w-3.5 h-3.5" />
            ACTIVE & VERIFIED
          </span>
        );
      case 'DOCUMENTS_PENDING':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 flex items-center gap-1.5 w-fit">
            <FileText className="w-3.5 h-3.5" />
            DOCS PENDING
          </span>
        );
      case 'UNDER_REVIEW':
      case 'VERIFICATION_PENDING':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30 flex items-center gap-1.5 w-fit animate-pulse">
            <Clock className="w-3.5 h-3.5" />
            VERIFICATION PENDING
          </span>
        );
      case 'REJECTED':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center gap-1.5 w-fit">
            <AlertTriangle className="w-3.5 h-3.5" />
            REJECTED
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1.5 w-fit">
            <Clock className="w-3.5 h-3.5" />
            PENDING APPROVAL
          </span>
        );
    }
  };

  return (
    <AdminSidebar>
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <Link href="/" className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white mb-2 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Home</span>
            </Link>
            <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
              <span>Admin Governance & Service Approval Console</span>
              <span className="px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30 text-xs font-semibold">
                Dynamic Verification Engine
              </span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Admin Login: <strong className="text-purple-300 font-mono">+919999999999</strong> | Dev OTP: <strong className="text-emerald-300 font-mono">123456</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={fetchAllAdminData}
              className="px-4 py-2.5 rounded-xl glass-panel text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-2 border border-slate-800"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              onClick={() => setShowInviteModal(true)}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>Invite / Create User</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation Controls */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 pb-3">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
              activeTab === 'dashboard'
                ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/30'
                : 'glass-panel text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-blue-400" />
            <span>Admin Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab('service_approvals')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
              activeTab === 'service_approvals'
                ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-600/30'
                : 'glass-panel text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            <span>Service Provider Requests ({serviceRequests.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('users')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
              activeTab === 'users'
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30'
                : 'glass-panel text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Users Directory ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('categories')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
              activeTab === 'categories'
                ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-600/30'
                : 'glass-panel text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Category & Requirements ({categories.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('opportunities')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
              activeTab === 'opportunities'
                ? 'bg-amber-600 border-amber-500 text-white shadow-lg shadow-amber-600/30'
                : 'glass-panel text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            <Package className="w-4 h-4 text-amber-400" />
            <span>Orders & Workflows ({adminOpportunities.length})</span>
          </button>
        </div>

        {/* TAB 0: ADMIN DASHBOARD (7 METRIC CARDS, PENDING ACTIONS, DELAYED ORDERS) */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {/* 7 Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
                <span className="text-[10px] font-extrabold text-blue-400 uppercase tracking-wider block">Active Orders</span>
                <span className="text-xl font-extrabold text-white">14</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
                <span className="text-[10px] font-extrabold text-amber-400 uppercase tracking-wider block">Pending Approvals</span>
                <span className="text-xl font-extrabold text-white">3</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
                <span className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-wider block">In Transit</span>
                <span className="text-xl font-extrabold text-white">6</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
                <span className="text-[10px] font-extrabold text-rose-400 uppercase tracking-wider block">Delayed Orders</span>
                <span className="text-xl font-extrabold text-rose-300">2</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
                <span className="text-[10px] font-extrabold text-teal-400 uppercase tracking-wider block">Completed Orders</span>
                <span className="text-xl font-extrabold text-white">48</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
                <span className="text-[10px] font-extrabold text-purple-400 uppercase tracking-wider block">Registered Users</span>
                <span className="text-xl font-extrabold text-white">{users.length}</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
                <span className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-wider block">Service Providers</span>
                <span className="text-xl font-extrabold text-white">{serviceRequests.length}</span>
              </div>
            </div>

            {/* PENDING ACTIONS SECTION */}
            <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-400" />
                  <span>PENDING ACTIONS</span>
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-bold">
                  3 Actions Required
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">Provider Acceptance Pending</span>
                    <h4 className="font-bold text-white text-sm">Order #UOP-1024 (100 Bricks Transport)</h4>
                    <p className="text-slate-400 text-[11px]">Matched with 3 nearby providers • Awaiting provider response</p>
                  </div>
                  <Link
                    href="/order/9001"
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all shrink-0"
                  >
                    View
                  </Link>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block">Service Provider Document Verification</span>
                    <h4 className="font-bold text-white text-sm">Suresh Transport (Tata 12-Wheeler Fleet)</h4>
                    <p className="text-slate-400 text-[11px]">Commercial Driving License & Vehicle Insurance uploaded</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('service_approvals')}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md transition-all shrink-0"
                  >
                    Inspect
                  </button>
                </div>
              </div>
            </div>

            {/* DELAYED ORDERS SECTION */}
            <div className="glass-panel p-6 rounded-3xl border border-rose-500/30 bg-rose-950/10 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-rose-900/40 pb-3">
                <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-400 animate-pulse" />
                  <span>DELAYED ORDERS</span>
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 text-xs font-bold">
                  2 Incidents Logged
                </span>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs font-extrabold text-white block">Order #UOP-1008</span>
                      <span className="text-[11px] text-rose-400 font-semibold mt-0.5 block">Reason: Vehicle issue (Clutch failure)</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono text-[10px] font-bold">
                      SOS ACTIVE
                    </span>
                  </div>

                  <div className="text-slate-400 text-[11px] flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span>Current location: Hyderabad (NH65 Shoulder)</span>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Link
                      href="/order/9002"
                      className="px-4 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-rose-500 text-rose-300 font-bold text-xs transition-all"
                    >
                      View
                    </Link>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs font-extrabold text-white block">Order #UOP-1014</span>
                      <span className="text-[11px] text-amber-400 font-semibold mt-0.5 block">Reason: Traffic bottleneck delay</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold">
                      DELAYED
                    </span>
                  </div>

                  <div className="text-slate-400 text-[11px] flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Current location: Choutuppal Toll Plaza</span>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Link
                      href="/order/9001"
                      className="px-4 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-amber-500 text-amber-300 font-bold text-xs transition-all"
                    >
                      View
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: SERVICE PROVIDER APPROVAL WORKFLOW */}
        {activeTab === 'service_approvals' && (
          <div className="space-y-6">
            {/* Status Filter Bar */}
            <div className="flex items-center justify-between gap-4 glass-panel p-4 rounded-2xl border border-slate-800">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Filter Service Requests:</span>
              <div className="flex flex-wrap gap-2">
                {['ALL', 'PENDING_APPROVAL', 'UNDER_REVIEW', 'DOCUMENTS_PENDING', 'ACTIVE', 'REJECTED'].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setServiceStatusFilter(filter)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      serviceStatusFilter === filter
                        ? 'bg-purple-600 border-purple-500 text-white'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            {/* Service Requests Directory Table */}
            <div className="glass-panel rounded-3xl border border-slate-800 overflow-hidden">
              <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                <h3 className="font-bold text-lg text-white">Service Provider Approval Requests ({serviceRequests.length})</h3>
                <span className="text-xs text-purple-300 font-mono">Dynamic Database-Driven Verification Engine</span>
              </div>

              {loading ? (
                <div className="p-12 text-center text-slate-400 text-sm">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-400" />
                  <span>Loading service requests...</span>
                </div>
              ) : serviceRequests.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-sm">
                  No service provider requests found matching status filter &quot;{serviceStatusFilter}&quot;.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-900/80 text-xs uppercase font-semibold text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="px-6 py-4">User & Phone</th>
                        <th className="px-6 py-4">Requested Service & Category</th>
                        <th className="px-6 py-4">Service Status</th>
                        <th className="px-6 py-4">Verification Details & Uploads</th>
                        <th className="px-6 py-4">Admin Governance Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {serviceRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-slate-900/40 transition-colors">
                          <td className="px-6 py-4">
                            <div>
                              <div className="font-bold text-white text-sm">{req.user?.full_name || 'Platform User'}</div>
                              <div className="text-xs text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                                <Smartphone className="w-3.5 h-3.5 text-blue-400" />
                                <span>{req.user?.phone || 'N/A'}</span>
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                Account: <span className="text-emerald-400 font-bold">{req.user?.status || 'ACTIVE'}</span>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <div>
                              <div className="font-bold text-white">{req.title}</div>
                              <div className="text-xs text-purple-300 font-mono mt-0.5">
                                Category: {req.category?.name || req.asset_type}
                              </div>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-1">{req.description}</p>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            {getServiceStatusBadge(req.status)}
                          </td>

                          <td className="px-6 py-4 text-xs">
                            <button
                              onClick={() => setInspectingAsset(req)}
                              className="px-3.5 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 font-bold text-xs flex items-center gap-1.5 mb-1.5"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Inspect Submitted Files & Checklist</span>
                            </button>

                            {req.documents && Object.keys(req.documents).length > 0 ? (
                              <div className="text-[11px] font-mono text-slate-400">
                                {Object.keys(req.documents).length} Verification Item(s) Submitted
                              </div>
                            ) : (
                              <span className="text-slate-500 italic">No verification submitted yet</span>
                            )}
                            {req.rejection_reason && (
                              <div className="mt-1 text-rose-400 text-[11px] font-mono">
                                Rejection: {req.rejection_reason}
                              </div>
                            )}
                          </td>

                          <td className="px-6 py-4 text-xs space-y-2">
                            {req.status === 'PENDING_APPROVAL' && (
                              <button
                                onClick={() => handleApproveInitialRequest(req.id)}
                                className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all shadow-lg shadow-purple-600/30 flex items-center gap-1.5"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Approve Initial Request</span>
                              </button>
                            )}

                            {(req.status === 'UNDER_REVIEW' || req.status === 'VERIFICATION_PENDING') && (
                              <div className="flex flex-col gap-2">
                                <button
                                  onClick={() => handleApproveDocuments(req.id)}
                                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all flex items-center justify-center gap-1.5"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Approve Verification & Activate Service</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setRejectingAsset(req);
                                    setRejectionReasonInput('');
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-bold text-xs flex items-center justify-center gap-1.5"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>Reject Request / Verification</span>
                                </button>
                              </div>
                            )}

                            {(req.status === 'ACTIVE' || req.status === 'DOCUMENTS_PENDING') && (
                              <button
                                onClick={() => {
                                  setRejectingAsset(req);
                                  setRejectionReasonInput('');
                                }}
                                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-700 text-xs font-medium"
                              >
                                Reject / Suspend Service
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: USER DIRECTORY */}
        {activeTab === 'users' && (
          <div className="glass-panel rounded-3xl border border-slate-800 overflow-hidden">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-lg text-white">Registered Users Directory ({users.length})</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-900/80 text-xs uppercase font-semibold text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-4">User</th>
                    <th className="px-6 py-4">Mobile & Email</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Account Status</th>
                    <th className="px-6 py-4">Aadhaar</th>
                    <th className="px-6 py-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {users.map((u: any) => (
                    <tr key={u.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center font-bold text-blue-400 shrink-0">
                            {u.avatar_url ? (
                              <img src={u.avatar_url} alt={u.full_name} className="w-10 h-10 rounded-full object-cover" />
                            ) : (
                              u.full_name[0]
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-white flex items-center gap-2">
                              <span>{u.full_name}</span>
                              {u.role === 'ADMIN' && (
                                <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold">ADMIN</span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 font-mono">ID: {u.id.substring(0, 8)}...</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-slate-200 text-xs font-semibold">
                            <Smartphone className="w-3.5 h-3.5 text-blue-400" />
                            <span>{u.phone || 'No Phone'}</span>
                          </div>
                          {u.email && (
                            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                              <Mail className="w-3.5 h-3.5 text-slate-500" />
                              <span>{u.email}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4 font-mono text-xs">{u.role || 'USER'}</td>

                      <td className="px-6 py-4">
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          {u.status || 'ACTIVE'}
                        </span>
                      </td>

                      <td className="px-6 py-4 font-mono text-xs text-slate-300">{u.aadhaar_number || 'N/A'}</td>

                      <td className="px-6 py-4 text-xs">
                        {u.status === 'DEACTIVATED' || u.status === 'SUSPENDED' ? (
                          <button
                            onClick={() => handleUpdateStatus(u.id, 'ACTIVE')}
                            className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold"
                          >
                            Activate
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUpdateStatus(u.id, 'DEACTIVATED')}
                            className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold"
                          >
                            Deactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: CATEGORY REQUIREMENT & OPPORTUNITY FIELDS GOVERNANCE (SIDE PANEL LAYOUT) */}
        {activeTab === 'categories' && (
          <div className="grid lg:grid-cols-12 gap-6 items-start">
            {/* Left Side Panel: Category Selector */}
            <div className="lg:col-span-4 glass-panel p-5 rounded-3xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <h3 className="font-extrabold text-sm text-white uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <span>Service Categories ({categories.length})</span>
                </h3>
                <button
                  onClick={() => setShowCategoryModal(true)}
                  className="px-2.5 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-xs font-bold flex items-center gap-1 border border-purple-500/40"
                  title="Create New Category"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New</span>
                </button>
              </div>

              {/* Search Category Filter */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Filter categories..."
                  value={catSearchTerm}
                  onChange={(e) => setCatSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 font-medium"
                />
              </div>

              {/* Vertical Category List */}
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {categories
                  .filter((c) => c.name.toLowerCase().includes(catSearchTerm.toLowerCase()) || c.slug.toLowerCase().includes(catSearchTerm.toLowerCase()))
                  .map((cat) => {
                    const isSelected = selectedAdminCatId === cat.id;
                    const reqCount = cat.required_documents?.length || 0;
                    const oppCount = cat.opportunity_fields?.length || 0;

                    return (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedAdminCatId(cat.id)}
                        className={`w-full text-left p-3.5 rounded-2xl border transition-all flex items-center justify-between ${
                          isSelected
                            ? 'bg-purple-600/20 border-purple-500/60 shadow-lg shadow-purple-600/10 text-white'
                            : 'bg-slate-900/40 border-slate-800/80 text-slate-300 hover:bg-slate-900 hover:border-slate-700'
                        }`}
                      >
                        <div className="space-y-1 truncate pr-2">
                          <div className="font-bold text-xs flex items-center gap-2 truncate">
                            <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-purple-400 animate-pulse' : 'bg-slate-600'}`} />
                            <span className="truncate">{cat.name}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono truncate pl-4">
                            slug: {cat.slug}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold font-mono bg-purple-500/10 text-purple-300 border border-purple-500/20">
                            {reqCount} Req / {oppCount} Form
                          </span>
                          <span className="text-[9px] font-mono text-slate-500 uppercase">{cat.default_workflow}</span>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Right Workspace: Configuration Workspace for Selected Category */}
            <div className="lg:col-span-8 glass-panel p-6 rounded-3xl border border-slate-800 space-y-6">
              {(() => {
                const selectedCat = categories.find((c) => c.id === selectedAdminCatId) || categories[0];
                if (!selectedCat) {
                  return (
                    <div className="py-12 text-center text-slate-500 text-sm">
                      Select or create a service category to configure its dynamic schemas.
                    </div>
                  );
                }

                return (
                  <div className="space-y-6">
                    {/* Header */}
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xl font-extrabold text-white">{selectedCat.name}</h3>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            {selectedCat.slug}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{selectedCat.description || 'Dynamic Service Category Configuration'}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDeleteCategory(selectedCat.id)}
                          className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold flex items-center gap-1 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Category</span>
                        </button>
                      </div>
                    </div>

                    {/* Sub-Tab Navigation Header */}
                    <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900/90 rounded-2xl border border-slate-800">
                      <button
                        onClick={() => setCatSubTab('PROVIDER_VERIFICATION')}
                        className={`py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                          catSubTab === 'PROVIDER_VERIFICATION'
                            ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>1. Provider Verification Requirements ({selectedCat.required_documents?.length || 0})</span>
                      </button>

                      <button
                        onClick={() => setCatSubTab('NEED_OFFER_FIELDS')}
                        className={`py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                          catSubTab === 'NEED_OFFER_FIELDS'
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <FileText className="w-4 h-4" />
                        <span>2. Need/Offer Posting Form Fields ({selectedCat.opportunity_fields?.length || 0})</span>
                      </button>
                    </div>

                    {/* SUB-TAB 1: PROVIDER VERIFICATION REQUIREMENTS */}
                    {catSubTab === 'PROVIDER_VERIFICATION' && (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400">
                            Configured Verification Fields for Service Onboarding
                          </h4>
                          <span className="text-[11px] text-slate-500">Reorder, edit, or remove required provider specs</span>
                        </div>

                        {/* Interactive Field List with Reorder & Delete */}
                        <div className="space-y-2">
                          {(!selectedCat.required_documents || selectedCat.required_documents.length === 0) ? (
                            <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800 text-center text-slate-500 text-xs italic">
                              No custom provider verification fields configured yet. Add fields below.
                            </div>
                          ) : (
                            selectedCat.required_documents.map((req, idx) => (
                              <div
                                key={req.key + idx}
                                className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-3 group hover:border-purple-500/40 transition-colors"
                              >
                                <div className="flex items-center gap-3 truncate">
                                  {/* Reorder Buttons */}
                                  <div className="flex flex-col gap-0.5">
                                    <button
                                      disabled={idx === 0}
                                      onClick={() => handleMoveReqField(selectedCat, idx, idx - 1)}
                                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-purple-400 disabled:opacity-30"
                                      title="Move Up"
                                    >
                                      <ChevronUp className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      disabled={idx === (selectedCat.required_documents?.length || 0) - 1}
                                      onClick={() => handleMoveReqField(selectedCat, idx, idx + 1)}
                                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-purple-400 disabled:opacity-30"
                                      title="Move Down"
                                    >
                                      <ChevronDown className="w-3.5 h-3.5" />
                                    </button>
                                  </div>

                                  <div>
                                    <div className="font-bold text-xs text-white flex items-center gap-2">
                                      <span>{req.label}</span>
                                      {req.required && <span className="text-rose-400 text-[10px]">*Required</span>}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                                      <span>key: {req.key}</span>
                                      {req.description && <span className="italic truncate max-w-[250px]">- {req.description}</span>}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                  <span className="px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-300 border border-purple-500/30 text-[10px] font-mono font-bold uppercase">
                                    {req.type}
                                  </span>
                                  <button
                                    onClick={() => handleDeleteReqField(selectedCat, idx)}
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                    title="Delete Field"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Add Field Inline Form */}
                        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                          <h5 className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                            <Plus className="w-4 h-4 text-purple-400" />
                            <span>Add Provider Verification Field to Checklist</span>
                          </h5>

                          <div className="grid sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Field Label *</label>
                              <input
                                type="text"
                                value={newFieldLabel}
                                onChange={(e) => {
                                  setNewFieldLabel(e.target.value);
                                  if (!newFieldKey) setNewFieldKey(e.target.value.toLowerCase().replace(/\s+/g, '_'));
                                }}
                                placeholder="e.g. Trade License Document PDF"
                                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs font-medium focus:border-purple-500"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Field Type *</label>
                              <select
                                value={newFieldType}
                                onChange={(e) => setNewFieldType(e.target.value as any)}
                                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs font-medium focus:border-purple-500"
                              >
                                <option value="text">Text Input</option>
                                <option value="number">Number</option>
                                <option value="date">Date</option>
                                <option value="select">Dropdown Select</option>
                                <option value="checkbox">Checkbox</option>
                                <option value="textarea">Textarea (Long Text)</option>
                                <option value="image">Single Photo Upload</option>
                                <option value="multi_image">Multiple Photos</option>
                                <option value="pdf">PDF Document</option>
                                <option value="multi_pdf">Multiple PDF Documents</option>
                                <option value="video">Video Upload</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Description / Help Text</label>
                              <input
                                type="text"
                                value={newFieldDesc}
                                onChange={(e) => setNewFieldDesc(e.target.value)}
                                placeholder="e.g. Upload scanned copy of municipal license"
                                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs font-medium"
                              />
                            </div>

                            {newFieldType === 'select' ? (
                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Dropdown Options (Comma-separated)</label>
                                <input
                                  type="text"
                                  value={newFieldOptions}
                                  onChange={(e) => setNewFieldOptions(e.target.value)}
                                  placeholder="Option 1, Option 2, Option 3"
                                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs font-medium"
                                />
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 pt-4">
                                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={newFieldRequired}
                                    onChange={(e) => setNewFieldRequired(e.target.checked)}
                                    className="w-4 h-4 rounded bg-slate-900 border-slate-800 text-purple-600 focus:ring-0"
                                  />
                                  <span>Mark as Required Field</span>
                                </label>
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleAddReqFieldDirect(selectedCat)}
                            className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all shadow-lg shadow-purple-600/30 flex items-center gap-1.5"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Provider Verification Field</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* SUB-TAB 2: NEED/OFFER POSTING FIELDS */}
                    {catSubTab === 'NEED_OFFER_FIELDS' && (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400">
                            Configured Dynamic Fields for Need/Offer Posting Form
                          </h4>
                          <span className="text-[11px] text-slate-500">Loaded automatically when user creates Need or Offer</span>
                        </div>

                        {/* Interactive Field List with Reorder & Delete */}
                        <div className="space-y-2">
                          {(!selectedCat.opportunity_fields || selectedCat.opportunity_fields.length === 0) ? (
                            <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800 text-center text-slate-500 text-xs italic">
                              No custom opportunity fields configured yet. Standard fields are used. Add custom fields below.
                            </div>
                          ) : (
                            selectedCat.opportunity_fields.map((field, idx) => (
                              <div
                                key={field.key + idx}
                                className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-3 group hover:border-blue-500/40 transition-colors"
                              >
                                <div className="flex items-center gap-3 truncate">
                                  {/* Reorder Buttons */}
                                  <div className="flex flex-col gap-0.5">
                                    <button
                                      disabled={idx === 0}
                                      onClick={() => handleMoveOppField(selectedCat, idx, idx - 1)}
                                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-blue-400 disabled:opacity-30"
                                      title="Move Up"
                                    >
                                      <ChevronUp className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      disabled={idx === (selectedCat.opportunity_fields?.length || 0) - 1}
                                      onClick={() => handleMoveOppField(selectedCat, idx, idx + 1)}
                                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-blue-400 disabled:opacity-30"
                                      title="Move Down"
                                    >
                                      <ChevronDown className="w-3.5 h-3.5" />
                                    </button>
                                  </div>

                                  <div>
                                    <div className="font-bold text-xs text-white flex items-center gap-2">
                                      <span>{field.label}</span>
                                      {field.required && <span className="text-rose-400 text-[10px]">*Required</span>}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                                      <span>key: {field.key}</span>
                                      {field.options && field.options.length > 0 && (
                                        <span className="text-slate-500 font-sans truncate max-w-[250px]">[{field.options.join(', ')}]</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                  <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-300 border border-blue-500/30 text-[10px] font-mono font-bold uppercase">
                                    {field.type}
                                  </span>
                                  <button
                                    onClick={() => handleDeleteOppField(selectedCat, idx)}
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                    title="Delete Field"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Add Field Inline Form */}
                        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                          <h5 className="text-xs font-bold text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                            <Plus className="w-4 h-4 text-blue-400" />
                            <span>Add Custom Opportunity Form Field</span>
                          </h5>

                          <div className="grid sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Field Label *</label>
                              <input
                                type="text"
                                value={newOppLabel}
                                onChange={(e) => {
                                  setNewOppLabel(e.target.value);
                                  if (!newOppKey) setNewOppKey(e.target.value.toLowerCase().replace(/\s+/g, '_'));
                                }}
                                placeholder="e.g. Quantity Needed / Available"
                                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs font-medium focus:border-blue-500"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Field Type *</label>
                              <select
                                value={newOppType}
                                onChange={(e) => setNewOppType(e.target.value as any)}
                                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs font-medium focus:border-blue-500"
                              >
                                <option value="text">Text Input</option>
                                <option value="number">Number</option>
                                <option value="select">Dropdown Select</option>
                                <option value="date">Date</option>
                                <option value="datetime">Date & Time</option>
                                <option value="location">Location / Address</option>
                                <option value="textarea">Textarea (Long Text)</option>
                                <option value="photo">Photo Upload</option>
                                <option value="video">Video Upload</option>
                                <option value="file">Document / File Upload</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid sm:grid-cols-2 gap-3">
                            {newOppType === 'select' ? (
                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Dropdown Options (Comma-separated)</label>
                                <input
                                  type="text"
                                  value={newOppOptions}
                                  onChange={(e) => setNewOppOptions(e.target.value)}
                                  placeholder="Option 1, Option 2, Option 3"
                                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs font-medium"
                                />
                              </div>
                            ) : (
                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Field Key (DB Name)</label>
                                <input
                                  type="text"
                                  value={newOppKey}
                                  onChange={(e) => setNewOppKey(e.target.value)}
                                  placeholder="e.g. quantity_needed"
                                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs font-mono"
                                />
                              </div>
                            )}

                            <div className="flex items-center gap-2 pt-4">
                              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={newOppReq}
                                  onChange={(e) => setNewOppReq(e.target.checked)}
                                  className="w-4 h-4 rounded bg-slate-900 border-slate-800 text-blue-600 focus:ring-0"
                                />
                                <span>Mark as Required Field</span>
                              </label>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleAddOppFieldDirect(selectedCat)}
                            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all shadow-lg shadow-blue-600/30 flex items-center gap-1.5"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Opportunity Form Field</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* TAB 4: ORDERS & TECHNICAL WORKFLOWS GOVERNANCE */}
        {activeTab === 'opportunities' && (
          <div className="space-y-6">
            <div className="glass-panel p-6 rounded-3xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-br from-amber-950/40 via-slate-900 to-orange-950/40">
              <div>
                <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  REAL DATABASE ORDERS & TECHNICAL WORKFLOW GOVERNANCE
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white pt-1">All Platform Orders ({adminOpportunities.length})</h2>
                <p className="text-xs text-slate-400 mt-0.5">Comprehensive admin view of underlying orders, customers, recipients, providers, locations, and technical workflows.</p>
              </div>

              <button
                onClick={fetchAllAdminData}
                className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold text-xs flex items-center justify-center gap-2 shrink-0"
              >
                <RefreshCw className={`w-4 h-4 text-amber-400 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh Orders</span>
              </button>
            </div>

            <div className="glass-panel rounded-3xl border border-slate-800 overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/90 text-slate-400 uppercase font-mono font-bold border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-4">Order ID / Date</th>
                      <th className="px-4 py-4">Customer & Recipient</th>
                      <th className="px-4 py-4">Service & Quantity</th>
                      <th className="px-4 py-4">Pickup & Delivery Locations</th>
                      <th className="px-4 py-4">Provider / Match</th>
                      <th className="px-4 py-4">Status & Budget</th>
                      <th className="px-4 py-4">Technical Workflow</th>
                      <th className="px-4 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 font-medium">
                    {adminOpportunities.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-12 text-center text-slate-500 italic">
                          No order opportunities found in database.
                        </td>
                      </tr>
                    ) : (
                      adminOpportunities.map((opp) => {
                        const meta = opp.metadata || {};
                        const cf = meta.custom_fields || {};
                        const rawQuantity = meta.quantity ?? cf.quantity ?? meta.quantity_bags ?? 1;
                        const catName = opp.category?.name || meta.category_name || opp.title;
                        const recipient = meta.recipient_details || {};
                        const customerName = opp.user?.full_name || meta.customer_details?.name || 'Customer';
                        const customerPhone = opp.user?.phone || meta.customer_details?.phone || 'N/A';
                        const providerInfo = meta.assigned_provider_details?.name || (opp as any).matched_user?.full_name || 'Pending Matching';
                        const formattedDate = opp.created_at
                          ? new Date(opp.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                          : 'N/A';

                        return (
                          <tr key={opp.id} className="hover:bg-slate-900/60 transition-colors">
                            <td className="px-4 py-4 font-mono">
                              <span className="text-amber-400 font-bold block">#UOP-{opp.id.slice(0, 8).toUpperCase()}</span>
                              <span className="text-[10px] text-slate-500 block">{formattedDate}</span>
                            </td>

                            <td className="px-4 py-4">
                              <span className="text-white font-bold block">{customerName}</span>
                              <span className="text-slate-400 text-[11px] block">{customerPhone}</span>
                              {recipient.recipientName && (
                                <span className="text-emerald-400 text-[10px] block mt-0.5">
                                  For: {recipient.recipientName} ({recipient.recipientPhone || 'N/A'})
                                </span>
                              )}
                            </td>

                            <td className="px-4 py-4">
                              <span className="text-slate-200 font-bold block">{catName}</span>
                              <span className="text-emerald-400 font-extrabold font-mono text-xs block">{rawQuantity} units</span>
                            </td>

                            <td className="px-4 py-4 max-w-[220px]">
                              <span className="text-amber-300 text-[11px] block truncate" title={meta.pickup_location || 'Source Yard'}>
                                📦 Pickup: {meta.pickup_location || 'Source Yard'}
                              </span>
                              <span className="text-slate-300 text-[11px] block truncate" title={opp.address_text || meta.delivery_location}>
                                📍 Delivery: {opp.address_text || meta.delivery_location || 'Delivery Site'}
                              </span>
                            </td>

                            <td className="px-4 py-4 font-mono">
                              <span className={`px-2 py-0.5 rounded text-[11px] font-bold block w-fit ${
                                providerInfo !== 'Pending Matching'
                                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-slate-800 text-slate-400'
                              }`}>
                                {providerInfo}
                              </span>
                            </td>

                            <td className="px-4 py-4 font-mono">
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-blue-500/15 text-blue-300 border border-blue-500/30 block w-fit mb-1">
                                {opp.status}
                              </span>
                              {opp.budget_max && (
                                <span className="text-emerald-400 font-bold block text-xs">₹{Number(opp.budget_max).toLocaleString()}</span>
                              )}
                            </td>

                            <td className="px-4 py-4 font-mono text-[10px]">
                              <span className="text-purple-400 font-bold block">Model: {opp.workflow_model || 'INSTANT'}</span>
                              <span className="text-slate-500 block truncate max-w-[140px]">UUID: {opp.id}</span>
                              {opp.parent_opportunity_id && (
                                <span className="text-indigo-400 block truncate max-w-[140px]">Parent: {opp.parent_opportunity_id}</span>
                              )}
                            </td>

                            <td className="px-4 py-4 text-right">
                              <Link
                                href={`/opportunities/${opp.id}`}
                                className="px-3 py-1.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 font-bold text-xs inline-flex items-center gap-1 transition-all"
                              >
                                <span>Inspect</span>
                                <ChevronRight className="w-3 h-3" />
                              </Link>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Inspection Modal Dialog */}
        {inspectingAsset && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="glass-panel p-8 rounded-3xl border border-slate-800 w-full max-w-2xl space-y-6 relative max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Eye className="w-5 h-5 text-purple-400" />
                    <span>Verification Inspection: {inspectingAsset.title}</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    User: <strong className="text-white">{inspectingAsset.user?.full_name}</strong> ({inspectingAsset.user?.phone}) | Category: <strong className="text-purple-300">{inspectingAsset.category?.name || inspectingAsset.asset_type}</strong>
                  </p>
                </div>
                <button onClick={() => setInspectingAsset(null)} className="text-slate-400 hover:text-white font-bold text-lg">✕</button>
              </div>

              {/* Checklist & Verification Status summary */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Service Status</span>
                  {getServiceStatusBadge(inspectingAsset.status)}
                </div>

                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">User Aadhaar Status</span>
                  <div className="text-xs font-mono text-emerald-400 font-bold flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4" />
                    <span>Aadhaar: {inspectingAsset.documents ? (inspectingAsset.documents as any)['aadhaar_number'] || inspectingAsset.user?.aadhaar_number || 'Recorded' : 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Requirement Checklist */}
              {inspectingAsset.category?.required_documents && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider">Required Field Verification Checklist</h4>
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                    {inspectingAsset.category.required_documents.map((req) => {
                      const hasDoc = inspectingAsset.documents && (inspectingAsset.documents as any)[req.key];
                      return (
                        <div key={req.key} className="flex items-center justify-between text-xs border-b border-slate-900 pb-1.5">
                          <span className="text-slate-300 font-medium">{req.label}</span>
                          {hasDoc ? (
                            <span className="text-emerald-400 font-bold flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Completed</span>
                          ) : req.required ? (
                            <span className="text-rose-400 font-bold flex items-center gap-1"><X className="w-3.5 h-3.5" /> Missing</span>
                          ) : (
                            <span className="text-slate-500">Optional</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Submitted Verification Values & Files Display */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider">Submitted Details, Documents, Photos & Videos</h4>

                {!inspectingAsset.documents || Object.keys(inspectingAsset.documents).length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-xs italic border border-slate-800 rounded-2xl">
                    No verification documents or details uploaded yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(inspectingAsset.documents).map(([k, val]: [string, any]) => {
                      const valStr = String(val);
                      const isImg = typeof val === 'string' && (val.endsWith('.jpg') || val.endsWith('.png') || val.endsWith('.webp') || val.includes('/uploads/'));
                      const isPdf = typeof val === 'string' && val.endsWith('.pdf');
                      const isVid = typeof val === 'string' && (val.endsWith('.mp4') || val.endsWith('.webm') || val.endsWith('.mov'));
                      const isArr = Array.isArray(val);

                      return (
                        <div key={k} className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-purple-300 uppercase tracking-wider font-mono">{k}</span>
                            <span className="text-[10px] text-slate-500 font-mono">Submitted Value</span>
                          </div>

                          {isImg && (
                            <div className="space-y-2">
                              <img src={valStr} alt={k} className="max-h-48 rounded-xl object-cover border border-purple-500/40" />
                              <a href={valStr} target="_blank" rel="noreferrer" className="text-[11px] font-mono text-purple-400 hover:underline block">
                                Open Original Image URL: {valStr}
                              </a>
                            </div>
                          )}

                          {isPdf && (
                            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                              <div className="flex items-center gap-2 text-xs text-slate-200">
                                <File className="w-4 h-4 text-purple-400" />
                                <span>PDF Document: {valStr}</span>
                              </div>
                              <a href={valStr} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold">
                                View PDF Document →
                              </a>
                            </div>
                          )}

                          {isVid && (
                            <div className="space-y-2">
                              <video src={valStr} controls className="w-full max-h-56 rounded-xl border border-purple-500/40 object-cover" />
                              <a href={valStr} target="_blank" rel="noreferrer" className="text-[11px] font-mono text-purple-400 hover:underline block">
                                Video URL: {valStr}
                              </a>
                            </div>
                          )}

                          {isArr && (
                            <div className="flex flex-wrap gap-3">
                              {val.map((itemUrl: string, idx: number) => (
                                <div key={idx} className="space-y-1">
                                  {itemUrl.endsWith('.mp4') || itemUrl.endsWith('.webm') ? (
                                    <video src={itemUrl} controls className="w-36 h-28 rounded-lg object-cover border border-slate-700" />
                                  ) : itemUrl.endsWith('.pdf') ? (
                                    <a href={itemUrl} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-purple-300 block">
                                      View PDF #{idx + 1}
                                    </a>
                                  ) : (
                                    <img src={itemUrl} alt={`Upload ${idx}`} className="w-24 h-24 rounded-lg object-cover border border-slate-700" />
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {!isImg && !isPdf && !isVid && !isArr && (
                            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-200">
                              {valStr}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-800 flex gap-3">
                {inspectingAsset.status === 'PENDING_APPROVAL' && (
                  <button
                    onClick={() => handleApproveInitialRequest(inspectingAsset.id)}
                    className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-600/30"
                  >
                    Approve Request to Unlock Document Submission
                  </button>
                )}

                {(inspectingAsset.status === 'UNDER_REVIEW' || inspectingAsset.status === 'VERIFICATION_PENDING') && (
                  <>
                    <button
                      onClick={() => handleApproveDocuments(inspectingAsset.id)}
                      className="w-1/2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30"
                    >
                      Approve Verification & Activate Service
                    </button>
                    <button
                      onClick={() => {
                        setRejectingAsset(inspectingAsset);
                        setRejectionReasonInput('');
                      }}
                      className="w-1/2 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30"
                    >
                      Reject Verification with Reason
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal Dialog for Rejection Reason */}
        {rejectingAsset && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="glass-panel p-8 rounded-3xl border border-slate-800 w-full max-w-md space-y-6 relative">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                  <span>Reject Service Request / Verification</span>
                </h3>
                <button onClick={() => setRejectingAsset(null)} className="text-slate-400 hover:text-white font-bold text-lg">✕</button>
              </div>

              <form onSubmit={handleRejectSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Rejection Reason *</label>
                  <textarea
                    rows={3}
                    value={rejectionReasonInput}
                    onChange={(e) => setRejectionReasonInput(e.target.value)}
                    placeholder="e.g. Invalid document image provided / Clear registration number required"
                    className="w-full p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm focus:outline-none focus:border-rose-500"
                    required
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setRejectingAsset(null)}
                    className="w-1/2 py-3 rounded-xl glass-panel text-slate-300 font-semibold text-xs border border-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingReject}
                    className="w-1/2 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2"
                  >
                    {submittingReject ? 'Rejecting...' : 'Reject Request'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Dialog for User Creation / Invite */}
        {showInviteModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="glass-panel p-8 rounded-3xl border border-slate-800 w-full max-w-md space-y-6 relative">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-blue-400" />
                  <span>Invite / Create User</span>
                </h3>
                <button onClick={() => setShowInviteModal(false)} className="text-slate-400 hover:text-white font-bold text-lg">✕</button>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                  {error}
                </div>
              )}

              {inviteResult ? (
                <div className="space-y-4 p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 text-center">
                  <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto" />
                  <h4 className="font-bold text-white text-base">User Created & OTP Dispatched!</h4>
                  <div className="p-3 rounded-xl bg-slate-900 text-left space-y-1 font-mono text-xs border border-slate-800">
                    <div className="text-slate-400">Mobile OTP Code: <strong className="text-emerald-400 text-sm">{inviteResult.otp_code || '123456'}</strong></div>
                    <div className="text-slate-400">Phone: {inviteResult.phone}</div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleInviteSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Full Name *</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm focus:outline-none focus:border-blue-500"
                      placeholder="Ramesh Kumar"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Mobile Phone Number *</label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm focus:outline-none focus:border-blue-500"
                      placeholder="+919876543210"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">User Role</label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm focus:outline-none focus:border-blue-500"
                    >
                      <option value="USER">USER (Customer & Provider)</option>
                      <option value="ADMIN">ADMIN (System Governance)</option>
                    </select>
                  </div>

                  <div className="pt-2 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowInviteModal(false)}
                      className="w-1/2 py-3 rounded-xl glass-panel text-slate-300 font-semibold text-xs border border-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={inviting}
                      className="w-1/2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2"
                    >
                      {inviting ? 'Creating...' : 'Send Invitation'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Modal Dialog for Category Creation */}
        {showCategoryModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="glass-panel p-8 rounded-3xl border border-slate-800 w-full max-w-md space-y-6 relative">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-purple-400" />
                  <span>Create Service Category</span>
                </h3>
                <button onClick={() => setShowCategoryModal(false)} className="text-slate-400 hover:text-white font-bold text-lg">✕</button>
              </div>

              <form onSubmit={handleCreateCategorySubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Category Name *</label>
                  <input
                    type="text"
                    value={catName}
                    onChange={(e) => setCatName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm focus:outline-none focus:border-purple-500"
                    placeholder="e.g. Solar Panel Maintenance"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Description</label>
                  <input
                    type="text"
                    value={catDesc}
                    onChange={(e) => setCatDesc(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm focus:outline-none focus:border-purple-500"
                    placeholder="Solar panel cleaning, inverter repair & battery testing"
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCategoryModal(false)}
                    className="w-1/2 py-3 rounded-xl glass-panel text-slate-300 font-semibold text-xs border border-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingCat}
                    className="w-1/2 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2"
                  >
                    {creatingCat ? 'Creating...' : 'Save Category'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminSidebar>
  );
}
