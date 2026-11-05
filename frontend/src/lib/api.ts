export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';

import {
  getAccessToken,
  storeTokens,
  clearAllSessionStorage,
  getRefreshToken,
  hasStoredTokens,
} from './authSession';

export const isAdminRole = (role?: string): boolean => role === 'ADMIN' || role === 'SUPER_ADMIN';

export interface UserProfile {
  id: string;
  supabase_uid: string;
  email?: string;
  phone?: string;
  full_name: string;
  avatar_url?: string;
  bio?: string;
  lat: number;
  lng: number;
  address_text?: string;
  aadhaar_number?: string;
  trust_score: number;
  is_verified: boolean;
  status?: string;
  role?: string;
  mobile_verified?: boolean;
  otp_code?: string;
  face_verified?: boolean;
  is_suspended?: boolean;
  suspension_reason?: string;
}

export interface UserAddress {
  id: string;
  user_id: string;
  label: string;
  address_text: string;
  lat: number;
  lng: number;
  landmark?: string;
  receiver_name?: string;
  receiver_phone?: string;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}


export interface OpportunityFieldSpec {
  key: string;
  label: string;
  description?: string;
  type: 'text' | 'number' | 'select' | 'date' | 'datetime' | 'location' | 'photo' | 'video' | 'file' | 'textarea';
  required?: boolean;
  placeholder?: string;
  options?: string[];
  validation?: Record<string, any>;
}

export interface RequiredDocumentSpec {
  key: string;
  label: string;
  description?: string;
  type: 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'textarea' | 'image' | 'pdf' | 'multi_image' | 'multi_pdf' | 'video' | 'multi_video' | 'url';
  required: boolean;
  allowed_file_types?: string[];
  max_file_size_mb?: number;
  max_files?: number;
  options?: string[];
  requires_admin_review?: boolean;
}

export interface ResourceFieldConfig {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'date' | 'checkbox' | 'textarea';
  required?: boolean;
  placeholder?: string;
  options?: string[];
}

export interface ResourceOptionConfig {
  key: string;
  label: string;
  description?: string;
}

export interface ResourceConfig {
  id?: string;
  key: string;
  name: string;
  description?: string;
  requirement_level: 'REQUIRED' | 'OPTIONAL' | 'NOT_APPLICABLE';
  active: boolean;
  display_order?: number;
  options?: ResourceOptionConfig[];
  fields?: ResourceFieldConfig[];
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  default_workflow: string;
  parent_id?: string | null;
  level?: number;
  path?: string;
  display_order?: number;
  is_selectable?: boolean;
  children?: Category[];
  required_documents?: RequiredDocumentSpec[];
  opportunity_fields?: OpportunityFieldSpec[];
  resources?: ResourceConfig[];
  resource_requirements?: Record<string, string>;
  vehicle_fields?: ResourceFieldConfig[];
  driver_fields?: ResourceFieldConfig[];
  related_services?: any[];
}

export type VendorCategoryApprovalStatus =
  | 'PENDING_APPROVAL'
  | 'CHANGES_REQUESTED'
  | 'ACTIVE'
  | 'REJECTED'
  | 'SUSPENDED';

export interface ApprovalHistoryEntry {
  id: string;
  action: string;
  previous_status: string;
  new_status: string;
  admin_id?: string;
  notes?: string;
  created_at: string;
}

export interface VendorCategoryApproval {
  id: string;
  vendor_id: string;
  vendor?: UserProfile;
  category_id: string;
  category?: Category;
  canonical_asset_id: string;
  canonical_asset?: UserServiceAsset;
  secondary_asset_ids: string[];
  secondary_assets?: UserServiceAsset[];
  status: VendorCategoryApprovalStatus;
  change_request_notes?: string;
  rejection_reason?: string;
  history: ApprovalHistoryEntry[];
  created_at: string;
  updated_at: string;
  approved_at?: string;
}


export interface UserServiceAsset {
  id: string;
  user_id: string;
  user?: UserProfile;
  category_id?: string;
  category?: Category;
  asset_type: string;
  title: string;
  description?: string;
  hourly_rate?: number;
  daily_rate?: number;
  is_available: boolean;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'DOCUMENTS_PENDING' | 'UNDER_REVIEW' | 'VERIFICATION_PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';
  rejection_reason?: string;
  documents?: Record<string, any>;
  attributes?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}


export interface Opportunity {
  id: string;
  user_id: string;
  user?: UserProfile;
  assigned_user_id?: string;
  assigned_user?: UserProfile;
  target_vendor_id?: string;
  target_vendor?: UserProfile;
  catalog_item_id?: string;
  category_id?: string;
  category?: Category;
  type: 'NEED' | 'OFFER';
  order_mode?: string;
  title: string;
  description: string;
  workflow_model: string;
  status: string;
  lat: number;
  lng: number;
  address_text?: string;
  radius_km: number;
  quantity?: number;
  unit_price?: number;
  total_price?: number;
  budget_min?: number;
  budget_max?: number;
  price_unit?: string;
  scheduled_start?: string;
  scheduled_end?: string;
  parent_opportunity_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at?: string;
}

export interface SpatialMatch {
  id: string;
  opportunity_id: string;
  matched_user_id: string;
  matched_user?: UserProfile;
  status: string;
  match_score: number;
  distance_meters: number;
  notes?: string;
  quote_amount?: number;
}

