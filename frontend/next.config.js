/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
 
  async redirects() {
    return [
      {
        source: '/logs',
        destination: '/admin/logs',
        permanent: false,
      },
    ];
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