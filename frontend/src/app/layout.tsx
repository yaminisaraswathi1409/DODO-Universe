import type { Metadata, Viewport } from 'next';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'Universal Opportunity Platform | AI Voice-First Ecosystem',
  description: 'Connect human needs with available people, equipment, and services instantly. AI-powered voice platform for farming, transport, rentals, and home services.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'UOP',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://uop.platform',
    title: 'Universal Opportunity Platform (UOP)',
    description: 'Every person can request help. Every person can provide help. Powered by Go microservices & PostGIS.',
    siteName: 'Universal Opportunity Platform',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Universal Opportunity Platform (UOP)',
    description: 'Voice-First AI Ecosystem connecting Needs with Offers.',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(
                    function(registration) {
                      console.log('[UOP PWA] ServiceWorker registration successful with scope: ', registration.scope);
                    },
                    function(err) {
                      console.log('[UOP PWA] ServiceWorker registration failed: ', err);
                    }
                  );
                });
              }
            `,
          }}
        />
      </head>
      <body className="bg-[#090d16] text-slate-100 antialiased min-h-screen flex flex-col selection:bg-blue-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