const FALLBACK_CATEGORIES: Category[] = [
  {
    id: '7',
    slug: 'bricks-building-materials',
    name: 'Bricks & Building Materials',
    description: 'Red bricks, fly ash bricks, AAC blocks, sand, gravel',
    icon: 'Package',
    default_workflow: 'INSTANT',
    opportunity_fields: [
      { key: 'quantity', label: 'Quantity (Number of Bricks)', type: 'number', required: true, placeholder: 'e.g. 5000' },
      { key: 'brick_type', label: 'Brick Type', type: 'select', required: true, options: ['Red Clay Bricks', 'Fly Ash Bricks', 'AAC Blocks', 'Concrete Blocks'] },
      { key: 'grade_spec', label: 'Specification / Grade', type: 'select', required: true, options: ['Class A (High Strength)', 'Class B (Standard)', 'Heavy Duty Structural'] },
      { key: 'delivery_access', label: 'Site Access Type', type: 'select', required: false, options: ['10-Wheeler Truck Accessible', 'Tractor Access Only', 'Narrow Street / Manual Unload'] }
    ]
  },
  {
    id: '8',
    slug: 'cement-construction',
    name: 'Cement & Construction Supplies',
    description: 'OPC, PPC, PSC cement bags, steel rebar, binding wire',
    icon: 'Layers',
    default_workflow: 'INSTANT',
    opportunity_fields: [
      { key: 'quantity_bags', label: 'Quantity (Bags)', type: 'number', required: true, placeholder: 'e.g. 100' },
      { key: 'cement_type', label: 'Cement Type', type: 'select', required: true, options: ['OPC 53 Grade', 'PPC (Portland Pozzolana)', 'PSC (Portland Slag)', 'White Cement'] },
      { key: 'grade', label: 'Grade Standard', type: 'select', required: true, options: ['53 Grade', '43 Grade', 'Super Premium Rapid Hardening'] },
      { key: 'brand_preference', label: 'Brand Preference', type: 'select', required: false, options: ['UltraTech', 'Ambuja', 'ACC', 'Ramco', 'Chettinad', 'Any Quality Brand'] }
    ]
  },
  {
    id: '9',
    slug: 'vehicle-repair',
    name: 'Vehicle Repair & Mechanics',
    description: 'Tractor, truck, auto, car repair, mobile mechanic',
    icon: 'Wrench',
    default_workflow: 'INSTANT',
    opportunity_fields: [
      { key: 'vehicle_type', label: 'Vehicle Category', type: 'select', required: true, options: ['Tractor', 'Commercial Truck', 'Auto Rickshaw', 'Four-Wheeler Car', 'Two-Wheeler Bike', 'Heavy Construction Equipment'] },
      { key: 'vehicle_number', label: 'Vehicle Registration Number', type: 'text', required: true, placeholder: 'e.g. TS08 AB 1234' },
      { key: 'problem_description', label: 'Problem / Issue Details', type: 'textarea', required: true, placeholder: 'Describe breakdown or repair issue (e.g. Clutch failure, Engine overheating, Flat tyre)' },
      { key: 'urgency_level', label: 'Urgency', type: 'select', required: true, options: ['Emergency Roadside Breakdown', 'Within 24 Hours', 'Scheduled Maintenance'] },
      { key: 'current_vehicle_location', label: 'Current Vehicle Location', type: 'text', required: true, placeholder: 'e.g. Highway NH65 near Choutuppal Toll Gate' }
    ]
  },
  { id: '1', slug: 'agriculture-farming', name: 'Agriculture & Farming', description: 'Tractor rental, rotavator, harvesters, seeds, farm labor', icon: 'Tractor', default_workflow: 'SCHEDULED' },
  { id: '2', slug: 'logistics-transport', name: 'Logistics & Transport', description: 'Goods transport, pickup truck, delivery, driver hire', icon: 'Truck', default_workflow: 'INSTANT' },
  { id: '3', slug: 'equipment-machinery', name: 'Equipment & Machinery', description: 'Construction equipment, tools, generator rental', icon: 'Wrench', default_workflow: 'RENTAL' },
  { id: '4', slug: 'home-services', name: 'Home Services & Repair', description: 'Electrician, plumber, carpenter, painter, cleaning', icon: 'Home', default_workflow: 'INSTANT' },
  { id: '5', slug: 'medicine-healthcare', name: 'Medicine & Healthcare', description: 'Medicine delivery, medical care, lab sample pickup', icon: 'HeartPulse', default_workflow: 'INSTANT' },
  { id: '6', slug: 'education-tutoring', name: 'Education & Skill Tuition', description: 'Home tuition, math teacher, vocational training', icon: 'BookOpen', default_workflow: 'SCHEDULED' },
];

// Fetch Public Categories for SEO pages & Nav
export async function getCategories(): Promise<Category[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/categories`, { next: { revalidate: 3600 } });
    if (!res.ok) return FALLBACK_CATEGORIES;
    const json = await res.json();
    return json.data && json.data.length > 0 ? json.data : FALLBACK_CATEGORIES;
  } catch {
    return FALLBACK_CATEGORIES;
  }
}


// Fetch Public Opportunities for SEO indexable listings & Sitemap
export async function getPublicOpportunities(categorySlug = '', oppType = '', page = 1): Promise<{ data: Opportunity[]; total: number }> {
  try {
    const params = new URLSearchParams();
    if (categorySlug) params.append('category', categorySlug);
    if (oppType) params.append('type', oppType);
    params.append('page', page.toString());
    params.append('limit', '20');

    const res = await fetch(`${API_BASE_URL}/opportunities/public?${params.toString()}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return { data: [], total: 0 };
    const json = await res.json();
    return {
      data: json.data || [],
      total: json.meta?.total || 0,
    };
  } catch {
    return { data: [], total: 0 };
  }
}

// Fetch Single Opportunity Details for SEO pages
export async function getOpportunityByID(id: string): Promise<Opportunity | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/opportunities/${id}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  } catch {
    return null;
  }
}

// Helper to retrieve auth token from browser session
export function getStoredAuthToken(): string {
  if (typeof window === 'undefined') return '';
  return getAccessToken();
}

// Authenticated API helper (uses Supabase JWT Token or session token)
export async function createOpportunity(payload: Partial<Opportunity>, jwtToken?: string): Promise<Opportunity | null> {
  const token = jwtToken || getStoredAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE_URL}/opportunities`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function updateOpportunityStatus(id: string, status: string, userId?: string, notes?: string): Promise<Opportunity | null> {
  const token = getStoredAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE_URL}/opportunities/${id}/status`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ status, user_id: userId, notes }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.data;
}

export interface DeliveryCalculationResult {
  is_eligible: boolean;
  unit_price: number;
  subtotal: number;
  distance_km: number;
  delivery_charge: number;
  transport_charge: number;
  driver_charge: number;
  driver_included: boolean;
  loading_charge: number;
  unloading_charge: number;
  service_fee: number;
  total_charges: number;
  final_payable: number;
  rejection_reason?: string;
  [key: string]: any;
}

export async function calculateDeliveryFee(req: any): Promise<DeliveryCalculationResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/logistics/calculate-delivery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    return json.data;
  } catch {
    return {
      is_eligible: true,
      unit_price: req.unit_price || 0,
      subtotal: (req.unit_price || 0) * (req.quantity || 1),
      distance_km: 10,
      delivery_charge: 50,
      transport_charge: 0,
      driver_charge: 0,
      driver_included: true,
      loading_charge: 0,
      unloading_charge: 0,
      service_fee: 20,
      total_charges: 70,
      final_payable: ((req.unit_price || 0) * (req.quantity || 1)) + 70,
    };
  }
}

