/**
 * Proxifie uniquement les chemins backend connus.
 * Jamais tout `/api/*` : sinon NextAuth (`/api/auth/session`, `providers`, …) part sur Express avec `protect` → 401.
 * @param {string} backendOrigin
 */
function devApiRewriteRules(backendOrigin) {
  const t = backendOrigin.replace(/\/+$/, '');

  /** Correspond aux routes sous `routes/auth.js` uniquement */
  const expressAuthStubs = [
    'login',
    'register',
    'resend-activation',
    'complete-signup',
    'google-login',
    'forgot-password',
    'forgot-password-phone',
    'reset-password-phone',
    'setup-password',
    'reset-password',
    'login-phone',
    'me',
  ];

  /** Segment après `/api/` pour les routers montés sur `/api/:segment` dans `server.js` */
  const apiSegmentsWithSubpaths = [
    'legal',
    'judilibre',
    'contact',
    'otp',
    'permissions',
    'document-requests',
    'user',
    'tasks',
    'messages',
    'content',
    'media',
    'appointments',
    'forum',
    'logs',
    'notifications',
    'push',
    'trash',
    'sms',
    'email',
    'creneaux',
    'lexia',
    'paw-search',
    'sms-templates',
    'sms-history',
    'temoignages',
    'tenant',
    'platform',
    'public',
    'collaborative-drafts',
    'dossier-document-drafts',
    'dossier-guest-upload',
    'document-download-share',
    'dossiers',
    'drafts',
    'recours',
  ];

  const rules = [];
  for (const stub of expressAuthStubs) {
    rules.push({ source: `/api/auth/${stub}`, destination: `${t}/api/auth/${stub}` });
    rules.push({ source: `/api/auth/${stub}/:rest*`, destination: `${t}/api/auth/${stub}/:rest*` });
  }
  for (const seg of apiSegmentsWithSubpaths) {
    rules.push({ source: `/api/${seg}`, destination: `${t}/api/${seg}` });
    rules.push({ source: `/api/${seg}/:path*`, destination: `${t}/api/${seg}/:path*` });
  }
  return rules;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /** Rewrites dev : défaut 30s — insuffisant pour uploads Cloudinary */
  experimental: {
    proxyTimeout: 180000,
  },
  /**
   * Dev : proxy granular vers le backend (3005).
   * NextAuth `/api/auth/*` (sauf stubs Express listés ci-dessus) reste géré par Next.js.
   */
  async rewrites() {
    const list = [{ source: '/favicon.ico', destination: '/ada-papers-logo.png' }];
    if (process.env.NODE_ENV === 'development') {
      const target = process.env.NEXT_PROXY_API_TARGET || 'http://127.0.0.1:3005';
      list.push(...devApiRewriteRules(target));
    }
    return list;
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
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
    ],
  },
};

module.exports = nextConfig;