import { MetadataRoute } from 'next';
import { getCategories, getPublicOpportunities } from '@/lib/api';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://uop.platform';

  // Base static routes
  const routes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/categories`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/opportunities`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.9,
    },
  ];

  // Dynamic Category Pages
  const categories = await getCategories();
  const categoryUrls: MetadataRoute.Sitemap = categories.map((cat) => ({
    url: `${baseUrl}/categories?slug=${cat.slug}`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  // Dynamic Public Opportunities Pages
  const { data: opportunities } = await getPublicOpportunities('', '', 1);
  const oppUrls: MetadataRoute.Sitemap = opportunities.map((opp) => ({
    url: `${baseUrl}/opportunities/${opp.id}`,
    lastModified: new Date(opp.created_at || Date.now()),
    changeFrequency: 'hourly',
    priority: 0.7,
  }));

  return [...routes, ...categoryUrls, ...oppUrls];
}