export async function getMatchingOpportunities(userIdent: string): Promise<any> {
  try {
    const res = await fetch(`${API_BASE_URL}/opportunities/matching?user_id=${userIdent}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

export async function getAcceptedOpportunities(userIdent: string): Promise<any> {
  try {
    const res = await fetch(`${API_BASE_URL}/opportunities/accepted?user_id=${userIdent}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

export async function getCustomerOrders(userIdent: string): Promise<Opportunity[]> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') : null;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}/opportunities/my-orders?user_id=${encodeURIComponent(userIdent)}`, { headers, cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

export async function verifyPharmacyPickup(oppIdOrData: any, data?: any): Promise<any> {
  try {
    const bodyObj = typeof oppIdOrData === 'object' ? oppIdOrData : { opportunity_id: oppIdOrData, ...data };
    const res = await fetch(`${API_BASE_URL}/logistics/manifest/pickup-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyObj),
    });
    if (!res.ok) return false;
    const json = await res.json();
    return json.data || true;
  } catch {
    return false;
  }
}

export async function confirmTransportResources(oppIdOrData: any, data?: any): Promise<any> {
  const bodyObj = typeof oppIdOrData === 'object' ? oppIdOrData : { opportunity_id: oppIdOrData, ...data };
  const targetId = typeof oppIdOrData === 'string' ? oppIdOrData : (oppIdOrData?.opportunity_id || '');
  const token = getStoredAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE_URL}/opportunities/${targetId}/confirm-resources`, {
    method: 'POST',
    headers,
    body: JSON.stringify(bodyObj),
  });
  if (!res.ok) {
    let errText = await res.text();
    try {
      const parsed = JSON.parse(errText);
      errText = parsed.error || parsed.message || errText;
    } catch {
      // ignore
    }
    throw new Error(errText || 'Failed to confirm resource details');
  }
  const json = await res.json();
  return json.data || true;
}


// PostGIS Proximity Spatial Matching
export async function getSpatialMatches(oppID: string, jwtToken?: string): Promise<SpatialMatch[]> {
  const headers: Record<string, string> = {};
  if (jwtToken) {
    headers['Authorization'] = `Bearer ${jwtToken}`;
  }
  try {
    const res = await fetch(`${API_BASE_URL}/opportunities/${oppID}/matches`, { headers });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

// Multi-Layer Chained Task Creation
export async function createChildChainedTask(parentID: string, payload: Partial<Opportunity>, jwtToken: string): Promise<Opportunity | null> {
  const res = await fetch(`${API_BASE_URL}/opportunities/${parentID}/chain`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwtToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

// User Management & Verification Pipeline
export async function listUsers(): Promise<UserProfile[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/users/list`, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

export async function inviteUser(payload: { full_name: string; phone: string; email?: string; role?: string }): Promise<UserProfile | null> {
  const res = await fetch(`${API_BASE_URL}/users/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export interface RequestOTPResponse {
  otp_sent: boolean;
  expires_in?: number;
  dev_otp_code?: string;
  user?: UserProfile;
}

export async function requestOTP(phone: string): Promise<RequestOTPResponse> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      const retryAfter = res.headers.get('Retry-After');
      let msg = errJson?.message || errJson?.error || 'Failed to request OTP code';
      if (res.status === 429 && retryAfter) {
        msg = `${msg} (Please wait ${retryAfter}s before retrying)`;
      } else if (res.status === 503) {
        msg = 'SMS delivery service is currently unavailable. Please try again later or contact support.';
      }
      throw new Error(msg);
    }
    const json = await res.json();
    return json.data;
  } catch (err: any) {
    if (err.name === 'TypeError' || err.message?.includes('fetch')) {
      throw new Error('Backend API connection failed (http://localhost:8080). Please ensure the backend server is running.');
    }
    throw err;
  }
}

export interface SignupResponse {
  otp_sent: boolean;
  expires_in?: number;
  dev_otp_code?: string;
  user?: UserProfile;
}

export async function signupUser(payload: { full_name: string; phone: string; email?: string }): Promise<SignupResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => null);
    const retryAfter = res.headers.get('Retry-After');
    let msg = errJson?.message || errJson?.error || await res.text();
    if (res.status === 429 && retryAfter) {
      msg = `${msg} (Please wait ${retryAfter}s before retrying)`;
    } else if (res.status === 503) {
      msg = 'SMS delivery service is currently unavailable. Please try again later or contact support.';
    }
    throw new Error(msg);
  }
  const json = await res.json();
  return json.data;
}

export async function verifyOTP(phone: string, otpCode: string): Promise<UserProfile | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/users/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, otp_code: otpCode }),
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      let msg = errJson?.message || errJson?.error || 'Failed to verify OTP code';
      if (res.status === 429) {
        msg = `${msg} (Too many attempts. Please request a new code or try again later.)`;
      }
      throw new Error(msg);
    }
    const json = await res.json();
    const data = json.data;
    if (data?.access_token) {
      storeTokens({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
      });
    }
    const user: UserProfile = data?.user || data;
    if (user) {
      saveUserSession(user, data?.access_token);
    }
    return user;
  } catch (err: any) {
    if (err.name === 'TypeError' || err.message?.includes('fetch')) {
      throw new Error('Backend API connection failed (http://localhost:8080). Please ensure the backend server is running.');
    }
    throw err;
  }
}



