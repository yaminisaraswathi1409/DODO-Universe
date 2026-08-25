import React from 'react';
import { Metadata } from 'next';
import { getPublicOpportunities } from '@/lib/api';
import OpportunitiesMarketplaceClient from '@/components/OpportunitiesMarketplaceClient';

export const metadata: Metadata = {
  title: 'Opportunities Marketplace | Universal Opportunity Platform',
  description: 'Post real Needs ("I Need Help") and Offers ("I Can Offer"). Matched via PostGIS proximity and category intelligence.',
};

export default async function OpportunitiesListingPage({
  searchParams,
}: {
  searchParams: { category?: string; type?: string };
}) {
  const category = searchParams.category || '';
  const type = searchParams.type || '';
  const { data: opportunities, total } = await getPublicOpportunities(category, type, 1);

  return (
    <OpportunitiesMarketplaceClient
      initialOpportunities={opportunities}
      initialTotal={total}
      initialCategory={category}
      initialType={type}
    />
  );
}
