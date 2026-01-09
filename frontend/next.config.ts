import type { NextConfig } from "next";
import path from "path";

const isElectron = process.env.BUILD_TARGET === 'electron';

const nextConfig: NextConfig = {
  output: isElectron ? 'export' : undefined,
  experimental: {
    proxyClientMaxBodySize: '5gb',
  },
  turbopack: {
    root: path.join(__dirname, '..'),
  },

  images: {
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
        destination: 'http://localhost:8000/api/:path*',
      },
    ];
  },
};

export default nextConfig;