export async function completeProfile(payload: { avatar_url: string; bio?: string; address_text?: string; aadhaar_number?: string; lat?: number; lng?: number }, jwtToken?: string): Promise<UserProfile | null> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (jwtToken) {
    headers['Authorization'] = `Bearer ${jwtToken}`;
  }
  const res = await fetch(`${API_BASE_URL}/users/complete-profile`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function getUserServices(phoneOrID: string): Promise<UserServiceAsset[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/users/services?phone=${encodeURIComponent(phoneOrID)}&user_id=${encodeURIComponent(phoneOrID)}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

export async function addUserService(payload: { phone?: string; user_id?: string; category_id?: string; asset_type: string; title: string; description?: string }): Promise<UserServiceAsset | null> {
  const res = await fetch(`${API_BASE_URL}/users/services`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function createCategory(payload: { name: string; slug?: string; description?: string; icon?: string }): Promise<Category | null> {
  const res = await fetch(`${API_BASE_URL}/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function deleteCategory(id: string): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/categories/${id}`, {
    method: 'DELETE',
  });
  return res.ok;
}

export async function updateUserStatus(userId: string, status: string): Promise<UserProfile | null> {
  const res = await fetch(`${API_BASE_URL}/users/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, status }),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function verifyFace(faceRef: string, jwtToken?: string): Promise<UserProfile | null> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (jwtToken) {
    headers['Authorization'] = `Bearer ${jwtToken}`;
  }
  const res = await fetch(`${API_BASE_URL}/users/verify-face`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ face_verification_ref: faceRef }),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function submitServiceDocuments(payload: { asset_id: string; user_id?: string; phone?: string; documents: Record<string, any> }): Promise<UserServiceAsset | null> {
  const res = await fetch(`${API_BASE_URL}/users/services/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function listAllServiceRequests(statusFilter = ''): Promise<UserServiceAsset[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/services/requests?status=${encodeURIComponent(statusFilter)}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

export async function adminApproveServiceRequest(assetId: string): Promise<UserServiceAsset | null> {
  const res = await fetch(`${API_BASE_URL}/admin/services/${assetId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function adminReviewServiceDocuments(assetId: string, approve: boolean, rejectionReason = ''): Promise<UserServiceAsset | null> {
  const res = await fetch(`${API_BASE_URL}/admin/services/${assetId}/review-documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approve, rejection_reason: rejectionReason }),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function updateCategoryRequirements(categoryId: string, requiredDocuments: RequiredDocumentSpec[]): Promise<Category | null> {
  const res = await fetch(`${API_BASE_URL}/admin/categories/${categoryId}/requirements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ required_documents: requiredDocuments }),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function updateCategoryOpportunityFields(categoryId: string, fields: OpportunityFieldSpec[]): Promise<Category | null> {
  const res = await fetch(`${API_BASE_URL}/admin/categories/${categoryId}/opportunity-fields`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ opportunity_fields: fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function updateCategoryResources(categoryId: string, resources: ResourceConfig[]): Promise<Category | null> {
  const res = await fetch(`${API_BASE_URL}/admin/categories/${categoryId}/resources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resources }),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function uploadFile(
  file: File,
  purpose?: string
): Promise<{ url: string; filename: string; mimetype: string; size_bytes: number; is_private?: boolean }> {
  const formData = new FormData();
  formData.append('file', file);
  if (purpose) {
    formData.append('purpose', purpose);
  }

  const token = getStoredAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || 'File upload failed');
  }

  const json = await res.json();
  return json.data;
}

export async function getSignedFileUrl(fileUrl: string): Promise<string> {
  if (!fileUrl) return '';
  const match = fileUrl.match(/\/files\/private\/([^/]+)\/([^/?#]+)/);
  if (match) {
    const [, owner, name] = match;
    try {
      const token = getStoredAuthToken();
      const res = await fetch(`${API_BASE_URL}/files/private/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/signed-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.ok) {
        const json = await res.json();
        const signedPath = json?.data?.signed_url;
        if (signedPath) {
          if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
            const origin = new URL(fileUrl).origin;
            return `${origin}${signedPath}`;
          }
          return signedPath;
        }
      }
    } catch {
      // fallback to original
    }
  }
  return fileUrl;
}

// Scenario 1: Logistics & Emergency API Interfaces
export interface VoiceParseResponse {
  category: string;
  item: string;
  quantity: number;
  location: string;
  schedule: string;
  estimated_amount: number;
  suggested_vendor: string;
  voice_reply: string;
  parsed_success: boolean;
  entities: Record<string, any>;
}

export interface OpportunityTreeNode {
  opportunity: Opportunity;
  manifest?: WayManifest;
  incident?: IncidentTelemetry;
  children?: OpportunityTreeNode[];
}

export interface WayManifest {
  id: string;
  opportunity_id: string;
  manifest_number: string;
  routing_barcode: string;
  pol_photo_url?: string;
  pol_captured_at?: string;
  pod_qr_code?: string;
  pod_signature_url?: string;
  pod_captured_at?: string;
  status: string;
}

export interface IncidentTelemetry {
  id: string;
  opportunity_id: string;
  incident_type: string;
  description?: string;
  lat: number;
  lng: number;
  address_text?: string;
  is_no_movement_alert: boolean;
  status: string;
}

export interface PartsInventoryItem {
  id: string;
  shop_user_id: string;
  part_number: string;
  part_name: string;
  description?: string;
  stock_quantity: number;
  unit_price: number;
  lat: number;
  lng: number;
}

export async function parseVoiceOrder(audioText: string, userLat = 17.25, userLng = 78.95): Promise<VoiceParseResponse> {
  const res = await fetch(`${API_BASE_URL}/voice/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio_text: audioText, user_lat: userLat, user_lng: userLng }),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function triggerLogisticsCascade(payload: { root_opportunity_id: string; cascade_type: 'TRANSPORT' | 'DRIVER' | 'PARTS'; parent_user_id?: string; lat?: number; lng?: number; part_number?: string }): Promise<Opportunity> {
  const res = await fetch(`${API_BASE_URL}/logistics/cascade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function reportSOSIncident(payload: { opportunity_id: string; reporter_id?: string; description: string; lat: number; lng: number }): Promise<{ incident: IncidentTelemetry; roadside_repair_child?: Opportunity }> {
  const res = await fetch(`${API_BASE_URL}/logistics/sos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return { incident: json.incident, roadside_repair_child: json.roadside_repair_child };
}

export async function generateWayManifest(payload: { opportunity_id: string; vehicle_id?: string; driver_id?: string }): Promise<WayManifest> {
  const res = await fetch(`${API_BASE_URL}/logistics/manifest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function uploadProofOfLoading(opportunityId: string, photoUrl: string): Promise<WayManifest> {
  const res = await fetch(`${API_BASE_URL}/logistics/manifest/pol`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ opportunity_id: opportunityId, photo_url: photoUrl }),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function uploadProofOfDelivery(opportunityId: string, qrCode: string, signatureUrl: string): Promise<WayManifest> {
  const res = await fetch(`${API_BASE_URL}/logistics/manifest/pod`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ opportunity_id: opportunityId, qr_code: qrCode, signature_url: signatureUrl }),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function searchAutoParts(query = 'TC-990'): Promise<PartsInventoryItem[]> {
  const res = await fetch(`${API_BASE_URL}/parts/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}

export async function checkoutAutoPart(payload: { part_id?: string; buyer_id?: string; root_id: string }): Promise<PartsInventoryItem> {
  const res = await fetch(`${API_BASE_URL}/parts/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function createVehicleDriverPairing(payload: { vehicle_id?: string; driver_id?: string; license_number: string; license_class: string }) {
  const res = await fetch(`${API_BASE_URL}/logistics/pairings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function settleEscrowTree(rootId: string): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/escrow/settle/${rootId}`, { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
  return true;
}

export async function getOpportunityTree(id: string): Promise<OpportunityTreeNode | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/opportunities/${id}/tree`, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  } catch {
    return null;
  }
}

export interface OpportunityStatusHistory {
  id: string;
  opportunity_id: string;
  from_status?: string;
  to_status: string;
  changed_by_user_id?: string;
  notes?: string;
  created_at: string;
}

export async function getStatusHistory(id: string): Promise<OpportunityStatusHistory[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/opportunities/${id}/history`, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

// ============================================================================
// PHASE 6: ORDER FULFILMENT & LOGISTICS API METHODS
// ============================================================================

export async function getVendorOrders(vendorId: string, status?: string): Promise<Opportunity[]> {
  try {
    const url = new URL(`${API_BASE_URL}/vendor/orders`);
    url.searchParams.set('vendor_id', vendorId);
    if (status && status !== 'ALL') {
      url.searchParams.set('status', status);
    }
    const res = await fetch(url.toString(), {
      headers: { 'X-User-ID': vendorId },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

export async function getVendorOrderDetail(orderId: string, vendorId: string): Promise<Opportunity | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/vendor/orders/${orderId}?vendor_id=${vendorId}`, {
      headers: { 'X-User-ID': vendorId },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  } catch {
    return null;
  }
}

export async function executeVendorOrderAction(
  orderId: string,
  vendorId: string,
  payload: { action: 'ACCEPT' | 'REJECT' | 'PREPARE' | 'READY_FOR_PICKUP'; rejection_reason?: string; preparation_notes?: string }
): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/vendor/orders/${orderId}/actions?vendor_id=${vendorId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-ID': vendorId },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return true;
}

export async function matchTransportProviders(payload: {
  pickup_lat: number;
  pickup_lng: number;
  delivery_lat: number;
  delivery_lng: number;
  radius_km?: number;
}): Promise<any[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/logistics/providers/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

export async function assignDriverAndVehicle(payload: {
  opportunity_id: string;
  vehicle_id: string;
  driver_id: string;
  license_number?: string;
  license_class?: string;
  replace_existing?: boolean;
  reassignment_reason?: string;
}): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/logistics/assign-driver-vehicle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function registerProofOfLoadingExtended(payload: {
  opportunity_id: string;
  photo_urls: string[];
  loaded_quantity: number;
  cargo_unit?: string;
  location_lat?: number;
  location_lng?: number;
  address_text?: string;
  authorized_by_name?: string;
  driver_notes?: string;
  discrepancy_notes?: string;
}): Promise<WayManifest> {
  const res = await fetch(`${API_BASE_URL}/logistics/manifests/pol`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function registerProofOfDeliveryExtended(payload: {
  opportunity_id: string;
  photo_urls?: string[];
  signature_url?: string;
  delivered_quantity: number;
  cargo_unit?: string;
  recipient_name: string;
  delivery_notes?: string;
  damaged_quantity?: number;
}): Promise<WayManifest> {
  const res = await fetch(`${API_BASE_URL}/logistics/manifests/pod`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function generateDeliveryOTP(opportunityId: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/opportunities/${opportunityId}/delivery-otp`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data?.delivery_otp || '';
}

export async function verifySecureDeliveryOTP(opportunityId: string, otpCode: string, verifiedBy?: string): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/opportunities/${opportunityId}/verify-delivery-otp-secure`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(verifiedBy ? { 'X-User-ID': verifiedBy } : {}),
    },
    body: JSON.stringify({ otp_code: otpCode }),
  });
  if (!res.ok) {
    const errText = await res.text();
    try {
      const parsed = JSON.parse(errText);
      throw new Error(parsed.message || parsed.error || errText);
    } catch (e: any) {
      throw new Error(e.message || errText);
    }
  }
  return true;
}

export async function transitionOrderStatus(opportunityId: string, toStatus: string, notes?: string): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/opportunities/${opportunityId}/status-transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to_status: toStatus, notes: notes || '' }),
  });
  if (!res.ok) throw new Error(await res.text());
  return true;
}

// User Saved Address API Methods

export async function getUserAddresses(userId: string): Promise<UserAddress[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/users/${userId}/addresses`, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

export async function createUserAddress(userId: string, data: Partial<UserAddress>): Promise<UserAddress> {
  const res = await fetch(`${API_BASE_URL}/users/${userId}/addresses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, user_id: userId }),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function updateUserAddress(userId: string, addressId: string, data: Partial<UserAddress>): Promise<UserAddress> {
  const res = await fetch(`${API_BASE_URL}/users/${userId}/addresses/${addressId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, user_id: userId, id: addressId }),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function setDefaultUserAddress(userId: string, addressId: string): Promise<UserAddress> {
  const res = await fetch(`${API_BASE_URL}/users/${userId}/addresses/${addressId}/default`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function deleteUserAddress(userId: string, addressId: string): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/users/${userId}/addresses/${addressId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await res.text());
  return true;
}

export interface CategoryRelatedServiceSpec {
  category_id: string;
  name: string;
  description?: string;
  icon?: string;
  is_required?: boolean;
}

export async function updateCategoryRelatedServices(
  categoryId: string,
  relatedServices: CategoryRelatedServiceSpec[]
): Promise<Category> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') : null;
  const res = await fetch(`${API_BASE_URL}/admin/categories/${categoryId}/related-services`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ related_services: relatedServices }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to update category related services');
  }
  const data = await res.json();
  return data.data;
}

export interface UserNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type?: string;
  metadata?: any;
  is_read: boolean;
  created_at: string;
}

export async function getUserNotifications(userIdent: string, page = 1, limit = 50): Promise<{ notifications: UserNotification[]; unread_count: number }> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') : null;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const params = new URLSearchParams({ user_id: userIdent, page: page.toString(), limit: limit.toString() });
    const res = await fetch(`${API_BASE_URL}/notifications?${params.toString()}`, { headers, cache: 'no-store' });
    if (!res.ok) return { notifications: [], unread_count: 0 };
    const json = await res.json();
    return {
      notifications: json.data?.notifications || json.data || [],
      unread_count: json.data?.unread_count || 0,
    };
  } catch {
    return { notifications: [], unread_count: 0 };
  }
}

export async function getUnreadNotificationCount(userIdent: string): Promise<number> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') : null;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const params = new URLSearchParams({ user_id: userIdent });
    const res = await fetch(`${API_BASE_URL}/notifications/unread-count?${params.toString()}`, { headers, cache: 'no-store' });
    if (!res.ok) return 0;
    const json = await res.json();
    return json.data?.unread_count || 0;
  } catch {
    return 0;
  }
}

export async function markNotificationAsRead(id: string, userIdent?: string): Promise<boolean> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') : null;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}/notifications/${id}/read?user_id=${encodeURIComponent(userIdent || '')}`, {
      method: 'POST',
      headers,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function markAllNotificationsAsRead(userIdent?: string): Promise<boolean> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') : null;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}/notifications/read-all?user_id=${encodeURIComponent(userIdent || '')}`, {
      method: 'POST',
      headers,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function getStoredUser(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem('uop_user') || localStorage.getItem('uop_user_profile');
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function saveUserSession(user: UserProfile, token?: string): void {
  if (typeof window === 'undefined') return;
  const userJson = JSON.stringify(user);
  localStorage.setItem('uop_user', userJson);
  localStorage.setItem('uop_user_profile', userJson);
  if (user.id) localStorage.setItem('uop_user_id', user.id);
  if (user.phone) localStorage.setItem('uop_phone', user.phone);
  if (token) {
    storeTokens({ access_token: token });
  }
}

export function clearUserSession(): void {
  clearAllSessionStorage();
}

export interface AdditionalServiceItem {
  id: string;
  name: string;
  description?: string;
  is_included: boolean;
  price?: number;
  price_unit?: string;
  is_available?: boolean;
}

export interface CatalogReviewEntry {
  timestamp: string;
  action: string;
  reviewer_id?: string;
  reviewer_name?: string;
  notes?: string;
}

export interface VendorCatalogItem {
  id: string;
  vendor_asset_id?: string;
  vendor_asset?: UserServiceAsset;
  vendor_user_id: string;
  vendor_user?: UserProfile;
  category_id?: string;
  category?: Category;
  parent_id?: string | null;
  node_type?: 'GROUPING' | 'BOOKABLE';
  level?: number;
  path?: string;
  display_order?: number;
  price_type?: 'FIXED' | 'QUOTATION';
  title: string;
  description?: string;
  sku?: string;
  unit_price: number;
  price_unit: string;
  stock_quantity?: number;
  min_order_quantity?: number;
  images?: string[];
  attributes?: Record<string, any>;
  included_services?: AdditionalServiceItem[];
  optional_services?: AdditionalServiceItem[];
  fulfilment_info?: Record<string, any>;
  status?: 'DRAFT' | 'PENDING_ADMIN_APPROVAL' | 'ACTIVE_IN_CATALOG' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED' | 'ARCHIVED';
  change_request_notes?: string;
  rejection_reason?: string;
  review_history?: CatalogReviewEntry[];
  pickup_lat?: number;
  pickup_lng?: number;
  pickup_address?: string;
  is_available: boolean;
  created_at?: string;
  updated_at?: string;
  children?: VendorCatalogItem[];
  [key: string]: any;
}

export interface ProviderOffer {
  id?: string;
  offer_id?: string;
  user_id?: string;
  title: string;
  description?: string;
  pricing_model?: string;
  unit_price?: number;
  [key: string]: any;
}

export async function searchCatalog(query = '', categorySlug = '', page = 1, limit = 50): Promise<{ items: VendorCatalogItem[]; total: number }> {
  try {
    const params = new URLSearchParams();
    if (query) params.append('q', query);
    if (categorySlug && categorySlug !== 'ALL') params.append('category', categorySlug);
    params.append('page', page.toString());
    params.append('limit', limit.toString());

    const res = await fetch(`${API_BASE_URL}/catalog/search?${params.toString()}`);
    if (!res.ok) return { items: [], total: 0 };
    const json = await res.json();
    return {
      items: json.data?.items || [],
      total: json.data?.total || 0,
    };
  } catch {
    return { items: [], total: 0 };
  }
}

export async function getVendorCatalog(vendorId: string): Promise<{ vendor: UserProfile; assets: UserServiceAsset[]; items: VendorCatalogItem[] } | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/vendors/${vendorId}/catalog`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  } catch {
    return null;
  }
}

export async function createCatalogItem(item: Partial<VendorCatalogItem>): Promise<VendorCatalogItem> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') : null;
  const res = await fetch(`${API_BASE_URL}/vendor/catalog`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(item),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to create catalog item');
  }
  const json = await res.json();
  return json.data;
}

export async function createVendorService(payload: any): Promise<VendorCatalogItem> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') : null;
  const res = await fetch(`${API_BASE_URL}/services/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to create vendor service');
  }
  const json = await res.json();
  return json.data;
}

export async function getAdminCatalogRequests(status = 'PENDING_ADMIN_APPROVAL'): Promise<VendorCatalogItem[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/catalog/requests?status=${encodeURIComponent(status)}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

export async function approveCatalogItem(id: string): Promise<VendorCatalogItem> {
  const res = await fetch(`${API_BASE_URL}/admin/catalog/${id}/approve`, { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function rejectCatalogItem(id: string, rejectionReason: string): Promise<VendorCatalogItem> {
  const res = await fetch(`${API_BASE_URL}/admin/catalog/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rejection_reason: rejectionReason }),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function requestChangesCatalogItem(id: string, notes: string): Promise<VendorCatalogItem> {
  const res = await fetch(`${API_BASE_URL}/admin/catalog/${id}/request-changes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function getVendorCatalogTree(vendorId: string, categoryId?: string, includeUnapproved = true): Promise<VendorCatalogItem[]> {
  try {
    const params = new URLSearchParams();
    if (categoryId) params.append('category_id', categoryId);
    if (includeUnapproved) params.append('all', 'true');
    const res = await fetch(`${API_BASE_URL}/vendors/${vendorId}/catalog/tree?${params.toString()}`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data?.tree || [];
  } catch {
    return [];
  }
}

export async function moveCatalogNode(id: string, vendorUserId: string, parentId: string | null, displayOrder = 0): Promise<VendorCatalogItem> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') : null;
  const res = await fetch(`${API_BASE_URL}/vendor/catalog/${id}/move`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ vendor_user_id: vendorUserId, parent_id: parentId, display_order: displayOrder }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to move catalog node');
  }
  const json = await res.json();
  return json.data;
}

export async function reorderCatalogNodes(vendorUserId: string, parentId: string | null, nodeIds: string[]): Promise<boolean> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') : null;
  const res = await fetch(`${API_BASE_URL}/vendor/catalog/reorder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ vendor_user_id: vendorUserId, parent_id: parentId, node_ids: nodeIds }),
  });
  return res.ok;
}

export async function archiveCatalogItem(id: string, vendorUserId: string): Promise<boolean> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') : null;
  const res = await fetch(`${API_BASE_URL}/vendor/catalog/${id}/archive`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ vendor_user_id: vendorUserId }),
  });
  return res.ok;
}

export async function verifyDeliveryOTP(opportunityId: string, otpCode: string): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/opportunities/${opportunityId}/verify-delivery-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp_code: otpCode }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Invalid delivery OTP code');
  }
  return true;
}

export async function updateCatalogItem(id: string, item: Partial<VendorCatalogItem>): Promise<VendorCatalogItem> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') : null;
  const res = await fetch(`${API_BASE_URL}/vendor/catalog/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(item),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to update catalog item');
  }
  const json = await res.json();
  return json.data;
}

export async function deleteCatalogItem(id: string, vendorUserId: string): Promise<boolean> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') : null;
  const res = await fetch(`${API_BASE_URL}/vendor/catalog/${id}?vendor_user_id=${vendorUserId}`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return res.ok;
}

export async function getProviderOffers(categoryId?: string): Promise<ProviderOffer[]> {
  try {
    const params = new URLSearchParams();
    if (categoryId) params.append('category_id', categoryId);
    const res = await fetch(`${API_BASE_URL}/provider/offers?${params.toString()}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

// -----------------------------------------------------------------------------
// USER JOURNEY APIs (Phase A)
// -----------------------------------------------------------------------------

export interface UserJourney {
  id: string;
  user_id: string;
  user?: UserProfile;
  title: string;
  description?: string;
  status: string; // 'OPEN' (Active), 'PAUSED', 'CANCELLED', 'COMPLETED'
  origin_address: string;
  origin_lat: number;
  origin_lng: number;
  destination_address: string;
  destination_lat: number;
  destination_lng: number;
  travel_mode: string;
  journey_type: string; // 'ONE_TIME', 'RECURRING'
  travel_frequency: string; // 'ONE_TIME', 'DAILY', 'WEEKDAYS', 'WEEKENDS', 'CUSTOM'
  available_days?: string[];
  departure_window_start?: string;
  departure_window_end?: string;
  arrival_window_start?: string;
  arrival_window_end?: string;
  max_detour_km: number;
  max_detour_minutes: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface RegisterJourneyPayload {
  user_id?: string;
  origin_address: string;
  origin_lat: number;
  origin_lng: number;
  destination_address: string;
  destination_lat: number;
  destination_lng: number;
  travel_mode: string;
  journey_type: string; // 'ONE_TIME', 'RECURRING'
  travel_frequency: string; // 'ONE_TIME', 'DAILY', 'WEEKDAYS', 'WEEKENDS', 'CUSTOM'
  available_days?: string[];
  departure_window_start?: string;
  departure_window_end?: string;
  arrival_window_start?: string;
  arrival_window_end?: string;
  max_detour_km?: number;
  max_detour_minutes?: number;
}

export async function registerJourney(payload: RegisterJourneyPayload): Promise<UserJourney> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') || localStorage.getItem('uop_token') : null;
  const storedUser = getStoredUser();
  const effectivePayload = {
    ...payload,
    user_id: payload.user_id || storedUser?.id || undefined,
  };

  const res = await fetch(`${API_BASE_URL}/journeys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(effectivePayload),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || errData.error || 'Failed to register journey');
  }

  const json = await res.json();
  return json.data;
}

export async function getUserJourneys(userId?: string): Promise<UserJourney[]> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') || localStorage.getItem('uop_token') : null;
    const storedUser = getStoredUser();
    const targetUserId = userId || storedUser?.id || '';

    const params = new URLSearchParams();
    if (targetUserId) params.append('user_id', targetUserId);

    const res = await fetch(`${API_BASE_URL}/journeys?${params.toString()}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      cache: 'no-store',
    });

    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

export async function getJourneyByID(id: string, userId?: string): Promise<UserJourney | null> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') || localStorage.getItem('uop_token') : null;
    const storedUser = getStoredUser();
    const targetUserId = userId || storedUser?.id || '';

    const params = new URLSearchParams();
    if (targetUserId) params.append('user_id', targetUserId);

    const res = await fetch(`${API_BASE_URL}/journeys/${id}?${params.toString()}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      cache: 'no-store',
    });

    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  } catch {
    return null;
  }
}

export async function updateJourney(id: string, payload: Partial<RegisterJourneyPayload>, userId?: string): Promise<UserJourney> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') || localStorage.getItem('uop_token') : null;
  const storedUser = getStoredUser();
  const targetUserId = userId || storedUser?.id || '';

  const params = new URLSearchParams();
  if (targetUserId) params.append('user_id', targetUserId);

  const res = await fetch(`${API_BASE_URL}/journeys/${id}?${params.toString()}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || errData.error || 'Failed to update journey');
  }

  const json = await res.json();
  return json.data;
}

export async function setJourneyStatus(id: string, action: 'PAUSE' | 'RESUME' | 'CANCEL', userId?: string): Promise<boolean> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') || localStorage.getItem('uop_token') : null;
  const storedUser = getStoredUser();
  const targetUserId = userId || storedUser?.id || '';

  const params = new URLSearchParams();
  if (targetUserId) params.append('user_id', targetUserId);

  const res = await fetch(`${API_BASE_URL}/journeys/${id}/status?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || errData.error || `Failed to ${action.toLowerCase()} journey`);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Phase 1: Platform Category Hierarchy and Vendor Governance API Client
// ---------------------------------------------------------------------------

export async function getCategoryHierarchyTree(): Promise<Category[]> {
  const res = await fetch(`${API_BASE_URL}/categories/tree`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || errData.error || 'Failed to fetch category hierarchy');
  }
  const json = await res.json();
  return json.data || [];
}

export async function updateCategoryParent(
  id: string,
  parentId: string | null,
  displayOrder: number = 0
): Promise<Category> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') || localStorage.getItem('uop_token') : null;
  const res = await fetch(`${API_BASE_URL}/admin/categories/${id}/parent`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ parent_id: parentId, display_order: displayOrder }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || errData.error || 'Failed to update category parent');
  }
  const json = await res.json();
  return json.data;
}

export async function toggleCategorySelectable(id: string, isSelectable: boolean): Promise<Category> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') || localStorage.getItem('uop_token') : null;
  const res = await fetch(`${API_BASE_URL}/admin/categories/${id}/selectable`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ is_selectable: isSelectable }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || errData.error || 'Failed to update category selectability');
  }
  const json = await res.json();
  return json.data;
}

export async function getVendorCategoryApprovals(vendorId?: string): Promise<VendorCategoryApproval[]> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') || localStorage.getItem('uop_token') : null;
  const storedUser = getStoredUser();
  const vId = vendorId || storedUser?.id || '';
  const res = await fetch(`${API_BASE_URL}/vendor/categories/approvals?vendor_id=${vId}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || errData.error || 'Failed to fetch vendor approvals');
  }
  const json = await res.json();
  return json.data || [];
}

export async function applyForCategory(payload: {
  vendor_id: string;
  category_id: string;
  asset_id: string;
  secondary_asset_ids?: string[];
  notes?: string;
}): Promise<VendorCategoryApproval> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') || localStorage.getItem('uop_token') : null;
  const res = await fetch(`${API_BASE_URL}/vendor/categories/apply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || errData.error || 'Failed to apply for category');
  }
  const json = await res.json();
  return json.data;
}

export async function resubmitCategoryApplication(
  id: string,
  payload: {
    vendor_id: string;
    asset_id: string;
    secondary_asset_ids?: string[];
    notes?: string;
  }
): Promise<VendorCategoryApproval> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') || localStorage.getItem('uop_token') : null;
  const res = await fetch(`${API_BASE_URL}/vendor/categories/resubmit/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || errData.error || 'Failed to resubmit category application');
  }
  const json = await res.json();
  return json.data;
}

export async function getAdminCategoryApprovals(status?: string): Promise<VendorCategoryApproval[]> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') || localStorage.getItem('uop_token') : null;
  const url = status
    ? `${API_BASE_URL}/admin/categories/approvals?status=${encodeURIComponent(status)}`
    : `${API_BASE_URL}/admin/categories/approvals`;
  const res = await fetch(url, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || errData.error || 'Failed to fetch admin approvals');
  }
  const json = await res.json();
  return json.data || [];
}

export async function reviewCategoryApproval(
  id: string,
  payload: {
    admin_id: string;
    action: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES' | 'SUSPEND';
    notes?: string;
  }
): Promise<VendorCategoryApproval> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') || localStorage.getItem('uop_token') : null;
  const res = await fetch(`${API_BASE_URL}/admin/categories/approvals/${id}/review`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || errData.error || 'Failed to review category approval');
  }
  const json = await res.json();
  return json.data;
}




// ============================================================================
// PHASE 4: CUSTOMER MARKETPLACE & DISCOVERY API CLIENT
// ============================================================================

export interface CatalogBreadcrumb {
  id: string;
  title: string;
  node_type: string;
  level: number;
}

export interface MarketplaceVendorCard {
  vendor_id: string;
  vendor_name: string;
  vendor_phone?: string;
  vendor_avatar?: string;
  trust_score: number;
  is_verified: boolean;
  address_text?: string;
  lat?: number;
  lng?: number;
  distance_km?: number | null;
  category_name?: string;
  category_slug?: string;
  offering_count: number;
  min_price?: number;
  max_price?: number;
  price_unit?: string;
  sample_offerings?: VendorCatalogItem[];
}

export interface OfferingComparisonResponse {
  items: VendorCatalogItem[];
  common_specs: string[];
  all_spec_keys: string[];
  price_units: string[];
  has_mixed_units: boolean;
}

export interface MarketplaceFilterParams {
  query?: string;
  category?: string;
  category_id?: string;
  vendor_id?: string;
  min_price?: number;
  max_price?: number;
  price_type?: string;
  in_stock?: boolean;
  lat?: number;
  lng?: number;
  radius_km?: number;
  sort_by?: string;
  page?: number;
  limit?: number;
}

export interface MarketplaceOfferingDetailResponse {
  item: VendorCatalogItem;
  breadcrumbs: CatalogBreadcrumb[];
  vendor?: UserProfile;
  category?: Category;
}

export async function searchMarketplaceCatalog(params: MarketplaceFilterParams = {}): Promise<{
  items: VendorCatalogItem[];
  total: number;
  page: number;
  limit: number;
}> {
  const query = new URLSearchParams();
  if (params.query) query.set('q', params.query);
  if (params.category && params.category !== 'ALL') query.set('category', params.category);
  if (params.category_id) query.set('category_id', params.category_id);
  if (params.vendor_id) query.set('vendor_id', params.vendor_id);
  if (params.min_price !== undefined) query.set('min_price', params.min_price.toString());
  if (params.max_price !== undefined) query.set('max_price', params.max_price.toString());
  if (params.price_type && params.price_type !== 'ALL') query.set('price_type', params.price_type);
  if (params.in_stock) query.set('in_stock', 'true');
  if (params.lat !== undefined && params.lng !== undefined) {
    query.set('lat', params.lat.toString());
    query.set('lng', params.lng.toString());
    if (params.radius_km) query.set('radius_km', params.radius_km.toString());
  }
  if (params.sort_by) query.set('sort_by', params.sort_by);
  if (params.page) query.set('page', params.page.toString());
  if (params.limit) query.set('limit', params.limit.toString());

  const res = await fetch(`${API_BASE_URL}/catalog/search?${query.toString()}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to search marketplace catalog');
  }
  const json = await res.json();
  return {
    items: json.data?.items || [],
    total: json.data?.total || 0,
    page: json.data?.page || 1,
    limit: json.data?.limit || 24,
  };
}

export async function getMarketplaceOffering(id: string): Promise<MarketplaceOfferingDetailResponse> {
  const res = await fetch(`${API_BASE_URL}/catalog/items/${id}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Offering not found or unavailable');
  }
  const json = await res.json();
  return json.data;
}

export async function getEligibleVendorsByCategory(
  categoryParam: string,
  lat?: number,
  lng?: number,
  page: number = 1,
  limit: number = 20
): Promise<{ vendors: MarketplaceVendorCard[]; total: number }> {
  const query = new URLSearchParams();
  if (lat !== undefined && lng !== undefined) {
    query.set('lat', lat.toString());
    query.set('lng', lng.toString());
  }
  query.set('page', page.toString());
  query.set('limit', limit.toString());

  const res = await fetch(`${API_BASE_URL}/categories/${categoryParam}/vendors?${query.toString()}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to retrieve eligible category vendors');
  }
  const json = await res.json();
  return {
    vendors: json.data?.vendors || [],
    total: json.data?.total || 0,
  };
}

export async function compareMarketplaceOfferings(ids: string[]): Promise<OfferingComparisonResponse> {
  const res = await fetch(`${API_BASE_URL}/catalog/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ offering_ids: ids }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to compare offerings');
  }
  const json = await res.json();
  return json.data;
}


// ============================================================================
// PHASE 5: CART, CHECKOUT, PRICING & INVENTORY MANAGEMENT
// ============================================================================

export interface CartValidationItem {
  catalog_item_id: string;
  quantity: number;
  selected_optional_services?: string[];
}

export interface CartValidationRequest {
  items: CartValidationItem[];
  delivery_lat?: number;
  delivery_lng?: number;
  address_text?: string;
}

export interface CartItemPriceBreakdown {
  catalog_item_id: string;
  title: string;
  vendor_user_id: string;
  vendor_name: string;
  quantity: number;
  price_unit: string;
  unit_price: number;
  product_subtotal: number;
  selected_optional_services?: AdditionalServiceItem[];
  optional_services_subtotal: number;
  min_order_quantity: number;
  available_stock: number;
}

export interface PriceSnapshotItem {
  title: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  unit: string;
}

export interface PriceSnapshotCharges {
  delivery?: number;
  service?: number;
}

export interface PriceSnapshot {
  item_title: string;
  pricing_model: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
  distance_km?: number;
  delivery_charge?: number;
  transport_charge?: number;
  service_fee?: number;
  total_charges: number;
  final_payable: number;
  items?: PriceSnapshotItem[];
  charges?: PriceSnapshotCharges;
  calculated_at: string;
}

export interface CartValidationResponse {
  is_valid: boolean;
  rejection_reason?: string;
  vendor_user_id?: string;
  vendor_name?: string;
  items?: CartItemPriceBreakdown[];
  product_subtotal: number;
  optional_services_subtotal: number;
  delivery_charge: number;
  platform_fee: number;
  tax_amount: number;
  final_payable: number;
  price_snapshot?: PriceSnapshot;
}

export interface InitiateCheckoutRequest extends CartValidationRequest {
  user_id?: string;
  idempotency_key?: string;
  payment_method?: string;
}

export interface InitiateCheckoutResponse {
  opportunity_id: string;
  payment_reference: string;
  payment_signature: string;
  amount: number;
  currency: string;
  reservation_expires: string;
  validation: CartValidationResponse;
}

export interface PaymentCallbackRequest {
  payment_reference: string;
  signature: string;
  status: 'SUCCESS' | 'FAILED';
  gateway_txn_id?: string;
  failure_reason?: string;
}

export async function validateCart(req: CartValidationRequest): Promise<CartValidationResponse> {
  const res = await fetch(`${API_BASE_URL}/cart/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || json.error || 'Cart validation failed');
  }
  return json.data;
}

