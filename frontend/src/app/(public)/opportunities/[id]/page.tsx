import React from 'react';
import Link from 'next/link';
import { Metadata } from 'next';
import { getOpportunityByID } from '@/lib/api';
import OpportunityDetailClient from '@/components/OpportunityDetailClient';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const opp = await getOpportunityByID(params.id);
  if (!opp) {
    return { title: 'Opportunity Not Found | UOP' };
  }

  return {
    title: `${opp.title} | Universal Opportunity Platform`,
    description: opp.description,
    openGraph: {
      title: `${opp.title} (${opp.type})`,
      description: opp.description,
      url: `https://uop.platform/opportunities/${opp.id}`,
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: opp.title,
      description: opp.description,
    },
  };
}

export default async function OpportunityDetailPage({ params }: { params: { id: string } }) {
  const opp = await getOpportunityByID(params.id);

  if (!opp) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6">
        <div className="bg-white p-10 rounded-3xl text-center max-w-md border border-slate-200 shadow-xl">
          <h2 className="text-2xl font-black text-slate-900">Opportunity Not Found</h2>
          <p className="text-slate-600 text-sm mt-2">The opportunity requested does not exist or has been completed.</p>
          <Link href="/opportunities" className="mt-6 inline-block px-6 py-2.5 rounded-xl bg-black text-white hover:bg-slate-800 font-semibold text-sm transition-all shadow-md">
            Return to Feed
          </Link>
        </div>
      </div>
    );
  }

  // Schema.org Structured Data (JSON-LD)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Demand',
    'name': opp.title,
    'description': opp.description,
    'areaServed': opp.address_text || 'PostGIS Spatial Area',
    'itemOffered': {
      '@type': 'Service',
      'name': opp.title,
      'category': opp.category?.name || 'General Service',
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <OpportunityDetailClient initialOpp={opp} />
    </>
  );
}
