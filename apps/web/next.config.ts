import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
];

const config: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  transpilePackages: ['@prepdle/core', '@prepdle/content', '@prepdle/db', '@prepdle/pipeline'],
  serverExternalPackages: ['@electric-sql/pglite', 'postgres'],
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_LAUNCH_DATE: process.env.LAUNCH_DATE ?? '2026-07-15',
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version ?? '1.0.0',
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/dict/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/vocab/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/' }] },
    ];
  },
};

export default config;
