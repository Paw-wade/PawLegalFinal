const { normalizeDomains } = require('./organizationDto');
const { checkTenantOrgHealth } = require('./tenantOrgHealth');

function baseChecklist(org, health) {
  const domains = normalizeDomains(org);
  const localhostDomains = domains.filter((d) => d.includes('localhost'));
  const prodCandidates = domains.filter((d) => !d.includes('localhost'));
  const primaryProd =
    prodCandidates[0] ||
    (org.slug ? `${String(org.slug).replace(/^cabinet-/, '')}.adapapers.fr` : 'votre-domaine.fr');
  const cloudinaryFolder = org.slug ? `cabinets/${org.slug}/` : 'cabinets/{slug}/';
  const hasAdmin = (health?.adminCount || 0) > 0;

  const steps = [
    {
      id: 'mongodb',
      title: 'Base MongoDB (Atlas)',
      description: health?.dbName
        ? `Connexion OK — base « ${health.dbName} » (${health.latencyMs} ms).`
        : health?.error || 'Créer une base dédiée et renseigner mongoUri.',
      done: Boolean(health?.mongoOk && org.mongoUri),
      link: 'https://cloud.mongodb.com/',
    },
    {
      id: 'organization',
      title: 'Fiche organization (base maître)',
      description: `Document adapapers_master.organizations — slug « ${org.slug} ».`,
      done: Boolean(org._id),
    },
    {
      id: 'provision-admin',
      title: 'Premier administrateur cabinet',
      description: hasAdmin
        ? `${health.adminCount} compte(s) admin/superadmin détecté(s) sur ${health.userCount} utilisateur(s).`
        : 'Provisionner un admin depuis la console ou seed:tenants.',
      done: hasAdmin,
    },
    {
      id: 'dns',
      title: 'DNS',
      description: `Pointer ${primaryProd} (et www) vers Vercel ou votre hébergeur.`,
      done: false,
      records: [
        { type: 'CNAME', name: primaryProd, value: 'cname.vercel-dns.com (exemple Vercel)' },
        { type: 'CNAME', name: `www.${primaryProd}`, value: 'cname.vercel-dns.com' },
      ],
    },
    {
      id: 'vercel',
      title: 'Domaine Vercel',
      description: `Ajouter ${primaryProd} et www.${primaryProd} au projet frontend.`,
      done: false,
      link: 'https://vercel.com/docs/projects/domains',
    },
    {
      id: 'cors',
      title: 'CORS backend',
      description:
        'Domaines organizations.domains pris en charge automatiquement. Local : CORS_ALLOW_LOCALHOST=true.',
      done: domains.length > 0,
    },
    {
      id: 'brevo',
      title: 'Emails (Brevo)',
      description: 'Configurer email.from, replyTo et brevoApiKey.',
      done: Boolean(org.email?.from && org.email?.brevoApiKey),
    },
    {
      id: 'cloudinary',
      title: 'Fichiers (Cloudinary)',
      description: `Dossier cible : ${cloudinaryFolder}`,
      done: Boolean(process.env.UPLOAD_STORAGE === 'cloudinary' && process.env.CLOUDINARY_CLOUD_NAME),
    },
    {
      id: 'seed-dev',
      title: 'Domaines de développement',
      description: localhostDomains.length
        ? `Configurés : ${localhostDomains.join(', ')}`
        : `Ex. dupont.localhost:3004`,
      done: localhostDomains.length > 0,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;

  return {
    slug: org.slug,
    orgId: org._id ? String(org._id) : undefined,
    primaryDomain: primaryProd,
    devDomains: localhostDomains,
    progress: { done: doneCount, total: steps.length },
    steps,
    health,
  };
}

async function buildOrgChecklist(org) {
  const health = await checkTenantOrgHealth({
    mongoUri: org.mongoUri,
    orgId: org._id ? String(org._id) : undefined,
  });
  return baseChecklist(org, health);
}

function buildOrgChecklistSync(org) {
  return baseChecklist(org, null);
}

module.exports = { buildOrgChecklist, buildOrgChecklistSync, checkTenantOrgHealth };
