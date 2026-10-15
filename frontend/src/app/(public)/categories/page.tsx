import React from 'react';
import Link from 'next/link';
import { Metadata } from 'next';
import { getCategories } from '@/lib/api';
import { getGroupedCategories, getServiceActionLabel } from '@/lib/categoryHierarchy';
import { ArrowLeft, Tractor, Truck, Wrench, Home, HeartPulse, BookOpen, Layers, Package, ShoppingBag } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Explore Categories | Universal Opportunity Platform',
  description: 'Browse organized service & product categories for building materials, transport, vehicle repair, home services, healthcare, and agriculture.',
  openGraph: {
    title: 'Platform Service Categories | UOP',
    description: 'Find opportunities or offer services organized by clear parent categories.',
  },
};

const iconMap: Record<string, React.ReactNode> = {
  Package: <Package className="w-6 h-6 text-black" />,
  Truck: <Truck className="w-6 h-6 text-black" />,
  Wrench: <Wrench className="w-6 h-6 text-black" />,
  Home: <Home className="w-6 h-6 text-black" />,
  HeartPulse: <HeartPulse className="w-6 h-6 text-black" />,
  Tractor: <Tractor className="w-6 h-6 text-black" />,
  BookOpen: <BookOpen className="w-6 h-6 text-black" />,
  Layers: <Layers className="w-6 h-6 text-black" />,
};

export default async function CategoriesPage() {
  const categories = await getCategories();
  const grouped = getGroupedCategories(categories);

  // Schema.org Structured Data (JSON-LD)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    'itemListElement': categories.map((cat, index) => ({
      '@type': 'ListItem',
      'position': index + 1,
      'name': cat.name,
      'description': cat.description,
      'url': `https://uop.platform/opportunities?category=${cat.slug}`,
    })),
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 px-4 sm:px-6 py-10 sm:py-12">
      {/* Schema.org Injection */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="max-w-6xl mx-auto space-y-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-black transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>

        <div>
          <span className="text-xs font-black text-slate-900 uppercase tracking-widest">Marketplace Hierarchy</span>
          <h1 className="text-3xl sm:text-5xl font-black text-slate-900 mt-2">Service & Product Categories</h1>
          <p className="text-slate-600 mt-3 max-w-2xl text-sm sm:text-base">
            Organized into clear parent categories to help you easily find building materials, transport logistics, vehicle repairs, home services, and more.
          </p>
        </div>

        {/* Parent Category Groups */}
        <div className="space-y-12">
          {grouped.map(({ parent, children }) => (
            <div key={parent.id} className="space-y-4 pt-6 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-wide uppercase flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-black inline-block" />
                    <span>{parent.name}</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">{parent.description}</p>
                </div>
                <span className="px-3 py-1 rounded-full bg-slate-100 border border-slate-300 text-xs font-mono font-bold text-slate-700">
                  {children.length} {children.length === 1 ? 'Service' : 'Services'}
                </span>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                {children.map((cat) => {
                  const actionLabel = getServiceActionLabel(cat);
                  return (
                    <Link key={cat.id} href={`/opportunities?category=${cat.slug}`}>
                      <div className="bg-white hover:bg-slate-50 p-6 rounded-2xl border border-slate-200 flex flex-col justify-between h-full group shadow-sm hover:shadow-md transition-all">
                        <div className="space-y-3">
                          <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 w-fit text-black group-hover:scale-105 transition-transform">
                            {iconMap[cat.icon] || <Layers className="w-6 h-6 text-black" />}
                          </div>
                          <h3 className="font-bold text-base text-slate-900 group-hover:text-black transition-colors">
                            {cat.name}
                          </h3>
                          <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                            {cat.description}
                          </p>
                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-900">
                          <span className="flex items-center gap-1.5 text-slate-700">
                            <ShoppingBag className="w-3.5 h-3.5 text-black" />
                            <span>{actionLabel}</span>
                          </span>
                          <span className="group-hover:translate-x-0.5 transition-transform">Explore →</span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
