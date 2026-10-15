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
  updateCategoryResources,
  ResourceConfig,
  ResourceFieldConfig,
  getPublicOpportunities,
  getAdminCatalogRequests,
  approveCatalogItem,
  rejectCatalogItem,
  VendorCatalogItem,
  Opportunity,
  UserProfile,
  Category,
  UserServiceAsset,
  RequiredDocumentSpec,
  OpportunityFieldSpec,
  getStoredUser,
} from '@/lib/api';
import { sanitizePhoneInput, validatePhoneNumber } from '@/lib/phoneUtils';
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
  Truck,
} from 'lucide-react';

function AdminUserManagementContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams ? searchParams.get('tab') : null;

  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'service_approvals' | 'catalog_approvals' | 'categories' | 'opportunities'>('dashboard');

  useEffect(() => {
    if (tabParam === 'dashboard') {
      setActiveTab('dashboard');
    } else if (tabParam === 'users') {
      setActiveTab('users');
    } else if (tabParam === 'categories' || tabParam === 'requirements') {
      setActiveTab('categories');
    } else if (tabParam === 'service_approvals' || tabParam === 'providers' || tabParam === 'verification') {
      setActiveTab('service_approvals');
    } else if (tabParam === 'catalog_approvals' || tabParam === 'catalog') {
      setActiveTab('catalog_approvals');
    } else if (tabParam === 'opportunities' || tabParam === 'orders' || tabParam === 'workflows') {
      setActiveTab('opportunities');
    } else {
      setActiveTab('dashboard');
    }
  }, [tabParam]);

  useEffect(() => {
    const storedUser = getStoredUser();
    if (!storedUser || (storedUser.role !== 'ADMIN' && storedUser.role !== 'SUPER_ADMIN')) {
      router.push('/admin/login');
    }
  }, [router]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [serviceRequests, setServiceRequests] = useState<UserServiceAsset[]>([]);
  const [catalogRequests, setCatalogRequests] = useState<VendorCatalogItem[]>([]);
  const [rejectingCatalogItem, setRejectingCatalogItem] = useState<VendorCatalogItem | null>(null);
  const [catalogRejectionReason, setCatalogRejectionReason] = useState('');
  const [adminOpportunities, setAdminOpportunities] = useState<Opportunity[]>([]);
  const [serviceStatusFilter, setServiceStatusFilter] = useState<string>('ALL');
  const [catalogStatusFilter, setCatalogStatusFilter] = useState<string>('PENDING_ADMIN_APPROVAL');
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
      const [uList, cList, sList, catReqs, oppList] = await Promise.all([
        listUsers(),
        getCategories(),
        listAllServiceRequests(serviceStatusFilter),
        getAdminCatalogRequests(catalogStatusFilter),
        getPublicOpportunities(),
      ]);
      setUsers(uList);
      setCategories(cList);
      setServiceRequests(sList);
      setCatalogRequests(catReqs);
      setAdminOpportunities(oppList.data);
    } catch (e) {
      console.error('Failed to load admin data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllAdminData();
  }, [serviceStatusFilter, catalogStatusFilter]);

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName) {
      setError('Full Name is required.');
      return;
    }
    const phoneValidation = validatePhoneNumber(phone);
    if (!phoneValidation.isValid) {
      setError(phoneValidation.error || 'Please enter a valid Mobile Phone Number.');
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
  const [catSubTab, setCatSubTab] = useState<'PROVIDER_VERIFICATION' | 'NEED_OFFER_FIELDS' | 'RESOURCE_LOGISTICS'>('PROVIDER_VERIFICATION');

  // Resource & Logistics Builder State
  const [newResName, setNewResName] = useState('');
  const [newResKey, setNewResKey] = useState('');
  const [newResDesc, setNewResDesc] = useState('');
  const [newResLevel, setNewResLevel] = useState<'REQUIRED' | 'OPTIONAL' | 'NOT_APPLICABLE'>('OPTIONAL');

  // Resource detail field inline builder state
  const [resFieldTargetIdx, setResFieldTargetIdx] = useState<number | null>(null);
  const [newResFieldLabel, setNewResFieldLabel] = useState('');
  const [newResFieldKey, setNewResFieldKey] = useState('');
  const [newResFieldType, setNewResFieldType] = useState<ResourceFieldConfig['type']>('text');
  const [newResFieldReq, setNewResFieldReq] = useState(true);
  const [newResFieldOptions, setNewResFieldOptions] = useState('');

  const handleToggleResourceActive = async (cat: Category, resIdx: number) => {
    const list: ResourceConfig[] = JSON.parse(JSON.stringify(cat.resources || []));
    if (resIdx < 0 || resIdx >= list.length) return;
    list[resIdx].active = !list[resIdx].active;
    try {
      await updateCategoryResources(cat.id, list);
      fetchAllAdminData();
    } catch (err: any) {
      alert(`Failed to update resource: ${err.message}`);
    }
  };

  const handleSetResourceRequirementLevel = async (cat: Category, resIdx: number, level: 'REQUIRED' | 'OPTIONAL' | 'NOT_APPLICABLE') => {
    const list: ResourceConfig[] = JSON.parse(JSON.stringify(cat.resources || []));
    if (resIdx < 0 || resIdx >= list.length) return;
    list[resIdx].requirement_level = level;
    if (level === 'NOT_APPLICABLE') {
      list[resIdx].active = false;
    } else {
      list[resIdx].active = true;
    }
    try {
      await updateCategoryResources(cat.id, list);
      fetchAllAdminData();
    } catch (err: any) {
      alert(`Failed to update resource level: ${err.message}`);
    }
  };

  const handleMoveResource = async (cat: Category, fromIdx: number, toIdx: number) => {
    const list: ResourceConfig[] = JSON.parse(JSON.stringify(cat.resources || []));
    if (toIdx < 0 || toIdx >= list.length) return;
    const [item] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, item);
    try {
      await updateCategoryResources(cat.id, list);
      fetchAllAdminData();
    } catch (err: any) {
      alert(`Reorder failed: ${err.message}`);
    }
  };

  const handleDeleteResource = async (cat: Category, resIdx: number) => {
    if (!confirm('Delete this resource configuration from this category?')) return;
    const list: ResourceConfig[] = JSON.parse(JSON.stringify(cat.resources || []));
    list.splice(resIdx, 1);
    try {
      await updateCategoryResources(cat.id, list);
      fetchAllAdminData();
    } catch (err: any) {
      alert(`Delete resource failed: ${err.message}`);
    }
  };

  const handleAddResourceDirect = async (cat: Category) => {
    if (!newResName.trim()) return;
    const key = newResKey ? newResKey.toLowerCase().replace(/\s+/g, '_') : newResName.toLowerCase().replace(/\s+/g, '_');
    const newRes: ResourceConfig = {
      id: `res_${key}`,
      key,
      name: newResName.trim(),
      description: newResDesc.trim() || `Configured ${newResName.trim()} arrangement`,
      requirement_level: newResLevel,
      active: true,
      display_order: (cat.resources?.length || 0) + 1,
      options: [
        { key: `BOOK_${key.toUpperCase()}`, label: `1. I will book ${newResName.trim().toLowerCase()}`, description: `Vendor / platform arranges ${newResName.trim().toLowerCase()}` },
        { key: `HAVE_${key.toUpperCase()}`, label: `2. I have ${newResName.trim().toLowerCase()} / Myself`, description: `Customer provides details` },
        { key: `NO_${key.toUpperCase()}`, label: `3. I do not have ${newResName.trim().toLowerCase()}`, description: `Vendor arranges ${newResName.trim().toLowerCase()}` },
      ],
      fields: [],
    };
    const list: ResourceConfig[] = JSON.parse(JSON.stringify(cat.resources || []));
    list.push(newRes);
    try {
      await updateCategoryResources(cat.id, list);
      setNewResName('');
      setNewResKey('');
      setNewResDesc('');
      setNewResLevel('OPTIONAL');
      fetchAllAdminData();
    } catch (err: any) {
      alert(`Add resource failed: ${err.message}`);
    }
  };

  const handleAddFieldToResource = async (cat: Category, resIdx: number) => {
    if (!newResFieldLabel.trim()) return;
    const key = newResFieldKey ? newResFieldKey.toLowerCase().replace(/\s+/g, '_') : newResFieldLabel.toLowerCase().replace(/\s+/g, '_');
    const list: ResourceConfig[] = JSON.parse(JSON.stringify(cat.resources || []));
    if (resIdx < 0 || resIdx >= list.length) return;
    if (!list[resIdx].fields) list[resIdx].fields = [];

    list[resIdx].fields!.push({
      key,
      label: newResFieldLabel.trim(),
      type: newResFieldType,
      required: newResFieldReq,
      options: newResFieldOptions ? newResFieldOptions.split(',').map((s) => s.trim()) : undefined,
    });

    try {
      await updateCategoryResources(cat.id, list);
      setResFieldTargetIdx(null);
      setNewResFieldLabel('');
      setNewResFieldKey('');
      setNewResFieldOptions('');
      fetchAllAdminData();
    } catch (err: any) {
      alert(`Add resource field failed: ${err.message}`);
    }
  };

  const handleDeleteFieldFromResource = async (cat: Category, resIdx: number, fieldIdx: number) => {
    if (!confirm('Delete this detail field from resource?')) return;
    const list: ResourceConfig[] = JSON.parse(JSON.stringify(cat.resources || []));
    if (resIdx < 0 || resIdx >= list.length) return;
    if (list[resIdx].fields && fieldIdx >= 0 && fieldIdx < list[resIdx].fields!.length) {
      list[resIdx].fields!.splice(fieldIdx, 1);
      try {
        await updateCategoryResources(cat.id, list);
        fetchAllAdminData();
      } catch (err: any) {
        alert(`Delete field failed: ${err.message}`);
      }
    }
  };

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

  const handleApproveCatalogItem = async (id: string) => {
    try {
      await approveCatalogItem(id);
      setCatalogRequests((prev) => prev.filter((item) => item.id !== id));
      alert('Vendor Catalog Listing Approved & Published to Marketplace!');
    } catch (err: any) {
      alert(err.message || 'Failed to approve catalog item');
    }
  };

  const handleRejectCatalogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingCatalogItem) return;
    try {
      await rejectCatalogItem(rejectingCatalogItem.id, catalogRejectionReason);
      setCatalogRequests((prev) => prev.filter((item) => item.id !== rejectingCatalogItem.id));
      setRejectingCatalogItem(null);
      setCatalogRejectionReason('');
      alert('Vendor Catalog Listing Rejected.');
    } catch (err: any) {
      alert(err.message || 'Failed to reject catalog item');
    }
  };

  return (
    <AdminSidebar>
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined' && window.history.length > 1) {
                  router.back();
                } else {
                  router.push('/');
                }
              }}
              className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-black mb-2 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 flex flex-wrap items-center gap-3">
              <span>Admin Governance & Service Approval Console</span>
              <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-300 text-xs font-semibold">
                Dynamic Verification Engine
              </span>
            </h1>
            <p className="text-slate-600 text-xs sm:text-sm mt-1">
              Admin Login: <strong className="text-slate-900 font-mono">+919999999999</strong> | Dev OTP: <strong className="text-slate-900 font-mono">123456</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={fetchAllAdminData}
              className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-800 hover:bg-slate-100 text-xs font-semibold flex items-center gap-2 shadow-sm transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              onClick={() => setShowInviteModal(true)}
              className="px-5 py-2.5 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs shadow-md flex items-center gap-2 transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>Invite / Create User</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation Controls */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 pb-3">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
              activeTab === 'dashboard'
                ? 'bg-black border-black text-white shadow-md'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100 hover:text-black shadow-sm'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-white" />
            <span>Admin Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab('service_approvals')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
              activeTab === 'service_approvals'
                ? 'bg-black border-black text-white shadow-md'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100 hover:text-black shadow-sm'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            <span>Service Provider Requests ({serviceRequests.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('catalog_approvals')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
              activeTab === 'catalog_approvals'
                ? 'bg-black border-black text-white shadow-md'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100 hover:text-black shadow-sm'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Catalog / Brick Approvals ({catalogRequests.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('users')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
              activeTab === 'users'
                ? 'bg-black border-black text-white shadow-md'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100 hover:text-black shadow-sm'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Users Directory ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('categories')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
              activeTab === 'categories'
                ? 'bg-black border-black text-white shadow-md'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100 hover:text-black shadow-sm'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Category & Requirements ({categories.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('opportunities')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
              activeTab === 'opportunities'
                ? 'bg-black border-black text-white shadow-md'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100 hover:text-black shadow-sm'
            }`}
          >
            <Package className="w-4 h-4 text-amber-400" />
            <span>Orders & Workflows ({adminOpportunities.length})</span>
          </button>
        </div>

        {/* TAB 0: ADMIN DASHBOARD (SEPARATED STAGE COUNTS & WHITE+BLACK THEME) */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {/* 7 Metric Cards with Separated Approval Stages */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Stage 1 Requests</span>
                <span className="text-xl font-extrabold text-amber-700">
                  {serviceRequests.filter((s) => s.status === 'PENDING_APPROVAL').length}
                </span>
                <span className="text-[10px] text-slate-400 block font-medium">Pending Stage 1</span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Stage 2 Details</span>
                <span className="text-xl font-extrabold text-indigo-700">
                  {serviceRequests.filter((s) => s.status === 'UNDER_REVIEW').length}
                </span>
                <span className="text-[10px] text-slate-400 block font-medium">Pending Stage 2</span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Stage 3 Sub-Services</span>
                <span className="text-xl font-extrabold text-purple-700">
                  {catalogRequests.filter((c) => (c.status as string) === 'PENDING_ADMIN_APPROVAL' || (c.status as string) === 'PENDING').length}
                </span>
                <span className="text-[10px] text-slate-400 block font-medium">Pending Stage 3</span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Active Services</span>
                <span className="text-xl font-extrabold text-emerald-700">
                  {serviceRequests.filter((s) => s.status === 'ACTIVE').length}
                </span>
                <span className="text-[10px] text-slate-400 block font-medium">Verified Stage 2</span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Live Offerings</span>
                <span className="text-xl font-extrabold text-slate-900">
                  {catalogRequests.filter((c) => (c.status as string) === 'ACTIVE_IN_CATALOG' || (c.status as string) === 'APPROVED').length}
                </span>
                <span className="text-[10px] text-slate-400 block font-medium">Marketplace Ready</span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Registered Users</span>
                <span className="text-xl font-extrabold text-slate-900">{users.length}</span>
                <span className="text-[10px] text-slate-400 block font-medium">Platform Accounts</span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Service Categories</span>
                <span className="text-xl font-extrabold text-slate-900">{categories.length}</span>
                <span className="text-[10px] text-slate-400 block font-medium">Configured Schemas</span>
              </div>
            </div>

            {/* PENDING ACTIONS SECTION */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-600" />
                  <span>PENDING GOVERNANCE ACTIONS</span>
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold">
                  {serviceRequests.filter((s) => s.status === 'PENDING_APPROVAL' || s.status === 'UNDER_REVIEW').length + catalogRequests.filter((c) => (c.status as string) === 'PENDING_ADMIN_APPROVAL' || (c.status as string) === 'PENDING').length} Action(s) Required
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">Provider Acceptance Pending</span>
                    <h4 className="font-bold text-slate-900 text-sm">Order #UOP-1024 (100 Bricks Transport)</h4>
                    <p className="text-slate-600 text-[11px]">Matched with 3 nearby providers • Awaiting provider response</p>
                  </div>
                  <Link
                    href="/order/9001"
                    className="px-4 py-2 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all shrink-0"
                  >
                    View
                  </Link>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold text-slate-800 uppercase tracking-wider block">Service Provider Document Verification</span>
                    <h4 className="font-bold text-slate-900 text-sm">Suresh Transport (Tata 12-Wheeler Fleet)</h4>
                    <p className="text-slate-600 text-[11px]">Commercial Driving License & Vehicle Insurance uploaded</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('service_approvals')}
                    className="px-4 py-2 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all shrink-0"
                  >
                    Inspect
                  </button>
                </div>
              </div>
            </div>

            {/* DELAYED ORDERS SECTION */}
            <div className="bg-white p-6 rounded-3xl border border-rose-200 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-rose-100 pb-3">
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                  <span>DELAYED ORDERS</span>
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200 text-xs font-bold">
                  2 Incidents Logged
                </span>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs font-extrabold text-slate-900 block">Order #UOP-1008</span>
                      <span className="text-[11px] text-rose-700 font-semibold mt-0.5 block">Reason: Vehicle issue (Clutch failure)</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200 font-mono text-[10px] font-bold">
                      SOS ACTIVE
                    </span>
                  </div>

                  <div className="text-slate-600 text-[11px] flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>Current location: Hyderabad (NH65 Shoulder)</span>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Link
                      href="/order/9002"
                      className="px-4 py-1.5 rounded-xl bg-black text-white hover:bg-slate-800 font-bold text-xs transition-all"
                    >
                      View
                    </Link>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs font-extrabold text-slate-900 block">Order #UOP-1014</span>
                      <span className="text-[11px] text-amber-800 font-semibold mt-0.5 block">Reason: Traffic bottleneck delay</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-mono text-[10px] font-bold">
                      DELAYED
                    </span>
                  </div>

                  <div className="text-slate-600 text-[11px] flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Current location: Choutuppal Toll Plaza</span>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Link
                      href="/order/9001"
                      className="px-4 py-1.5 rounded-xl bg-black text-white hover:bg-slate-800 font-bold text-xs transition-all"
                    >
                      View
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: SERVICE PROVIDER APPROVAL WORKFLOW (STAGE 1 & STAGE 2) */}
        {activeTab === 'service_approvals' && (
          <div className="space-y-6">
            {/* Status Filter Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Approval Stage Filter:</span>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'ALL REQUESTS', value: 'ALL' },
                  { label: 'STAGE 1: SERVICE REQUESTS', value: 'PENDING_APPROVAL' },
                  { label: 'STAGE 2: DETAILS APPROVAL', value: 'UNDER_REVIEW' },
                  { label: 'DOCS PENDING', value: 'DOCUMENTS_PENDING' },
                  { label: 'ACTIVE & APPROVED', value: 'ACTIVE' },
                  { label: 'REJECTED', value: 'REJECTED' },
                ].map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setServiceStatusFilter(f.value)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      serviceStatusFilter === f.value
                        ? 'bg-black text-white shadow-sm'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-black border border-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Service Requests Directory Table */}
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-lg text-slate-900">Stage 1 & Stage 2 Service Requests ({serviceRequests.length})</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Stage 1 (Main Service Opt-in) & Stage 2 (Dynamic Service Details Verification)</p>
                </div>
                <span className="text-xs text-slate-700 font-mono font-bold bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                  Database Schema Engine
                </span>
              </div>

              {loading ? (
                <div className="p-12 text-center text-slate-500 text-sm">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-900" />
                  <span>Loading service requests...</span>
                </div>
              ) : serviceRequests.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-sm">
                  No service provider requests found matching status filter &quot;{serviceStatusFilter}&quot;.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-900">
                    <thead className="bg-slate-50 text-xs uppercase font-bold text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4">User & Contact</th>
                        <th className="px-6 py-4">Main Service & Category</th>
                        <th className="px-6 py-4">Workflow Status</th>
                        <th className="px-6 py-4">Submitted Details & Photos</th>
                        <th className="px-6 py-4">Admin Governance Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {serviceRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4">
                            <div>
                              <div className="font-bold text-slate-900 text-sm">{req.user?.full_name || 'Platform User'}</div>
                              <div className="text-xs text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                                <Smartphone className="w-3.5 h-3.5 text-slate-700" />
                                <span>{req.user?.phone || 'N/A'}</span>
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                Account: <span className="text-emerald-700 font-bold">{req.user?.status || 'ACTIVE'}</span>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <div>
                              <div className="font-extrabold text-slate-900">{req.title}</div>
                              <div className="text-xs text-slate-600 font-mono mt-0.5">
                                Category: {req.category?.name || req.asset_type}
                              </div>
                              <p className="text-xs text-slate-500 mt-1 line-clamp-1">{req.description}</p>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            {getServiceStatusBadge(req.status)}
                          </td>

                          <td className="px-6 py-4 text-xs">
                            <button
                              onClick={() => setInspectingAsset(req)}
                              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 font-bold text-xs flex items-center gap-1.5 mb-1.5 transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Inspect Submitted Details & Photos</span>
                            </button>

                            {req.documents && Object.keys(req.documents).length > 0 ? (
                              <div className="text-[11px] font-mono text-slate-600 font-bold">
                                {Object.keys(req.documents).length} Dynamic Detail(s) Recorded
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">No details submitted yet</span>
                            )}
                            {req.rejection_reason && (
                              <div className="mt-1 text-rose-700 text-[11px] font-mono font-medium">
                                Rejection Reason: {req.rejection_reason}
                              </div>
                            )}
                          </td>

                          <td className="px-6 py-4 text-xs space-y-2">
                            {req.status === 'PENDING_APPROVAL' && (
                              <div className="flex flex-col gap-1.5">
                                <span className="text-[10px] font-extrabold text-amber-700 uppercase tracking-wider block">STAGE 1 DECISION</span>
                                <button
                                  onClick={() => handleApproveInitialRequest(req.id)}
                                  className="px-3.5 py-2 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-sm flex items-center gap-1.5"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Approve Stage 1 Request</span>
                                </button>
                              </div>
                            )}

                            {(req.status === 'UNDER_REVIEW' || req.status === 'VERIFICATION_PENDING') && (
                              <div className="flex flex-col gap-1.5">
                                <span className="text-[10px] font-extrabold text-indigo-700 uppercase tracking-wider block">STAGE 2 DECISION</span>
                                <button
                                  onClick={() => handleApproveDocuments(req.id)}
                                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Approve Details & Activate</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setRejectingAsset(req);
                                    setRejectionReasonInput('');
                                  }}
                                  className="px-3.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs flex items-center justify-center gap-1.5"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>Reject Details</span>
                                </button>
                              </div>
                            )}

                            {(req.status === 'ACTIVE' || req.status === 'DOCUMENTS_PENDING') && (
                              <button
                                onClick={() => {
                                  setRejectingAsset(req);
                                  setRejectionReasonInput('');
                                }}
                                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 text-xs font-semibold"
                              >
                                Reject / Suspend
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

        {/* TAB 3: Catalog & Service Offering Approvals */}
        {activeTab === 'catalog_approvals' && (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-extrabold uppercase text-slate-500 mr-1">Filter Offerings:</span>
                {[
                  { label: 'PENDING APPROVAL', value: 'PENDING_ADMIN_APPROVAL' },
                  { label: 'APPROVED & ACTIVE', value: 'ACTIVE_IN_CATALOG' },
                  { label: 'REJECTED', value: 'REJECTED' },
                  { label: 'ALL OFFERINGS', value: 'ALL' },
                ].map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setCatalogStatusFilter(f.value)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      catalogStatusFilter === f.value
                        ? 'bg-black text-white shadow-sm'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-black border border-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <button
                onClick={fetchAllAdminData}
                disabled={loading}
                className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 font-bold text-xs flex items-center gap-1.5 transition-colors shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh List</span>
              </button>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-extrabold text-lg text-slate-900">Vendor Service Offering Approvals ({catalogRequests.length})</h3>
                  <p className="text-xs text-slate-500 mt-1">Review vendor submitted sub-services & offerings before publishing to customer marketplace.</p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-amber-50 text-amber-800 border border-amber-200 font-mono">
                  Filter: {catalogStatusFilter}
                </span>
              </div>

              {loading ? (
                <div className="p-12 text-center text-slate-500 text-sm">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-900" />
                  <span>Loading pending catalog service offerings...</span>
                </div>
              ) : catalogRequests.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-sm space-y-2">
                  <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto" />
                  <span className="font-bold text-slate-800 block">No Pending Offering Requests</span>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">All vendor-created service offerings have been reviewed.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-900">
                    <thead className="bg-slate-50 text-xs uppercase font-bold text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4">Main Service & Vendor</th>
                        <th className="px-6 py-4">Offering Title & Components</th>
                        <th className="px-6 py-4">Offering Photos</th>
                        <th className="px-6 py-4">Pricing & Pickup Yard</th>
                        <th className="px-6 py-4">Admin Decision</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {catalogRequests.map((cat) => {
                        const attrs = cat.attributes || {};
                        const components: string[] = Array.isArray(attrs.included_components)
                          ? attrs.included_components
                          : ['Bricks'];

                        let catImages: string[] = [];
                        if (Array.isArray(cat.images)) {
                          catImages = cat.images;
                        } else if (typeof cat.images === 'string') {
                          try {
                            const parsed = JSON.parse(cat.images);
                            catImages = Array.isArray(parsed) ? parsed : [];
                          } catch {
                            if ((cat.images as string).startsWith('/')) {
                              catImages = [cat.images as string];
                            }
                          }
                        }

                        return (
                          <tr key={cat.id} className="hover:bg-slate-50 transition-colors">
                            {/* Main Service & Vendor */}
                            <td className="px-6 py-4">
                              <div className="space-y-1">
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 border border-slate-300 text-slate-900 uppercase">
                                  {cat.category?.name || 'Bricks & Building Materials'}
                                </span>
                                <div className="font-bold text-slate-900 text-sm">{cat.vendor_user?.full_name || 'Vendor Profile'}</div>
                                <div className="text-xs text-slate-500 font-mono">
                                  Phone: {cat.vendor_user?.phone || 'N/A'}
                                </div>
                                {cat.vendor_user?.trust_score && (
                                  <div className="text-[11px] text-emerald-700 font-bold">
                                    Trust Score: {cat.vendor_user.trust_score.toFixed(1)}/5.0
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Offering Title & Components */}
                            <td className="px-6 py-4">
                              <div className="space-y-2">
                                <div className="font-extrabold text-slate-900 text-base">{cat.title}</div>
                                <div className="space-y-1">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase">Included Components:</span>
                                  <div className="flex flex-wrap gap-1">
                                    {components.map((comp) => (
                                      <span key={comp} className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-900 text-[11px] font-bold">
                                        ✓ {comp}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                {cat.sku && <div className="text-[10px] text-slate-400 font-mono">SKU: {cat.sku}</div>}
                              </div>
                            </td>

                            {/* Offering Photos */}
                            <td className="px-6 py-4">
                              {catImages.length > 0 ? (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {catImages.slice(0, 3).map((imgUrl, i) => (
                                    <img
                                      key={i}
                                      src={imgUrl.startsWith('http') ? imgUrl : `http://localhost:8080${imgUrl}`}
                                      alt={`Offering photo ${i + 1}`}
                                      className="w-12 h-12 rounded-lg object-cover border border-slate-200"
                                    />
                                  ))}
                                  {catImages.length > 3 && (
                                    <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-1 rounded">
                                      +{catImages.length - 3}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400 italic">No photos</span>
                              )}
                            </td>

                            {/* Pricing & Pickup Yard */}
                            <td className="px-6 py-4 text-xs space-y-1">
                              <div className="font-bold text-slate-900 text-sm font-mono">
                                ₹{cat.unit_price} / {cat.price_unit ? cat.price_unit.replace('PER_', '').toLowerCase() : 'unit'}
                              </div>
                              <div className="text-slate-600 font-medium">MOQ: {cat.min_order_quantity || 1000} units</div>
                              <div className="flex items-start gap-1 text-slate-500 pt-1">
                                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                                <span className="truncate max-w-[180px]">{cat.pickup_address || 'Vendor Yard'}</span>
                              </div>
                            </td>

                            {/* Admin Decision Actions */}
                            <td className="px-6 py-4 text-xs space-y-2">
                              <button
                                onClick={() => handleApproveCatalogItem(cat.id)}
                                className="w-full px-4 py-2 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm"
                              >
                                <Check className="w-4 h-4" />
                                <span>Approve Offering</span>
                              </button>

                              <button
                                onClick={() => {
                                  setRejectingCatalogItem(cat);
                                  setCatalogRejectionReason('');
                                }}
                                className="w-full px-4 py-2 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                              >
                                <X className="w-4 h-4" />
                                <span>Reject Offering</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: USER DIRECTORY */}
        {activeTab === 'users' && (
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-extrabold text-lg text-slate-900">Registered Users Directory ({users.length})</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-100 text-xs uppercase font-bold text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4">User</th>
                    <th className="px-6 py-4">Mobile & Email</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Account Status</th>
                    <th className="px-6 py-4">Aadhaar</th>
                    <th className="px-6 py-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {users.map((u: any) => (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-900 shrink-0">
                            {u.avatar_url ? (
                              <img src={u.avatar_url} alt={u.full_name} className="w-10 h-10 rounded-full object-cover" />
                            ) : (
                              u.full_name?.[0] || 'U'
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-2">
                              <span>{u.full_name}</span>
                              {u.role === 'ADMIN' && (
                                <span className="px-2 py-0.5 rounded bg-black text-white text-[10px] font-bold">ADMIN</span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 font-mono">ID: {u.id.substring(0, 8)}...</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-slate-900 text-xs font-semibold">
                            <Smartphone className="w-3.5 h-3.5 text-black" />
                            <span>{u.phone || 'No Phone'}</span>
                          </div>
                          {u.email && (
                            <div className="flex items-center gap-1.5 text-slate-600 text-xs">
                              <Mail className="w-3.5 h-3.5 text-slate-500" />
                              <span>{u.email}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4 font-mono text-xs">{u.role || 'USER'}</td>

                      <td className="px-6 py-4">
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {u.status || 'ACTIVE'}
                        </span>
                      </td>

                      <td className="px-6 py-4 font-mono text-xs text-slate-800">{u.aadhaar_number || 'N/A'}</td>

                      <td className="px-6 py-4 text-xs">
                        {u.status === 'DEACTIVATED' || u.status === 'SUSPENDED' ? (
                          <button
                            onClick={() => handleUpdateStatus(u.id, 'ACTIVE')}
                            className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold"
                          >
                            Activate
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUpdateStatus(u.id, 'DEACTIVATED')}
                            className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200 text-xs font-semibold"
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
            <div className="lg:col-span-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-black" />
                  <span>Service Categories ({categories.length})</span>
                </h3>
                <button
                  onClick={() => setShowCategoryModal(true)}
                  className="px-2.5 py-1.5 rounded-xl bg-black hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1 border border-black shadow-sm"
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
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-black font-medium"
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
                            ? 'bg-black text-white border-black shadow-sm'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                        }`}
                      >
                        <div className="space-y-1 truncate pr-2">
                          <div className="font-bold text-xs flex items-center gap-2 truncate">
                            <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white' : 'bg-slate-400'}`} />
                            <span className="truncate">{cat.name}</span>
                          </div>
                          <div className={`text-[10px] font-mono truncate pl-4 ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                            slug: {cat.slug}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold font-mono border ${
                            isSelected ? 'bg-slate-800 text-white border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}>
                            {reqCount} Req / {oppCount} Form
                          </span>
                          <span className={`text-[9px] font-mono uppercase ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>{cat.default_workflow}</span>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Right Workspace: Configuration Workspace for Selected Category */}
            <div className="lg:col-span-8 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
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
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xl font-extrabold text-slate-900">{selectedCat.name}</h3>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200">
                            {selectedCat.slug}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">{selectedCat.description || 'Dynamic Service Category Configuration'}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDeleteCategory(selectedCat.id)}
                          className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-xs font-bold flex items-center gap-1 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Category</span>
                        </button>
                      </div>
                    </div>

                    {/* Sub-Tab Navigation Header */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200">
                      <button
                        onClick={() => setCatSubTab('PROVIDER_VERIFICATION')}
                        className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                          catSubTab === 'PROVIDER_VERIFICATION'
                            ? 'bg-black text-white shadow-sm'
                            : 'text-slate-700 hover:text-black hover:bg-slate-200/60'
                        }`}
                      >
                        <ShieldCheck className="w-4 h-4 shrink-0" />
                        <span className="truncate">1. Provider Verification ({selectedCat.required_documents?.length || 0})</span>
                      </button>

                      <button
                        onClick={() => setCatSubTab('NEED_OFFER_FIELDS')}
                        className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                          catSubTab === 'NEED_OFFER_FIELDS'
                            ? 'bg-black text-white shadow-sm'
                            : 'text-slate-700 hover:text-black hover:bg-slate-200/60'
                        }`}
                      >
                        <FileText className="w-4 h-4 shrink-0" />
                        <span className="truncate">2. Form Specifications ({selectedCat.opportunity_fields?.length || 0})</span>
                      </button>

                      <button
                        onClick={() => setCatSubTab('RESOURCE_LOGISTICS')}
                        className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                          catSubTab === 'RESOURCE_LOGISTICS'
                            ? 'bg-black text-white shadow-sm'
                            : 'text-slate-700 hover:text-black hover:bg-slate-200/60'
                        }`}
                      >
                        <Truck className="w-4 h-4 shrink-0" />
                        <span className="truncate">3. Resource & Logistics ({selectedCat.resources?.length || 0})</span>
                      </button>
                    </div>

                    {/* SUB-TAB 1: PROVIDER VERIFICATION REQUIREMENTS */}
                    {catSubTab === 'PROVIDER_VERIFICATION' && (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                            Configured Verification Fields for Service Onboarding
                          </h4>
                          <span className="text-[11px] text-slate-600 font-medium">Reorder, edit, or remove required provider specs</span>
                        </div>

                        {/* Interactive Field List with Reorder & Delete */}
                        <div className="space-y-2">
                          {(!selectedCat.required_documents || selectedCat.required_documents.length === 0) ? (
                            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center text-slate-600 text-xs italic">
                              No custom provider verification fields configured yet. Add fields below.
                            </div>
                          ) : (
                            selectedCat.required_documents.map((req, idx) => (
                              <div
                                key={req.key + idx}
                                className="p-3.5 rounded-2xl bg-white border border-slate-200 flex items-center justify-between gap-3 group hover:border-black transition-colors shadow-sm"
                              >
                                <div className="flex items-center gap-3 truncate">
                                  {/* Reorder Buttons */}
                                  <div className="flex flex-col gap-0.5">
                                    <button
                                      disabled={idx === 0}
                                      onClick={() => handleMoveReqField(selectedCat, idx, idx - 1)}
                                      className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-black disabled:opacity-30"
                                      title="Move Up"
                                    >
                                      <ChevronUp className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      disabled={idx === (selectedCat.required_documents?.length || 0) - 1}
                                      onClick={() => handleMoveReqField(selectedCat, idx, idx + 1)}
                                      className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-black disabled:opacity-30"
                                      title="Move Down"
                                    >
                                      <ChevronDown className="w-3.5 h-3.5" />
                                    </button>
                                  </div>

                                  <div>
                                    <div className="font-bold text-xs text-slate-900 flex items-center gap-2">
                                      <span>{req.label}</span>
                                      {req.required && <span className="text-rose-600 text-[10px] font-bold">*Required</span>}
                                    </div>
                                    <div className="text-[10px] text-slate-600 font-mono flex items-center gap-2 mt-0.5">
                                      <span>key: {req.key}</span>
                                      {req.description && <span className="italic truncate max-w-[250px]">- {req.description}</span>}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 border border-slate-200 text-[10px] font-mono font-bold uppercase">
                                    {req.type}
                                  </span>
                                  <button
                                    onClick={() => handleDeleteReqField(selectedCat, idx)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
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
                        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                          <h5 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                            <Plus className="w-4 h-4 text-black" />
                            <span>Add Provider Verification Field to Checklist</span>
                          </h5>

                          <div className="grid sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Field Label *</label>
                              <input
                                type="text"
                                value={newFieldLabel}
                                onChange={(e) => {
                                  setNewFieldLabel(e.target.value);
                                  if (!newFieldKey) setNewFieldKey(e.target.value.toLowerCase().replace(/\s+/g, '_'));
                                }}
                                placeholder="e.g. Trade License Document PDF"
                                className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-xs font-medium focus:outline-none focus:border-black"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Field Type *</label>
                              <select
                                value={newFieldType}
                                onChange={(e) => setNewFieldType(e.target.value as any)}
                                className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs font-medium focus:outline-none focus:border-black"
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
                              <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Description / Help Text</label>
                              <input
                                type="text"
                                value={newFieldDesc}
                                onChange={(e) => setNewFieldDesc(e.target.value)}
                                placeholder="e.g. Upload scanned copy of municipal license"
                                className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-xs font-medium focus:outline-none focus:border-black"
                              />
                            </div>

                            {newFieldType === 'select' ? (
                              <div>
                                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Dropdown Options (Comma-separated)</label>
                                <input
                                  type="text"
                                  value={newFieldOptions}
                                  onChange={(e) => setNewFieldOptions(e.target.value)}
                                  placeholder="Option 1, Option 2, Option 3"
                                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-xs font-medium focus:outline-none focus:border-black"
                                />
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 pt-4">
                                <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={newFieldRequired}
                                    onChange={(e) => setNewFieldRequired(e.target.checked)}
                                    className="w-4 h-4 rounded bg-white border-slate-300 text-black focus:ring-black"
                                  />
                                  <span>Mark as Required Field</span>
                                </label>
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleAddReqFieldDirect(selectedCat)}
                            className="px-4 py-2.5 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-sm flex items-center gap-1.5"
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
                          <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                            Configured Dynamic Fields for Need/Offer Posting Form
                          </h4>
                          <span className="text-[11px] text-slate-600 font-medium">Loaded automatically when user creates Need or Offer</span>
                        </div>

                        {/* Interactive Field List with Reorder & Delete */}
                        <div className="space-y-2">
                          {(!selectedCat.opportunity_fields || selectedCat.opportunity_fields.length === 0) ? (
                            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center text-slate-600 text-xs italic">
                              No custom opportunity fields configured yet. Standard fields are used. Add custom fields below.
                            </div>
                          ) : (
                            selectedCat.opportunity_fields.map((field, idx) => (
                              <div
                                key={field.key + idx}
                                className="p-3.5 rounded-2xl bg-white border border-slate-200 flex items-center justify-between gap-3 group hover:border-black transition-colors shadow-sm"
                              >
                                <div className="flex items-center gap-3 truncate">
                                  {/* Reorder Buttons */}
                                  <div className="flex flex-col gap-0.5">
                                    <button
                                      disabled={idx === 0}
                                      onClick={() => handleMoveOppField(selectedCat, idx, idx - 1)}
                                      className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-black disabled:opacity-30"
                                      title="Move Up"
                                    >
                                      <ChevronUp className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      disabled={idx === (selectedCat.opportunity_fields?.length || 0) - 1}
                                      onClick={() => handleMoveOppField(selectedCat, idx, idx + 1)}
                                      className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-black disabled:opacity-30"
                                      title="Move Down"
                                    >
                                      <ChevronDown className="w-3.5 h-3.5" />
                                    </button>
                                  </div>

                                  <div>
                                    <div className="font-bold text-xs text-slate-900 flex items-center gap-2">
                                      <span>{field.label}</span>
                                      {field.required && <span className="text-rose-600 text-[10px] font-bold">*Required</span>}
                                    </div>
                                    <div className="text-[10px] text-slate-600 font-mono flex items-center gap-2 mt-0.5">
                                      <span>key: {field.key}</span>
                                      {field.options && field.options.length > 0 && (
                                        <span className="text-slate-600 font-sans truncate max-w-[250px]">[{field.options.join(', ')}]</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 border border-slate-200 text-[10px] font-mono font-bold uppercase">
                                    {field.type}
                                  </span>
                                  <button
                                    onClick={() => handleDeleteOppField(selectedCat, idx)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
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
                        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                          <h5 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                            <Plus className="w-4 h-4 text-black" />
                            <span>Add Custom Opportunity Form Field</span>
                          </h5>

                          <div className="grid sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Field Label *</label>
                              <input
                                type="text"
                                value={newOppLabel}
                                onChange={(e) => {
                                  setNewOppLabel(e.target.value);
                                  if (!newOppKey) setNewOppKey(e.target.value.toLowerCase().replace(/\s+/g, '_'));
                                }}
                                placeholder="e.g. Quantity Needed / Available"
                                className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-xs font-medium focus:outline-none focus:border-black"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Field Type *</label>
                              <select
                                value={newOppType}
                                onChange={(e) => setNewOppType(e.target.value as any)}
                                className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs font-medium focus:outline-none focus:border-black"
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
                                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Dropdown Options (Comma-separated)</label>
                                <input
                                  type="text"
                                  value={newOppOptions}
                                  onChange={(e) => setNewOppOptions(e.target.value)}
                                  placeholder="Option 1, Option 2, Option 3"
                                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-xs font-medium focus:outline-none focus:border-black"
                                />
                              </div>
                            ) : (
                              <div>
                                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Field Key (DB Name)</label>
                                <input
                                  type="text"
                                  value={newOppKey}
                                  onChange={(e) => setNewOppKey(e.target.value)}
                                  placeholder="e.g. quantity_needed"
                                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-xs font-mono focus:outline-none focus:border-black"
                                />
                              </div>
                            )}

                            <div className="flex items-center gap-2 pt-4">
                              <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={newOppReq}
                                  onChange={(e) => setNewOppReq(e.target.checked)}
                                  className="w-4 h-4 rounded bg-white border-slate-300 text-black focus:ring-black"
                                />
                                <span>Mark as Required Field</span>
                              </label>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleAddOppFieldDirect(selectedCat)}
                            className="px-4 py-2.5 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-sm flex items-center gap-1.5"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Opportunity Form Field</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* SUB-TAB 3: RESOURCE & LOGISTICS REQUIREMENTS */}
                    {catSubTab === 'RESOURCE_LOGISTICS' && (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                          <div>
                            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                              <Truck className="w-4 h-4 text-black" />
                              <span>Configured Service Resources & Logistics Arrangements</span>
                            </h4>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Configure vehicle, driver, loading, unloading, heavy equipment, and labour resources for <strong>{selectedCat.name}</strong>. Options dynamically drive the customer Request What You Need form.
                            </p>
                          </div>
                          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200">
                            {selectedCat.resources?.length || 0} Resource Type(s)
                          </span>
                        </div>

                        {/* Resource Cards List */}
                        <div className="space-y-4">
                          {(!selectedCat.resources || selectedCat.resources.length === 0) ? (
                            <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200 text-center text-slate-600 text-xs italic space-y-2">
                              <Truck className="w-8 h-8 text-slate-400 mx-auto" />
                              <span className="font-bold text-slate-800 block">No Custom Resources Configured for this Category</span>
                              <p className="text-slate-500 max-w-sm mx-auto">Add resources such as Vehicle, Driver, Loading/Unloading, or Heavy Machinery below.</p>
                            </div>
                          ) : (
                            selectedCat.resources.map((res, resIdx) => (
                              <div
                                key={res.key + resIdx}
                                className={`p-5 rounded-2xl border transition-all space-y-4 ${
                                  res.active
                                    ? 'bg-white border-slate-300 shadow-sm hover:border-black'
                                    : 'bg-slate-50 border-slate-200 opacity-60'
                                }`}
                              >
                                {/* Header / Governance Bar */}
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                                  <div className="flex items-center gap-3">
                                    {/* Reorder Buttons */}
                                    <div className="flex flex-col gap-0.5">
                                      <button
                                        disabled={resIdx === 0}
                                        onClick={() => handleMoveResource(selectedCat, resIdx, resIdx - 1)}
                                        className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-black disabled:opacity-30"
                                        title="Move Up"
                                      >
                                        <ChevronUp className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        disabled={resIdx === (selectedCat.resources?.length || 0) - 1}
                                        onClick={() => handleMoveResource(selectedCat, resIdx, resIdx + 1)}
                                        className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-black disabled:opacity-30"
                                        title="Move Down"
                                      >
                                        <ChevronDown className="w-3.5 h-3.5" />
                                      </button>
                                    </div>

                                    <div>
                                      <div className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                                        <span>{res.name}</span>
                                        <span className="text-[10px] font-mono text-slate-500 font-semibold">(key: {res.key})</span>
                                      </div>
                                      <p className="text-xs text-slate-500 mt-0.5">{res.description || `Customer requirement rule for ${res.name}`}</p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-3">
                                    {/* Requirement Level Select */}
                                    <select
                                      value={res.requirement_level || 'OPTIONAL'}
                                      onChange={(e) => handleSetResourceRequirementLevel(selectedCat, resIdx, e.target.value as any)}
                                      className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-900 text-xs font-extrabold focus:outline-none focus:border-black"
                                    >
                                      <option value="REQUIRED">REQUIRED FOR SERVICE</option>
                                      <option value="OPTIONAL">OPTIONAL FOR SERVICE</option>
                                      <option value="NOT_APPLICABLE">NOT APPLICABLE (DISABLE)</option>
                                    </select>

                                    {/* Enable/Disable Toggle */}
                                    <button
                                      type="button"
                                      onClick={() => handleToggleResourceActive(selectedCat, resIdx)}
                                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all border ${
                                        res.active
                                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                          : 'bg-slate-200 text-slate-600 border-slate-300 hover:bg-slate-300'
                                      }`}
                                    >
                                      {res.active ? 'ENABLED' : 'DISABLED'}
                                    </button>

                                    {/* Delete Resource */}
                                    <button
                                      onClick={() => handleDeleteResource(selectedCat, resIdx)}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                      title="Delete Resource"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>

                                {/* Configured Choices Section */}
                                <div className="space-y-2">
                                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 block">
                                    Configured Customer Form Availability Choices ({res.options?.length || 0}):
                                  </span>
                                  <div className="grid sm:grid-cols-3 gap-2">
                                    {(res.options || []).map((opt) => (
                                      <div key={opt.key} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                                        <span className="font-bold text-slate-900 block">{opt.label}</span>
                                        <span className="text-[10px] text-slate-500 font-mono block mt-0.5">{opt.description}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Detail Fields for Customer-Provided Option */}
                                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                                      Conditional Detail Fields (Shown when customer selects &quot;I Have It&quot;)
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setResFieldTargetIdx(resFieldTargetIdx === resIdx ? null : resIdx)}
                                      className="px-2.5 py-1 rounded-lg bg-black text-white hover:bg-slate-800 text-[11px] font-bold flex items-center gap-1"
                                    >
                                      <Plus className="w-3 h-3" />
                                      <span>Add Detail Field</span>
                                    </button>
                                  </div>

                                  {(!res.fields || res.fields.length === 0) ? (
                                    <div className="text-slate-500 text-xs italic">No conditional detail fields defined yet.</div>
                                  ) : (
                                    <div className="grid sm:grid-cols-2 gap-2">
                                      {res.fields.map((rf, rfIdx) => (
                                        <div key={rf.key + rfIdx} className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2">
                                          <div>
                                            <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                                              <span>{rf.label}</span>
                                              {rf.required && <span className="text-rose-600 text-[10px] font-bold">*Required</span>}
                                            </div>
                                            <div className="text-[10px] text-slate-500 font-mono">key: {rf.key} ({rf.type})</div>
                                          </div>
                                          <button
                                            onClick={() => handleDeleteFieldFromResource(selectedCat, resIdx, rfIdx)}
                                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                            title="Delete Field"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Inline Add Detail Field Form */}
                                  {resFieldTargetIdx === resIdx && (
                                    <div className="p-4 rounded-xl bg-white border border-slate-300 space-y-3 mt-2 animate-in fade-in duration-150">
                                      <span className="text-xs font-bold text-slate-900 block">Add Detail Field to {res.name}</span>
                                      <div className="grid sm:grid-cols-2 gap-2">
                                        <input
                                          type="text"
                                          placeholder="Field Label e.g. Registration Number"
                                          value={newResFieldLabel}
                                          onChange={(e) => {
                                            setNewResFieldLabel(e.target.value);
                                            if (!newResFieldKey) setNewResFieldKey(e.target.value.toLowerCase().replace(/\s+/g, '_'));
                                          }}
                                          className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-xs font-medium focus:outline-none focus:border-black"
                                        />
                                        <select
                                          value={newResFieldType}
                                          onChange={(e) => setNewResFieldType(e.target.value as any)}
                                          className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-xs font-medium focus:outline-none focus:border-black"
                                        >
                                          <option value="text">Text Input</option>
                                          <option value="number">Number</option>
                                          <option value="select">Dropdown Select</option>
                                          <option value="date">Date</option>
                                          <option value="textarea">Long Text</option>
                                        </select>
                                      </div>
                                      {newResFieldType === 'select' && (
                                        <input
                                          type="text"
                                          placeholder="Dropdown Options (Comma-separated) e.g. 10-Wheeler, Trailer"
                                          value={newResFieldOptions}
                                          onChange={(e) => setNewResFieldOptions(e.target.value)}
                                          className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-xs font-medium focus:outline-none focus:border-black"
                                        />
                                      )}
                                      <div className="flex items-center justify-between pt-1">
                                        <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={newResFieldReq}
                                            onChange={(e) => setNewResFieldReq(e.target.checked)}
                                            className="w-4 h-4 rounded bg-white border-slate-300 text-black focus:ring-black"
                                          />
                                          <span>Mark as Required Field</span>
                                        </label>
                                        <div className="flex gap-2">
                                          <button
                                            type="button"
                                            onClick={() => setResFieldTargetIdx(null)}
                                            className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold hover:bg-slate-100"
                                          >
                                            Cancel
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleAddFieldToResource(selectedCat, resIdx)}
                                            className="px-4 py-1.5 rounded-lg bg-black text-white text-xs font-bold hover:bg-slate-800"
                                          >
                                            Save Detail Field
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Add Resource Inline Form */}
                        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                          <h5 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                            <Plus className="w-4 h-4 text-black" />
                            <span>Configure New Resource / Requirement for {selectedCat.name}</span>
                          </h5>

                          <div className="grid sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Resource Name *</label>
                              <input
                                type="text"
                                value={newResName}
                                onChange={(e) => {
                                  setNewResName(e.target.value);
                                  if (!newResKey) setNewResKey(e.target.value.toLowerCase().replace(/\s+/g, '_'));
                                }}
                                placeholder="e.g. Loading & Unloading Crew / Heavy Equipment"
                                className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-xs font-medium focus:outline-none focus:border-black"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Requirement Level *</label>
                              <select
                                value={newResLevel}
                                onChange={(e) => setNewResLevel(e.target.value as any)}
                                className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs font-medium focus:outline-none focus:border-black"
                              >
                                <option value="REQUIRED">REQUIRED FOR SERVICE</option>
                                <option value="OPTIONAL">OPTIONAL FOR SERVICE</option>
                                <option value="NOT_APPLICABLE">NOT APPLICABLE</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Description / Help Text</label>
                              <input
                                type="text"
                                value={newResDesc}
                                onChange={(e) => setNewResDesc(e.target.value)}
                                placeholder="e.g. Specify whether customer provides crew or vendor arranges"
                                className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-xs font-medium focus:outline-none focus:border-black"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Resource Key (DB Name)</label>
                              <input
                                type="text"
                                value={newResKey}
                                onChange={(e) => setNewResKey(e.target.value)}
                                placeholder="e.g. loading_crew"
                                className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-xs font-mono focus:outline-none focus:border-black"
                              />
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleAddResourceDirect(selectedCat)}
                            className="px-4 py-2.5 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-sm flex items-center gap-1.5"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Resource Configuration</span>
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
            <div className="bg-white p-6 rounded-3xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
              <div>
                <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase bg-slate-100 text-slate-900 border border-slate-300">
                  REAL DATABASE ORDERS & TECHNICAL WORKFLOW GOVERNANCE
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 pt-1">All Platform Orders ({adminOpportunities.length})</h2>
                <p className="text-xs text-slate-600 mt-0.5">Comprehensive admin view of underlying orders, customers, recipients, providers, locations, and technical workflows.</p>
              </div>

              <button
                onClick={fetchAllAdminData}
                className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold text-xs flex items-center justify-center gap-2 shrink-0"
              >
                <RefreshCw className={`w-4 h-4 text-amber-400 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh Orders</span>
              </button>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 uppercase font-mono font-bold border-b border-slate-200">
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
                  <tbody className="divide-y divide-slate-100 font-medium">
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
                          <tr key={opp.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-4 font-mono">
                              <span className="text-black font-extrabold block">#UOP-{opp.id.slice(0, 8).toUpperCase()}</span>
                              <span className="text-[10px] text-slate-500 block">{formattedDate}</span>
                            </td>

                            <td className="px-4 py-4">
                              <span className="text-slate-900 font-bold block">{customerName}</span>
                              <span className="text-slate-500 text-[11px] block">{customerPhone}</span>
                              {recipient.recipientName && (
                                <span className="text-emerald-700 font-bold text-[10px] block mt-0.5">
                                  For: {recipient.recipientName} ({recipient.recipientPhone || 'N/A'})
                                </span>
                              )}
                            </td>

                            <td className="px-4 py-4">
                              <span className="text-slate-900 font-bold block">{catName}</span>
                              <span className="text-slate-800 font-extrabold font-mono text-xs block">{rawQuantity} units</span>
                            </td>

                            <td className="px-4 py-4 max-w-[220px]">
                              <span className="text-slate-800 font-medium text-[11px] block truncate" title={meta.pickup_location || 'Source Yard'}>
                                📦 Pickup: {meta.pickup_location || 'Source Yard'}
                              </span>
                              <span className="text-slate-600 text-[11px] block truncate" title={opp.address_text || meta.delivery_location}>
                                📍 Delivery: {opp.address_text || meta.delivery_location || 'Delivery Site'}
                              </span>
                            </td>

                            <td className="px-4 py-4 font-mono">
                              <span className={`px-2 py-0.5 rounded text-[11px] font-bold block w-fit ${
                                providerInfo !== 'Pending Matching'
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}>
                                {providerInfo}
                              </span>
                            </td>

                            <td className="px-4 py-4 font-mono">
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-900 border border-slate-300 block w-fit mb-1">
                                {opp.status}
                              </span>
                              {opp.budget_max && (
                                <span className="text-slate-900 font-bold block text-xs">₹{Number(opp.budget_max).toLocaleString()}</span>
                              )}
                            </td>

                            <td className="px-4 py-4 font-mono text-[10px]">
                              <span className="text-slate-900 font-bold block">Model: {opp.workflow_model || 'INSTANT'}</span>
                              <span className="text-slate-500 block truncate max-w-[140px]">UUID: {opp.id}</span>
                              {opp.parent_opportunity_id && (
                                <span className="text-slate-600 block truncate max-w-[140px]">Parent: {opp.parent_opportunity_id}</span>
                              )}
                            </td>

                            <td className="px-4 py-4 text-right">
                              <Link
                                href={`/opportunities/${opp.id}`}
                                className="px-3 py-1.5 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs inline-flex items-center gap-1 transition-all shadow-sm"
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
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-3xl border border-slate-200 w-full max-w-2xl space-y-6 relative max-h-[90vh] overflow-y-auto shadow-xl text-slate-900">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <Eye className="w-5 h-5 text-black" />
                    <span>Verification Inspection: {inspectingAsset.title}</span>
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    User: <strong className="text-slate-900">{inspectingAsset.user?.full_name}</strong> ({inspectingAsset.user?.phone}) | Category: <strong className="text-slate-900">{inspectingAsset.category?.name || inspectingAsset.asset_type}</strong>
                  </p>
                </div>
                <button onClick={() => setInspectingAsset(null)} className="text-slate-400 hover:text-slate-900 font-bold text-lg">✕</button>
              </div>

              {/* Checklist & Verification Status summary */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">Service Status</span>
                  {getServiceStatusBadge(inspectingAsset.status)}
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">User Aadhaar Status</span>
                  <div className="text-xs font-mono text-emerald-700 font-bold flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4" />
                    <span>Aadhaar: {inspectingAsset.documents ? (inspectingAsset.documents as any)['aadhaar_number'] || inspectingAsset.user?.aadhaar_number || 'Recorded' : 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Requirement Checklist */}
              {inspectingAsset.category?.required_documents && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Required Field Verification Checklist</h4>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                    {inspectingAsset.category.required_documents.map((req) => {
                      const hasDoc = inspectingAsset.documents && (inspectingAsset.documents as any)[req.key];
                      return (
                        <div key={req.key} className="flex items-center justify-between text-xs border-b border-slate-200 pb-1.5">
                          <span className="text-slate-800 font-medium">{req.label}</span>
                          {hasDoc ? (
                            <span className="text-emerald-700 font-bold flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Completed</span>
                          ) : req.required ? (
                            <span className="text-rose-700 font-bold flex items-center gap-1"><X className="w-3.5 h-3.5" /> Missing</span>
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
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Submitted Details, Documents, Photos & Videos</h4>

                {!inspectingAsset.documents || Object.keys(inspectingAsset.documents).length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-xs italic border border-slate-200 rounded-2xl bg-slate-50">
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
                        <div key={k} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">{k}</span>
                            <span className="text-[10px] text-slate-500 font-mono">Submitted Value</span>
                          </div>

                          {isImg && (
                            <div className="space-y-2">
                              <img src={valStr} alt={k} className="max-h-48 rounded-xl object-cover border border-slate-300 shadow-sm" />
                              <a href={valStr} target="_blank" rel="noreferrer" className="text-[11px] font-mono text-black underline block">
                                Open Original Image URL: {valStr}
                              </a>
                            </div>
                          )}

                          {isPdf && (
                            <div className="p-3 rounded-xl bg-white border border-slate-300 flex items-center justify-between shadow-sm">
                              <div className="flex items-center gap-2 text-xs text-slate-900">
                                <File className="w-4 h-4 text-black" />
                                <span>PDF Document: {valStr}</span>
                              </div>
                              <a href={valStr} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg bg-black hover:bg-slate-800 text-white text-xs font-bold shadow-sm">
                                View PDF Document →
                              </a>
                            </div>
                          )}

                          {isVid && (
                            <div className="space-y-2">
                              <video src={valStr} controls className="w-full max-h-56 rounded-xl border border-slate-300 object-cover" />
                              <a href={valStr} target="_blank" rel="noreferrer" className="text-[11px] font-mono text-black underline block">
                                Video URL: {valStr}
                              </a>
                            </div>
                          )}

                          {isArr && (
                            <div className="flex flex-wrap gap-3">
                              {val.map((itemUrl: string, idx: number) => (
                                <div key={idx} className="space-y-1">
                                  {itemUrl.endsWith('.mp4') || itemUrl.endsWith('.webm') ? (
                                    <video src={itemUrl} controls className="w-36 h-28 rounded-lg object-cover border border-slate-300" />
                                  ) : itemUrl.endsWith('.pdf') ? (
                                    <a href={itemUrl} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs font-mono text-black block hover:bg-slate-50">
                                      View PDF #{idx + 1}
                                    </a>
                                  ) : (
                                    <img src={itemUrl} alt={`Upload ${idx}`} className="w-24 h-24 rounded-lg object-cover border border-slate-300" />
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {!isImg && !isPdf && !isVid && !isArr && (
                            <div className="p-3 rounded-xl bg-white border border-slate-200 font-mono text-xs text-slate-800">
                              {valStr}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-200 flex gap-3">
                {inspectingAsset.status === 'PENDING_APPROVAL' && (
                  <button
                    onClick={() => handleApproveInitialRequest(inspectingAsset.id)}
                    className="w-full py-3 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs shadow-sm"
                  >
                    Approve Request to Unlock Document Submission
                  </button>
                )}

                {(inspectingAsset.status === 'UNDER_REVIEW' || inspectingAsset.status === 'VERIFICATION_PENDING') && (
                  <>
                    <button
                      onClick={() => handleApproveDocuments(inspectingAsset.id)}
                      className="w-1/2 py-3 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs shadow-sm"
                    >
                      Approve Verification & Activate Service
                    </button>
                    <button
                      onClick={() => {
                        setRejectingAsset(inspectingAsset);
                        setRejectionReasonInput('');
                      }}
                      className="w-1/2 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm"
                    >
                      Reject Verification with Reason
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal Dialog for Catalog Item Rejection Reason */}
        {rejectingCatalogItem && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-3xl border border-slate-200 w-full max-w-md space-y-6 relative shadow-xl text-slate-900">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                  <span>Reject Catalog Listing</span>
                </h3>
                <button onClick={() => setRejectingCatalogItem(null)} className="text-slate-400 hover:text-slate-900 font-bold text-lg">✕</button>
              </div>

              <form onSubmit={handleRejectCatalogSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Rejection Reason *</label>
                  <textarea
                    rows={3}
                    value={catalogRejectionReason}
                    onChange={(e) => setCatalogRejectionReason(e.target.value)}
                    placeholder="e.g. Incomplete transport pricing model specified / Storage yard address verification failed"
                    className="w-full p-3.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-black placeholder-slate-400"
                    required
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setRejectingCatalogItem(null)}
                    className="w-1/2 py-3 rounded-xl bg-white text-slate-700 font-semibold text-xs border border-slate-300 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="w-1/2 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-2"
                  >
                    Reject Listing
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Dialog for Rejection Reason */}
        {rejectingAsset && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-3xl border border-slate-200 w-full max-w-md space-y-6 relative shadow-xl text-slate-900">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                  <span>Reject Service Request / Verification</span>
                </h3>
                <button onClick={() => setRejectingAsset(null)} className="text-slate-400 hover:text-slate-900 font-bold text-lg">✕</button>
              </div>

              <form onSubmit={handleRejectSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Rejection Reason *</label>
                  <textarea
                    rows={3}
                    value={rejectionReasonInput}
                    onChange={(e) => setRejectionReasonInput(e.target.value)}
                    placeholder="e.g. Invalid document image provided / Clear registration number required"
                    className="w-full p-3.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-black placeholder-slate-400"
                    required
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setRejectingAsset(null)}
                    className="w-1/2 py-3 rounded-xl bg-white text-slate-700 font-semibold text-xs border border-slate-300 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingReject}
                    className="w-1/2 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-2"
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
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-3xl border border-slate-200 w-full max-w-md space-y-6 relative shadow-xl text-slate-900">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-black" />
                  <span>Invite / Create User</span>
                </h3>
                <button onClick={() => setShowInviteModal(false)} className="text-slate-400 hover:text-slate-900 font-bold text-lg">✕</button>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  {error}
                </div>
              )}

              {inviteResult ? (
                <div className="space-y-4 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-center">
                  <CheckCircle className="w-10 h-10 text-emerald-600 mx-auto" />
                  <h4 className="font-bold text-slate-900 text-base">User Created & OTP Dispatched!</h4>
                  <div className="p-3 rounded-xl bg-white text-left space-y-1 font-mono text-xs border border-slate-200">
                    <div className="text-slate-600">Mobile OTP Code: <strong className="text-emerald-700 text-sm">{inviteResult.otp_code || '123456'}</strong></div>
                    <div className="text-slate-600">Phone: {inviteResult.phone}</div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleInviteSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Full Name *</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-black placeholder-slate-400"
                      placeholder="Ramesh Kumar"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Mobile Phone Number *</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        setError('');
                        setPhone(sanitizePhoneInput(e.target.value));
                      }}
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-black placeholder-slate-400"
                      placeholder="+919876543210"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">User Role</label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-black"
                    >
                      <option value="USER">USER (Customer & Provider)</option>
                      <option value="ADMIN">ADMIN (System Governance)</option>
                    </select>
                  </div>

                  <div className="pt-2 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowInviteModal(false)}
                      className="w-1/2 py-3 rounded-xl bg-white text-slate-700 font-semibold text-xs border border-slate-300 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={inviting}
                      className="w-1/2 py-3 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-2"
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
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-3xl border border-slate-200 w-full max-w-md space-y-6 relative shadow-xl text-slate-900">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-black" />
                  <span>Create Service Category</span>
                </h3>
                <button onClick={() => setShowCategoryModal(false)} className="text-slate-400 hover:text-slate-900 font-bold text-lg">✕</button>
              </div>

              <form onSubmit={handleCreateCategorySubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Category Name *</label>
                  <input
                    type="text"
                    value={catName}
                    onChange={(e) => setCatName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-black placeholder-slate-400"
                    placeholder="e.g. Solar Panel Maintenance"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Description</label>
                  <input
                    type="text"
                    value={catDesc}
                    onChange={(e) => setCatDesc(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-black placeholder-slate-400"
                    placeholder="Solar panel cleaning, inverter repair & battery testing"
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCategoryModal(false)}
                    className="w-1/2 py-3 rounded-xl bg-white text-slate-700 font-semibold text-xs border border-slate-300 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingCat}
                    className="w-1/2 py-3 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-2"
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

export default function AdminUserManagementPage() {
  return (
    <React.Suspense fallback={
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    }>
      <AdminUserManagementContent />
    </React.Suspense>
  );
}

