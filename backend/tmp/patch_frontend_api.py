path = 'frontend/src/lib/api.ts'
with open(path, 'rb') as f:
    raw = f.read()

is_crlf = b'\r\n' in raw
text = raw.decode('utf-8')

old_interface = """export interface VendorCatalogItem {
  id: string;
  vendor_asset_id?: string;
  vendor_asset?: UserServiceAsset;
  vendor_user_id: string;
  vendor_user?: UserProfile;
  category_id?: string;
  category?: Category;
  title: string;
  description?: string;
  sku?: string;
  unit_price: number;
  price_unit: string;
  stock_quantity?: number;
  min_order_quantity?: number;
  images?: string[];
  attributes?: Record<string, any>;
  status?: 'PENDING_ADMIN_APPROVAL' | 'ACTIVE_IN_CATALOG' | 'APPROVED' | 'REJECTED';
  rejection_reason?: string;
  pickup_lat?: number;
  pickup_lng?: number;
  pickup_address?: string;
  is_available: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}"""

new_interface = """export interface AdditionalServiceItem {
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
}"""

old_funcs = """export async function rejectCatalogItem(id: string, rejectionReason: string): Promise<VendorCatalogItem> {
  const res = await fetch(`${API_BASE_URL}/admin/catalog/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rejection_reason: rejectionReason }),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}"""

new_funcs = """export async function rejectCatalogItem(id: string, rejectionReason: string): Promise<VendorCatalogItem> {
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
}"""

if is_crlf:
    old_interface = old_interface.replace('\n', '\r\n')
    new_interface = new_interface.replace('\n', '\r\n')
    old_funcs = old_funcs.replace('\n', '\r\n')
    new_funcs = new_funcs.replace('\n', '\r\n')

assert old_interface in text, "old_interface not found"
assert old_funcs in text, "old_funcs not found"

text = text.replace(old_interface, new_interface, 1)
text = text.replace(old_funcs, new_funcs, 1)

with open(path, 'wb') as f:
    f.write(text.encode('utf-8'))
print("Successfully updated frontend/src/lib/api.ts")