export async function initiateCheckout(req: InitiateCheckoutRequest): Promise<InitiateCheckoutResponse> {
  const res = await fetch(`${API_BASE_URL}/checkout/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || json.error || 'Failed to initiate checkout');
  }
  return json.data;
}

export async function processPaymentCallback(req: PaymentCallbackRequest): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/checkout/payment/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || json.error || 'Failed to process payment callback');
  }
  return json.data;
}

export async function cancelCheckoutOrder(orderId: string): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/checkout/${orderId}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || json.error || 'Failed to cancel checkout order');
  }
  return json.data;
}

// ============================================================================
// PHASE 7: NOTIFICATIONS, GOVERNANCE & OPERATIONS API
// ============================================================================

export interface NotificationPreference {
  user_id: string;
  in_app_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  disabled_categories: string[];
  created_at?: string;
  updated_at?: string;
}

export interface AdminDashboardMetrics {
  active_users_count: number;
  active_vendors_count: number;
  active_drivers_count: number;
  pending_category_approvals: number;
  pending_catalog_approvals: number;
  orders_by_status: Record<string, number>;
  stuck_orders_count: number;
  active_incidents_count: number;
  failed_notification_jobs_count: number;
  queued_notification_jobs_count: number;
  generated_at: string;
}

export interface StuckOrderAlert {
  opportunity_id: string;
  title: string;
  vendor_id: string;
  vendor_name: string;
  customer_id: string;
  customer_name: string;
  status: string;
  duration_hours: number;
  threshold_hours: number;
  status_entered_at: string;
  severity: string;
  recommendation: string;
}

export interface AdminAuditLog {
  id: string;
  actor_id?: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  previous_state?: any;
  new_state?: any;
  reason?: string;
  metadata?: any;
  created_at: string;
}

export async function getNotificationPreferences(): Promise<NotificationPreference | null> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') : null;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}/notifications/preferences`, { headers, cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  } catch {
    return null;
  }
}

export async function updateNotificationPreferences(pref: Partial<NotificationPreference>): Promise<NotificationPreference | null> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}/notifications/preferences`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(pref),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  } catch {
    return null;
  }
}

export async function getFilteredNotifications(params: {
  page?: number;
  pageSize?: number;
  type?: string;
  unreadOnly?: boolean;
}): Promise<{ notifications: UserNotification[]; total_count: number; page: number; page_size: number; unread_count: number }> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') : null;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const q = new URLSearchParams();
    if (params.page) q.set('page', params.page.toString());
    if (params.pageSize) q.set('page_size', params.pageSize.toString());
    if (params.type) q.set('type', params.type);
    if (params.unreadOnly !== undefined) q.set('unread_only', params.unreadOnly ? 'true' : 'false');

    const res = await fetch(`${API_BASE_URL}/notifications?${q.toString()}`, { headers, cache: 'no-store' });
    if (!res.ok) return { notifications: [], total_count: 0, page: 1, page_size: 20, unread_count: 0 };
    const json = await res.json();
    const data = json.data;
    if (data && data.notifications) {
      return {
        notifications: data.notifications || [],
        total_count: data.total_count || 0,
        page: data.page || 1,
        page_size: data.page_size || 20,
        unread_count: data.unread_count || 0,
      };
    }
    return {
      notifications: Array.isArray(data) ? data : [],
      total_count: Array.isArray(data) ? data.length : 0,
      page: 1,
      page_size: 50,
      unread_count: 0,
    };
  } catch {
    return { notifications: [], total_count: 0, page: 1, page_size: 20, unread_count: 0 };
  }
}

export async function getAdminOperationsMetrics(): Promise<AdminDashboardMetrics | null> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') : null;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}/admin/operations/metrics`, { headers, cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  } catch {
    return null;
  }
}

