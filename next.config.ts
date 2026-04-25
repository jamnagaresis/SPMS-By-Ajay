import type { NextConfig } from "next";

const nextConfig = {
  // Turbopack config to silence the error (Next.js 16 requirement when webpack is present)
  turbopack: {
    resolveAlias: {
      canvas: './lib/canvas-mock.js', // Mock canvas for pdfjs-dist
      encoding: './lib/canvas-mock.js',
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  webpack: (config: any) => {
    // Resolve canvas dependency issue for pdfjs-dist
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    return config;
  },
};

export default nextConfig;
