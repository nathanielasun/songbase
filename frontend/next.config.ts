import type { NextConfig } from "next";
import path from "path";

const isElectron = process.env.BUILD_TARGET === 'electron';

// Backend URL for API proxy (default to localhost for local dev)
const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';

const nextConfig: NextConfig = {
  // Don't use static export - Electron will run Next.js server locally
  // This allows dynamic routes to work properly
  // output: isElectron ? 'export' : undefined,
  experimental: {
    proxyClientMaxBodySize: '5gb',
  },
  turbopack: {
    root: path.join(__dirname, '..'),
  },

  images: {
    // Disable image optimization for static export
    unoptimized: isElectron ? true : false,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        pathname: '/**',
      },
    ],
  },

  async rewrites() {
    if (isElectron) return [];

    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