export async function getAdminStuckOrders(): Promise<StuckOrderAlert[]> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') : null;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}/admin/operations/stuck-orders`, { headers, cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

export async function getAdminAuditLogs(params?: {
  entityType?: string;
  actorId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ logs: AdminAuditLog[]; total: number; limit: number; offset: number }> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') : null;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const q = new URLSearchParams();
    if (params?.entityType) q.set('entity_type', params.entityType);
    if (params?.actorId) q.set('actor_id', params.actorId);
    if (params?.limit) q.set('limit', params.limit.toString());
    if (params?.offset) q.set('offset', params.offset.toString());

    const res = await fetch(`${API_BASE_URL}/admin/operations/audit-logs?${q.toString()}`, { headers, cache: 'no-store' });
    if (!res.ok) return { logs: [], total: 0, limit: 20, offset: 0 };
    const json = await res.json();
    return {
      logs: json.data?.logs || [],
      total: json.data?.total || 0,
      limit: json.data?.limit || 20,
      offset: json.data?.offset || 0,
    };
  } catch {
    return { logs: [], total: 0, limit: 20, offset: 0 };
  }
}

export async function suspendVendor(vendorId: string, reason: string): Promise<boolean> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}/admin/vendors/${vendorId}/suspend`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function reactivateVendor(vendorId: string, reason = ''): Promise<boolean> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}/admin/vendors/${vendorId}/reactivate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getAdminIncidents(): Promise<any[]> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') : null;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}/admin/operations/incidents`, { headers, cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

export async function actionAdminIncident(incidentId: string, payload: {
  action: string;
  handler_id?: string;
  note?: string;
  resolution_notes?: string;
  replacement_vehicle_id?: string;
  replacement_driver_id?: string;
  resume_transit?: boolean;
}): Promise<boolean> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('uop_access_token') : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}/admin/operations/incidents/${incidentId}/action`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}
