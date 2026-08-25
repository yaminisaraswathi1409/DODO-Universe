import React from 'react';
import Link from 'next/link';
import { Metadata } from 'next';
import { getCategories } from '@/lib/api';
import { ArrowLeft, Tractor, Truck, Wrench, Home, HeartPulse, BookOpen, Layers } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Explore Categories | Universal Opportunity Platform',
  description: 'Browse available categories for farming, tractor rental, transport, equipment, home services, healthcare, and education.',
  openGraph: {
    title: 'Platform Categories | UOP',
    description: 'Find opportunities or offer services across all major categories.',
  },
};

const iconMap: Record<string, React.ReactNode> = {
  Tractor: <Tractor className="w-8 h-8 text-blue-400" />,
  Truck: <Truck className="w-8 h-8 text-emerald-400" />,
  Wrench: <Wrench className="w-8 h-8 text-amber-400" />,
  Home: <Home className="w-8 h-8 text-purple-400" />,
  HeartPulse: <HeartPulse className="w-8 h-8 text-rose-400" />,
  BookOpen: <BookOpen className="w-8 h-8 text-indigo-400" />,
};

export default async function CategoriesPage() {
  const categories = await getCategories();

  // Schema.org Structured Data (JSON-LD) for Search Engine Rich Snippets
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    'itemListElement': categories.map((cat, index) => ({
      '@type': 'ListItem',
      'position': index + 1,
      'name': cat.name,
      'description': cat.description,
      'url': `https://uop.platform/categories?slug=${cat.slug}`,
    })),
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 px-6 py-12">
      {/* Schema.org Injection */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="max-w-6xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>

        <div className="mb-12">
          <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Platform Index</span>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-white mt-2">Browse All Categories</h1>
          <p className="text-slate-400 mt-3 max-w-2xl text-base">
            Every category is powered by a dedicated Opportunity Workflow plugin, matching localized Needs with available Offers.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map((cat) => (
            <Link key={cat.id} href={`/opportunities?category=${cat.slug}`}>
              <div className="glass-panel glass-panel-hover p-6 rounded-2xl border border-slate-800 flex flex-col h-full">
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 w-fit mb-4">
                  {iconMap[cat.icon] || <Layers className="w-8 h-8 text-blue-400" />}
                </div>
                <h3 className="font-bold text-xl text-white">{cat.name}</h3>
                <p className="text-sm text-slate-400 mt-2 flex-grow">{cat.description}</p>
                <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-medium text-blue-400">
                  <span>Default Plugin: {cat.default_workflow}</span>
                  <span>View Listings →</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
