/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /** Les navigateurs demandent souvent /favicon.ico ; on sert le logo PNG (accepté comme favicon). */
  async rewrites() {
    return [{ source: '/favicon.ico', destination: '/ada-papers-logo.png' }];
  },
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3005',
        pathname: '/uploads/**',
      },
      {
        protocol: 'https',
        hostname: 'pawlegalfinal.onrender.com',
        pathname: '/uploads/**',
      },
    ],
  },
};

module.exports = nextConfig;