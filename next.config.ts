import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/demo/dorimos': ['./public/demo/box-*.png'],
    '/api/clinical/dorimos': ['./public/demo/box-*.png'],
    '/api/mobile/v1/dorimos': ['./public/demo/box-*.png'],
    '/api/demo/exercise-analysis': ['./public/demo/pose-cdc-lower-body.mp4', './public/demo/pose-cdc-contact-sheet.jpg'],
    '/api/mobile/v1/exercise/sample-ai': ['./public/demo/pose-cdc-lower-body.mp4', './public/demo/pose-cdc-contact-sheet.jpg'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'Content-Security-Policy', value: "connect-src 'self' blob: https://*.supabase.co wss://*.supabase.co" }],
      },
      {
        source: '/tg',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
      {
        source: '/caregiver/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;
