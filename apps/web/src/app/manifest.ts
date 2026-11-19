import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Prepdle: daily exam-prep games',
    short_name: 'Prepdle',
    description: 'Daily puzzles for MCAT, LSAT, USMLE and the bar exam.',
    start_url: '/?source=pwa',
    display: 'standalone',
    background_color: '#fafaf7',
    theme_color: '#fafaf7',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}
