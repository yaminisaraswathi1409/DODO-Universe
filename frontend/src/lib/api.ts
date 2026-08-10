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
  trust_score: number;
  is_verified: boolean;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  default_workflow: string;
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
  parent_opportunity_id?: string;
  created_at: string;
}

export interface SpatialMatch {
  id: string;
  opportunity_id: string;
  matched_user_id: string;
  matched_user?: UserProfile;
  status: string;
  match_score: number;
  distance_meters: number;
}

// Fetch Public Categories for SEO pages & Nav
export async function getCategories(): Promise<Category[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/categories`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    console.error('Failed to fetch categories:', err);
    return [];
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
  } catch (err) {
    console.error('Failed to fetch public opportunities:', err);
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
  } catch (err) {
    console.error(`Failed to fetch opportunity ${id}:`, err);
    return null;
  }
}

// Authenticated API helper (uses Supabase JWT Token)
export async function createOpportunity(payload: Partial<Opportunity>, jwtToken: string): Promise<Opportunity | null> {
  const res = await fetch(`${API_BASE_URL}/opportunities`, {
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

// PostGIS Proximity Spatial Matching
export async function getSpatialMatches(oppID: string, jwtToken: string): Promise<SpatialMatch[]> {
  const res = await fetch(`${API_BASE_URL}/opportunities/${oppID}/matches`, {
    headers: {
      'Authorization': `Bearer ${jwtToken}`,
    },
  });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
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
