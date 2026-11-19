import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { Providers } from '@/components/shell/Providers';
import '@/styles/globals.css';

const inter = Inter({ subsets: ['latin', 'greek'], display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = {
  title: { default: 'Prepdle: daily exam-prep games', template: '%s · Prepdle' },
  description: 'Daily, shareable puzzle games for MCAT, LSAT, USMLE boards and the bar exam. No account needed.',
  applicationName: 'Prepdle',
  appleWebApp: { capable: true, title: 'Prepdle', statusBarStyle: 'default' },
  icons: { icon: '/icons/icon.svg', apple: '/icons/apple-touch-icon.png' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#fafaf7',
};

// Applies theme before paint to avoid a flash (reads the same localStorage key as the store).
const THEME_SCRIPT = `(function(){try{var s=JSON.parse(localStorage.getItem('pd:v1:settings')||'{}');var d=s.theme==='dark'||((!s.theme||s.theme==='system')&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.dataset.theme=d?'dark':'light';if(s.highContrast)r.dataset.contrast='high';if(s.reduceMotion==='on')r.dataset.motion='reduce';}catch(e){}})();`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body style={{ fontFamily: 'var(--font-inter), var(--font-sans)' }}>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:p-2">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
