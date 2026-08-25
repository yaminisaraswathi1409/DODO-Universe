const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';

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

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  default_workflow: string;
  required_documents?: RequiredDocumentSpec[];
  opportunity_fields?: OpportunityFieldSpec[];
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
  created_at?: string;
  updated_at?: string;
}


export interface Opportunity {
  id: string;
  user_id: string;
  user?: UserProfile;
  category_id?: string;
  category?: Category;
  type: 'NEED' | 'OFFER';
  title: string;
  description: string;
  workflow_model: string;
  status: string;
  lat: number;
  lng: number;
  address_text?: string;
  radius_km: number;
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
  if (typeof window === 'undefined') return '00000000-0000-0000-0000-000000000001';
  try {
    const directToken = localStorage.getItem('uop_token');
    if (directToken && directToken.trim() !== '') return directToken;
    const userStr = localStorage.getItem('uop_user');
    if (userStr) {
      const u = JSON.parse(userStr);
      if (u.token) return u.token;
      if (u.supabase_uid) return u.supabase_uid;
      if (u.id) return u.id;
    }
  } catch {
    // fallback
  }
  return '00000000-0000-0000-0000-000000000001';
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

export async function updateOpportunityStatus(id: string, status: string): Promise<Opportunity | null> {
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
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
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

export async function signupUser(payload: { full_name: string; phone: string; email?: string }): Promise<{ user: UserProfile; dev_otp_code?: string } | null> {
  const res = await fetch(`${API_BASE_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function requestOTP(phone: string): Promise<{ user: UserProfile; dev_otp_code?: string } | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.message || errJson?.error || 'Failed to request OTP code');
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

export async function verifyOTP(phone: string, otpCode: string): Promise<UserProfile | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/users/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, otp_code: otpCode }),
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.message || errJson?.error || 'Failed to verify OTP code');
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

export async function uploadFile(file: File): Promise<{ url: string; filename: string; mimetype: string; size_bytes: number }> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE_URL}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || 'File upload failed');
  }

  const json = await res.json();
  return json.data;
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




