import type { NextConfig } from "next";

const isElectron = process.env.BUILD_TARGET === 'electron';

const nextConfig: NextConfig = {
  output: isElectron ? 'export' : undefined,

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
