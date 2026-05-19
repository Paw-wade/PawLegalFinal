const express = require('express');
const { isMultiTenantEnabled } = require('../lib/db/master');
const { getOrganizationModel } = require('../models/Organization');
const { getPlatformAuditLogModel } = require('../models/PlatformAuditLog');
const { clearOrganizationCache } = require('../lib/tenant/resolveOrganization');
const { evictTenantConnection } = require('../lib/db/tenants');
const { protect } = require('../middleware/auth');
const { requirePlatformAdmin } = require('../middleware/platformAdmin');
const { toOrganizationDto, validateSlug, normalizeDomains } = require('../lib/platform/organizationDto');
const { buildOrgChecklist, buildOrgChecklistSync } = require('../lib/platform/buildOrgChecklist');
const { checkTenantOrgHealth } = require('../lib/platform/tenantOrgHealth');
const { provisionTenantAdmin } = require('../lib/platform/provisionTenantAdmin');
const { listTenantUsers } = require('../lib/platform/listTenantUsers');
const { logPlatformAudit, auditActor } = require('../lib/platform/platformAudit');
const {
  createPlatformBrandingUpload,
  resolvePlatformBrandingPublicUrl,
} = require('../lib/platform/platformBrandingUpload');

const router = express.Router();

const PROTECTED_ORG_SLUGS = new Set(
  (process.env.PLATFORM_PROTECTED_ORG_SLUGS || 'cabinet-wadepaw')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

router.use(protect);
router.use(requirePlatformAdmin);

router.get('/', async (req, res) => {
  try {
    if (!isMultiTenantEnabled()) {
      return res.status(400).json({
        success: false,
        message: 'Console plateforme disponible uniquement en mode MULTI_TENANT',
      });
    }
    const includeHealth = req.query.includeHealth === 'true' || req.query.includeHealth === '1';
    const Organization = getOrganizationModel();
    const orgs = await Organization.find({}).sort({ slug: 1 }).lean();

    const organizations = await Promise.all(
      orgs.map(async (o) => {
        const dto = toOrganizationDto(o);
        const checklist = buildOrgChecklistSync(o);
        let health = null;
        if (includeHealth) {
          health = await checkTenantOrgHealth({
            mongoUri: o.mongoUri,
            orgId: String(o._id),
          });
        }
        return {
          ...dto,
          checklistProgress: checklist.progress,
          primaryDomain: checklist.primaryDomain,
          health,
        };
      })
    );

    res.json({ success: true, organizations });
  } catch (err) {
    console.error('platform GET /:', err);
    res.status(500).json({ success: false, message: err.message || 'Erreur serveur' });
  }
});

router.get('/:slug/health', async (req, res) => {
  try {
    const Organization = getOrganizationModel();
    const org = await Organization.findOne({ slug: req.params.slug.toLowerCase() }).lean();
    if (!org) {
      return res.status(404).json({ success: false, message: 'Cabinet introuvable' });
    }
    const health = await checkTenantOrgHealth({
      mongoUri: org.mongoUri,
      orgId: String(org._id),
    });
    res.json({ success: true, health });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Erreur serveur' });
  }
});

router.get('/:slug/users', async (req, res) => {
  try {
    const slug = req.params.slug.toLowerCase();
    const Organization = getOrganizationModel();
    const org = await Organization.findOne({ slug }).lean();
    if (!org) {
      return res.status(404).json({ success: false, message: 'Cabinet introuvable' });
    }
    const result = await listTenantUsers({
      mongoUri: org.mongoUri,
      orgId: String(org._id),
      search: req.query.search,
      role: req.query.role,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('platform GET users:', err);
    res.status(500).json({ success: false, message: err.message || 'Erreur serveur' });
  }
});

router.get('/:slug/audit-logs', async (req, res) => {
  try {
    const slug = req.params.slug.toLowerCase();
    const PlatformAuditLog = getPlatformAuditLogModel();
    const logs = await PlatformAuditLog.find({ orgSlug: slug })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({
      success: true,
      logs: logs.map((a) => ({
        id: String(a._id),
        action: a.action,
        orgSlug: a.orgSlug,
        actorEmail: a.actorEmail,
        details: a.details,
        createdAt: a.createdAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Erreur serveur' });
  }
});

router.get('/:slug/dns-checklist', async (req, res) => {
  try {
    const Organization = getOrganizationModel();
    const org = await Organization.findOne({ slug: req.params.slug.toLowerCase() }).lean();
    if (!org) {
      return res.status(404).json({ success: false, message: 'Cabinet introuvable' });
    }
    const checklist = await buildOrgChecklist(org);
    res.json({ success: true, checklist });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Erreur serveur' });
  }
});

router.post('/:slug/branding/upload', async (req, res) => {
  const slug = req.params.slug.toLowerCase();
  try {
    const Organization = getOrganizationModel();
    const org = await Organization.findOne({ slug });
    if (!org) {
      return res.status(404).json({ success: false, message: 'Cabinet introuvable' });
    }

    let upload;
    try {
      upload = createPlatformBrandingUpload(slug);
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message || 'Slug invalide' });
    }

    upload.single('file')(req, res, async (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'Fichier trop volumineux (max. 5 Mo).',
          });
        }
        return res.status(400).json({
          success: false,
          message: err.message || 'Téléversement impossible',
        });
      }

      try {
        if (!req.file) {
          return res.status(400).json({
            success: false,
            message: 'Aucun fichier. Utilisez le champ « file ».',
          });
        }

        const kind = String(req.body?.kind || req.query?.kind || '')
          .trim()
          .toLowerCase();
        if (kind !== 'logo' && kind !== 'favicon') {
          return res.status(400).json({
            success: false,
            message: 'Paramètre kind requis : logo ou favicon',
          });
        }

        const url = resolvePlatformBrandingPublicUrl(req.file, slug);
        const actor = auditActor(req);
        await logPlatformAudit({
          action: 'branding_upload',
          orgSlug: slug,
          orgId: String(org._id),
          actorEmail: actor.email,
          actorId: actor.id,
          details: { kind, url },
        });

        res.status(201).json({
          success: true,
          url,
          kind,
          message: 'Fichier téléversé. Enregistrez le cabinet pour appliquer le branding.',
        });
      } catch (innerErr) {
        console.error('platform branding upload:', innerErr);
        res.status(500).json({
          success: false,
          message: innerErr.message || 'Erreur serveur',
        });
      }
    });
  } catch (err) {
    console.error('platform POST branding/upload:', err);
    res.status(500).json({ success: false, message: err.message || 'Erreur serveur' });
  }
});

router.post('/:slug/provision-admin', async (req, res) => {
  try {
    const slug = req.params.slug.toLowerCase();
    const Organization = getOrganizationModel();
    const org = await Organization.findOne({ slug });
    if (!org) {
      return res.status(404).json({ success: false, message: 'Cabinet introuvable' });
    }
    const { email, password, firstName, lastName, role } = req.body || {};
    const result = await provisionTenantAdmin({
      mongoUri: org.mongoUri,
      orgId: String(org._id),
      email,
      password,
      firstName,
      lastName,
      role: role || 'admin',
    });
    const actor = auditActor(req);
    await logPlatformAudit({
      action: 'provision_admin',
      orgSlug: slug,
      orgId: String(org._id),
      actorEmail: actor.email,
      actorId: actor.id,
      details: { email: result.email, created: result.created },
    });
    res.json({
      success: true,
      message: result.created ? 'Administrateur créé' : 'Administrateur mis à jour',
      ...result,
    });
  } catch (err) {
    console.error('platform provision-admin:', err);
    res.status(400).json({ success: false, message: err.message || 'Échec du provisioning' });
  }
});

router.post('/:slug/reactivate', async (req, res) => {
  try {
    const slug = req.params.slug.toLowerCase();
    const Organization = getOrganizationModel();
    const org = await Organization.findOne({ slug });
    if (!org) {
      return res.status(404).json({ success: false, message: 'Cabinet introuvable' });
    }
    if (org.status !== 'suspended') {
      return res.status(400).json({
        success: false,
        message: 'Seul un cabinet suspendu peut être réactivé',
      });
    }
    org.status = 'active';
    await org.save();
    clearOrganizationCache();
    const actor = auditActor(req);
    await logPlatformAudit({
      action: 'reactivate',
      orgSlug: slug,
      orgId: String(org._id),
      actorEmail: actor.email,
      actorId: actor.id,
    });
    res.json({
      success: true,
      message: 'Cabinet réactivé',
      organization: toOrganizationDto(org.toObject()),
    });
  } catch (err) {
    console.error('platform reactivate:', err);
    res.status(500).json({ success: false, message: err.message || 'Erreur serveur' });
  }
});

router.delete('/:slug/permanent', async (req, res) => {
  try {
    const slug = req.params.slug.toLowerCase();
    if (PROTECTED_ORG_SLUGS.has(slug)) {
      return res.status(403).json({
        success: false,
        message: 'Ce cabinet est protégé et ne peut pas être supprimé',
      });
    }
    const Organization = getOrganizationModel();
    const org = await Organization.findOne({ slug });
    if (!org) {
      return res.status(404).json({ success: false, message: 'Cabinet introuvable' });
    }
    if (org.status !== 'suspended') {
      return res.status(400).json({
        success: false,
        message: 'Suspendez le cabinet avant une suppression définitive',
      });
    }
    const orgId = String(org._id);
    await Organization.deleteOne({ _id: org._id });
    evictTenantConnection(orgId);
    clearOrganizationCache();
    const actor = auditActor(req);
    await logPlatformAudit({
      action: 'delete_permanent',
      orgSlug: slug,
      orgId,
      actorEmail: actor.email,
      actorId: actor.id,
    });
    res.json({
      success: true,
      message:
        'Cabinet retiré de la plateforme (fiche organization supprimée). La base MongoDB tenant n’a pas été effacée.',
      slug,
    });
  } catch (err) {
    console.error('platform delete permanent:', err);
    res.status(500).json({ success: false, message: err.message || 'Erreur serveur' });
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const Organization = getOrganizationModel();
    const org = await Organization.findOne({ slug: req.params.slug.toLowerCase() }).lean();
    if (!org) {
      return res.status(404).json({ success: false, message: 'Cabinet introuvable' });
    }
    const reveal = req.query.reveal === 'true' || req.query.reveal === '1';
    const health = await checkTenantOrgHealth({
      mongoUri: org.mongoUri,
      orgId: String(org._id),
    });
    const checklist = await buildOrgChecklist(org);
    res.json({
      success: true,
      organization: toOrganizationDto(org, { maskSecrets: !reveal }),
      health,
      checklist,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Erreur serveur' });
  }
});

router.post('/', async (req, res) => {
  try {
    if (!isMultiTenantEnabled()) {
      return res.status(400).json({
        success: false,
        message: 'MULTI_TENANT requis pour créer un cabinet',
      });
    }
    const body = req.body || {};
    const slug = String(body.slug || '').trim().toLowerCase();
    const slugErr = validateSlug(slug);
    if (slugErr) {
      return res.status(400).json({ success: false, message: slugErr });
    }
    if (!body.mongoUri?.trim()) {
      return res.status(400).json({ success: false, message: 'mongoUri requis' });
    }
    if (!body.branding?.name?.trim()) {
      return res.status(400).json({ success: false, message: 'branding.name requis' });
    }

    const Organization = getOrganizationModel();
    const exists = await Organization.findOne({ slug });
    if (exists) {
      return res.status(409).json({ success: false, message: 'Ce slug existe déjà' });
    }

    const domains = normalizeDomains({
      domains: body.domains,
      domain: body.domain,
    });

    const org = await Organization.create({
      slug,
      domain: domains[0] || '',
      domains,
      mongoUri: body.mongoUri.trim(),
      status: body.status || 'trial',
      branding: {
        name: body.branding.name.trim(),
        logo: body.branding.logo || '',
        primaryColor: body.branding.primaryColor || '#2A4DD0',
        favicon: body.branding.favicon || '',
      },
      email: {
        from: body.email?.from || '',
        brevoApiKey: body.email?.brevoApiKey || '',
        replyTo: body.email?.replyTo || body.email?.from || '',
      },
      landingPage: body.landingPage || {},
      limits: body.limits || {
        maxUsers: 50,
        maxStorageGb: 20,
        modules: ['dossiers', 'messagerie', 'documents', 'rendez-vous'],
      },
    });

    clearOrganizationCache();
    const actor = auditActor(req);
    await logPlatformAudit({
      action: 'create',
      orgSlug: slug,
      orgId: String(org._id),
      actorEmail: actor.email,
      actorId: actor.id,
      details: { status: org.status },
    });
    const checklist = await buildOrgChecklist(org.toObject());
    res.status(201).json({
      success: true,
      organization: toOrganizationDto(org),
      checklist,
    });
  } catch (err) {
    console.error('platform POST /:', err);
    res.status(400).json({ success: false, message: err.message || 'Création impossible' });
  }
});

router.patch('/:slug', async (req, res) => {
  try {
    const slug = req.params.slug.toLowerCase();
    const Organization = getOrganizationModel();
    const org = await Organization.findOne({ slug });
    if (!org) {
      return res.status(404).json({ success: false, message: 'Cabinet introuvable' });
    }

    const body = req.body || {};
    const prevUri = org.mongoUri;
    const changed = [];

    if (body.status && body.status !== org.status) {
      org.status = body.status;
      changed.push('status');
    }
    if (body.mongoUri?.trim() && body.mongoUri.trim() !== org.mongoUri) {
      org.mongoUri = body.mongoUri.trim();
      changed.push('mongoUri');
    }
    if (body.branding) {
      org.branding = { ...(org.branding.toObject?.() || org.branding), ...body.branding };
      changed.push('branding');
    }
    if (body.email) {
      const prev = org.email.toObject?.() || org.email;
      org.email = { ...prev, ...body.email };
      if (body.email.brevoApiKey === '' || body.email.brevoApiKey === undefined) {
        /* keep existing key if empty sent */
      }
      if (!body.email.brevoApiKey && prev.brevoApiKey) {
        org.email.brevoApiKey = prev.brevoApiKey;
      }
      changed.push('email');
    }
    if (body.landingPage) {
      org.landingPage = { ...(org.landingPage.toObject?.() || org.landingPage), ...body.landingPage };
      changed.push('landingPage');
    }
    if (body.limits) {
      org.limits = { ...(org.limits.toObject?.() || org.limits), ...body.limits };
      changed.push('limits');
    }
    if (body.domains !== undefined || body.domain !== undefined) {
      const domains = normalizeDomains({
        domains: body.domains ?? org.domains,
        domain: body.domain ?? org.domain,
      });
      org.domains = domains;
      org.domain = domains[0] || '';
      changed.push('domains');
    }

    await org.save();
    if (body.mongoUri?.trim() && body.mongoUri.trim() !== prevUri) {
      evictTenantConnection(String(org._id));
    }
    clearOrganizationCache();

    const actor = auditActor(req);
    await logPlatformAudit({
      action: 'update',
      orgSlug: slug,
      orgId: String(org._id),
      actorEmail: actor.email,
      actorId: actor.id,
      details: { fields: changed },
    });

    res.json({
      success: true,
      organization: toOrganizationDto(org.toObject()),
      cacheCleared: true,
    });
  } catch (err) {
    console.error('platform PATCH:', err);
    res.status(400).json({ success: false, message: err.message || 'Mise à jour impossible' });
  }
});

router.delete('/:slug', async (req, res) => {
  try {
    const slug = req.params.slug.toLowerCase();
    const Organization = getOrganizationModel();
    const org = await Organization.findOne({ slug });
    if (!org) {
      return res.status(404).json({ success: false, message: 'Cabinet introuvable' });
    }
    org.status = 'suspended';
    await org.save();
    clearOrganizationCache();
    evictTenantConnection(String(org._id));
    const actor = auditActor(req);
    await logPlatformAudit({
      action: 'suspend',
      orgSlug: slug,
      orgId: String(org._id),
      actorEmail: actor.email,
      actorId: actor.id,
    });
    res.json({
      success: true,
      message: 'Cabinet suspendu (status: suspended)',
      organization: toOrganizationDto(org),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Erreur serveur' });
  }
});

module.exports = router;
