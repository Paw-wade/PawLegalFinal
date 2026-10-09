const { normalizeDomains } = require('./organizationDto');

/**
 * Checklist opérationnelle pour un nouveau cabinet (DNS, Vercel, Brevo, etc.).
 * @param {object} org
 */
function buildDnsChecklist(org) {
  const domains = normalizeDomains(org);
  const localhostDomains = domains.filter((d) => d.includes('localhost'));
  const prodCandidates = domains.filter((d) => !d.includes('localhost'));
  const primaryProd =
    prodCandidates[0] ||
    (org.slug ? `${String(org.slug).replace(/^cabinet-/, '')}.adapapers.fr` : 'votre-domaine.fr');

  const cloudinaryFolder = org.slug ? `cabinets/${org.slug}/` : 'cabinets/{slug}/';

  return {
    slug: org.slug,
    orgId: org._id ? String(org._id) : undefined,
    primaryDomain: primaryProd,
    devDomains: localhostDomains,
    steps: [
      {
        id: 'mongodb',
        title: 'Base MongoDB (Atlas)',
        description:
          'Créer une base dédiée et renseigner mongoUri dans la fiche cabinet (ou variable TENANT_*_MONGODB_URI).',
        done: Boolean(org.mongoUri),
        link: 'https://cloud.mongodb.com/',
      },
      {
        id: 'organization',
        title: 'Fiche organization (base maître)',
        description: `Document dans adapapers_master.organizations — slug « ${org.slug} ».`,
        done: Boolean(org._id),
      },
      {
        id: 'provision-admin',
        title: 'Premier administrateur cabinet',
        description:
          'Utiliser « Provisionner un admin » dans la console ou npm run seed:tenants après configuration de l’URI.',
        done: false,
        hint: 'POST /api/platform/organizations/:slug/provision-admin',
      },
      {
        id: 'dns',
        title: 'DNS',
        description: `Pointer ${primaryProd} (et www) vers Vercel ou votre hébergeur frontend.`,
        done: false,
        records: [
          { type: 'CNAME', name: primaryProd, value: 'cname.vercel-dns.com (exemple Vercel)' },
          { type: 'CNAME', name: `www.${primaryProd}`, value: 'cname.vercel-dns.com' },
        ],
      },
      {
        id: 'vercel',
        title: 'Domaine Vercel',
        description: `Projet frontend → Settings → Domains → ajouter ${primaryProd} et www.${primaryProd}.`,
        done: false,
        link: 'https://vercel.com/docs/projects/domains',
      },
      {
        id: 'cors',
        title: 'CORS backend',
        description:
          'Les domaines listés dans organizations.domains sont chargés automatiquement (tenantCorsOrigins). En local : CORS_ALLOW_LOCALHOST=true.',
        done: domains.length > 0,
      },
      {
        id: 'brevo',
        title: 'Emails (Brevo)',
        description: 'Configurer email.from, replyTo et brevoApiKey pour ce cabinet.',
        done: Boolean(org.email?.from && org.email?.brevoApiKey),
      },
      {
        id: 'cloudinary',
        title: 'Fichiers (Cloudinary)',
        description: `UPLOAD_STORAGE=cloudinary — dossier cible : ${cloudinaryFolder}`,
        done: false,
      },
      {
        id: 'seed-dev',
        title: 'Domaines de développement (optionnel)',
        description: localhostDomains.length
          ? `Configurés : ${localhostDomains.join(', ')}`
          : `Ex. ${org.slug}.localhost dans /etc/hosts ou hosts Windows.`,
        done: localhostDomains.length > 0,
      },
    ],
  };
}

module.exports = { buildDnsChecklist };
