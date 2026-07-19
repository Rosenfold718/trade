import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  output: 'standalone',
  // Vercel overrides standalone output
  ...(process.env.VERCEL ? { output: undefined } : {}),
  allowedDevOrigins: [
    ".space-z.ai",
  ],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "frame-ancestors 'self' https://s.tradingview.com https://www.tradingview.com https://preview-*.space-z.ai",
              "frame-src 'self' https://s.tradingview.com https://www.tradingview.com https://s3.tradingview.com",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://s3.tradingview.com https://s.tradingview.com",
              "connect-src 'self' https://api.binance.com",
            ].join('; '),
          },
          {
            key: 'X-Frame-Options',
            value: 'ALLOWALL',
          },
        ],
      },
    ];
  },
};

export default nextConfig;