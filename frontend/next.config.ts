import type { NextConfig } from "next";
import path from "path";

const isElectron = process.env.BUILD_TARGET === 'electron';
const isDocker = process.env.DOCKER_BUILD === 'true';

// Backend URL for API proxy (default to localhost for local dev)
const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';

const nextConfig: NextConfig = {
  // Use standalone output for Docker builds, export for Electron
  output: isElectron ? 'export' : (isDocker ? 'standalone' : undefined),
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
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
