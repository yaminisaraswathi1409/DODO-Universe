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
  Package: <Package className="w-6 h-6 text-blue-400" />,
  Truck: <Truck className="w-6 h-6 text-emerald-400" />,
  Wrench: <Wrench className="w-6 h-6 text-amber-400" />,
  Home: <Home className="w-6 h-6 text-purple-400" />,
  HeartPulse: <HeartPulse className="w-6 h-6 text-rose-400" />,
  Tractor: <Tractor className="w-6 h-6 text-indigo-400" />,
  BookOpen: <BookOpen className="w-6 h-6 text-sky-400" />,
  Layers: <Layers className="w-6 h-6 text-teal-400" />,
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
    <div className="min-h-screen bg-[#090d16] text-slate-100 px-4 sm:px-6 py-10 sm:py-12">
      {/* Schema.org Injection */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="max-w-6xl mx-auto space-y-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>

        <div>
          <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Marketplace Hierarchy</span>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-white mt-2">Service & Product Categories</h1>
          <p className="text-slate-400 mt-3 max-w-2xl text-sm sm:text-base">
            Organized into clear parent categories to help you easily find building materials, transport logistics, vehicle repairs, home services, and more.
          </p>
        </div>

        {/* Parent Category Groups */}
        <div className="space-y-12">
          {grouped.map(({ parent, children }) => (
            <div key={parent.id} className="space-y-4 pt-4 border-t border-slate-800/80">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-wide uppercase flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                    <span>{parent.name}</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">{parent.description}</p>
                </div>
                <span className="px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-mono font-bold text-slate-400">
                  {children.length} {children.length === 1 ? 'Service' : 'Services'}
                </span>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                {children.map((cat) => {
                  const actionLabel = getServiceActionLabel(cat);
                  return (
                    <Link key={cat.id} href={`/opportunities?category=${cat.slug}`}>
                      <div className="glass-panel glass-panel-hover p-6 rounded-2xl border border-slate-800 flex flex-col justify-between h-full group">
                        <div className="space-y-3">
                          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 w-fit text-blue-400 group-hover:scale-105 transition-transform">
                            {iconMap[cat.icon] || <Layers className="w-6 h-6 text-blue-400" />}
                          </div>
                          <h3 className="font-bold text-base text-white group-hover:text-blue-400 transition-colors">
                            {cat.name}
                          </h3>
                          <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                            {cat.description}
                          </p>
                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-bold text-blue-400">
                          <span className="flex items-center gap-1.5 text-emerald-400">
                            <ShoppingBag className="w-3.5 h-3.5" />
                            <span>{actionLabel}</span>
                          </span>
                          <span>Explore →</span>
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
