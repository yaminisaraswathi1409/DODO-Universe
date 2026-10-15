import { Category } from './api';

export interface ParentCategoryGroup {
  id: string;
  name: string;
  description: string;
  icon: string;
  childSlugs: string[];
}

export const PARENT_CATEGORY_GROUPS: ParentCategoryGroup[] = [
  {
    id: 'labour-group',
    name: 'LABOUR & WORKFORCE',
    description: 'Manual labour, loading/unloading, construction workers, farm hands & skilled site workforce',
    icon: 'Users',
    childSlugs: ['labour-services', 'construction-labour', 'farm-labour'],
  },
  {
    id: 'building-construction',
    name: 'BUILDING & CONSTRUCTION',
    description: 'Bricks, cement, construction supplies, heavy machinery & equipment rental',
    icon: 'Package',
    childSlugs: ['bricks-building-materials', 'cement-construction', 'equipment-machinery'],
  },
  {
    id: 'transport-delivery',
    name: 'TRANSPORT & DELIVERY',
    description: 'Freight transport, flatbed trucks, courier & delivery logistics',
    icon: 'Truck',
    childSlugs: ['logistics-transport', 'flatbed-transport'],
  },
  {
    id: 'vehicle-repair-group',
    name: 'VEHICLE & REPAIR',
    description: 'Vehicle mechanics, emergency roadside breakdown repair, auto parts & driver hire',
    icon: 'Wrench',
    childSlugs: ['vehicle-repair', 'roadside-repair', 'auto-parts-procurement', 'commercial-driver'],
  },
  {
    id: 'home-services-group',
    name: 'HOME SERVICES',
    description: 'Electricians, plumbers, carpenters, house repair & maintenance',
    icon: 'Home',
    childSlugs: ['home-services'],
  },
  {
    id: 'health-medicine',
    name: 'HEALTH & MEDICINE',
    description: 'Emergency medicine delivery, healthcare & medical supply services',
    icon: 'HeartPulse',
    childSlugs: ['medicine-healthcare'],
  },
  {
    id: 'agriculture-group',
    name: 'AGRICULTURE',
    description: 'Farming equipment, tractor rental, rotavator, harvesters & agricultural labor',
    icon: 'Tractor',
    childSlugs: ['agriculture-farming'],
  },
  {
    id: 'professional-other',
    name: 'PROFESSIONAL & OTHER',
    description: 'Tutoring, skill education, vocational training & professional services',
    icon: 'BookOpen',
    childSlugs: ['education-tutoring'],
  },
];

/**
 * Determine dynamic user action label based on service type / category slug
 */
export function getServiceActionLabel(category: Category | null | undefined): string {
  if (!category) return 'Book Service';
  const slug = (category.slug || '').toLowerCase();
  const name = (category.name || '').toLowerCase();

  // Labour & Workforce
  if (
    slug.includes('labour') ||
    slug.includes('worker') ||
    name.includes('labour') ||
    name.includes('worker')
  ) {
    return 'Book Labour';
  }

  // Products / Materials
  if (
    slug.includes('bricks') ||
    slug.includes('cement') ||
    slug.includes('parts') ||
    name.includes('brick') ||
    name.includes('cement') ||
    name.includes('part')
  ) {
    return 'Add to Cart';
  }

  // Transport & Delivery
  if (
    slug.includes('transport') ||
    slug.includes('logistics') ||
    slug.includes('freight') ||
    name.includes('transport') ||
    name.includes('logistics') ||
    name.includes('freight')
  ) {
    return 'Book Transport';
  }

  // Breakdown & Mechanics
  if (
    slug.includes('repair') ||
    slug.includes('mechanic') ||
    name.includes('repair') ||
    name.includes('mechanic')
  ) {
    return 'Book Repair';
  }

  // Default Service
  return 'Book Service';
}

/**
 * Group database categories into parent hierarchy groups
 */
export function getGroupedCategories(categories: Category[]): { parent: ParentCategoryGroup; children: Category[] }[] {
  const categoryMap = new Map<string, Category>();
  categories.forEach((cat) => categoryMap.set(cat.slug, cat));

  const assignedSlugs = new Set<string>();

  const result = PARENT_CATEGORY_GROUPS.map((group) => {
    const children: Category[] = [];
    group.childSlugs.forEach((slug) => {
      if (categoryMap.has(slug)) {
        children.push(categoryMap.get(slug)!);
        assignedSlugs.add(slug);
      }
    });
    return { parent: group, children };
  });

  // Catch any remaining unmapped categories under Professional & Other
  const unassigned = categories.filter((cat) => !assignedSlugs.has(cat.slug));
  if (unassigned.length > 0) {
    const otherGroup = result.find((r) => r.parent.id === 'professional-other');
    if (otherGroup) {
      otherGroup.children.push(...unassigned);
    }
  }

  return result.filter((r) => r.children.length > 0);
}
