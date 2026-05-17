const express = require('express');
const { isMultiTenantEnabled } = require('../lib/db/master');
const { getOrganizationModel } = require('../models/Organization');
const { clearOrganizationCache } = require('../lib/tenant/resolveOrganization');
const { evictTenantConnection } = require('../lib/db/tenants');
const { protect } = require('../middleware/auth');
const { requirePlatformAdmin } = require('../middleware/platformAdmin');
const { toOrganizationDto, validateSlug, normalizeDomains } = require('../lib/platform/organizationDto');
const { buildDnsChecklist } = require('../lib/platform/dnsChecklist');
const { provisionTenantAdmin } = require('../lib/platform/provisionTenantAdmin');

const router = express.Router();

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
    const Organization = getOrganizationModel();
    const orgs = await Organization.find({}).sort({ slug: 1 }).lean();
    res.json({
      success: true,
      organizations: orgs.map((o) => toOrganizationDto(o)),
    });
  } catch (err) {
    console.error('platform GET /:', err);
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
    res.json({ success: true, checklist: buildDnsChecklist(org) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Erreur serveur' });
  }
});

router.post('/:slug/provision-admin', async (req, res) => {
  try {
    const Organization = getOrganizationModel();
    const org = await Organization.findOne({ slug: req.params.slug.toLowerCase() });
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

router.get('/:slug', async (req, res) => {
  try {
    const Organization = getOrganizationModel();
    const org = await Organization.findOne({ slug: req.params.slug.toLowerCase() }).lean();
    if (!org) {
      return res.status(404).json({ success: false, message: 'Cabinet introuvable' });
    }
    res.json({ success: true, organization: toOrganizationDto(org) });
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
        replyTo: body.email?.replyTo || '',
      },
      landingPage: body.landingPage || {},
      limits: body.limits || {},
    });

    clearOrganizationCache();
    res.status(201).json({
      success: true,
      organization: toOrganizationDto(org),
      checklist: buildDnsChecklist(org),
    });
  } catch (err) {
    console.error('platform POST /:', err);
    res.status(400).json({ success: false, message: err.message || 'Création impossible' });
  }
});

router.patch('/:slug', async (req, res) => {
  try {
    const Organization = getOrganizationModel();
    const org = await Organization.findOne({ slug: req.params.slug.toLowerCase() });
    if (!org) {
      return res.status(404).json({ success: false, message: 'Cabinet introuvable' });
    }

    const body = req.body || {};
    const prevUri = org.mongoUri;

    if (body.status) org.status = body.status;
    if (body.mongoUri?.trim()) org.mongoUri = body.mongoUri.trim();
    if (body.branding) {
      org.branding = { ...org.branding.toObject?.() || org.branding, ...body.branding };
    }
    if (body.email) {
      org.email = { ...org.email.toObject?.() || org.email, ...body.email };
    }
    if (body.landingPage) {
      org.landingPage = { ...org.landingPage.toObject?.() || org.landingPage, ...body.landingPage };
    }
    if (body.limits) {
      org.limits = { ...org.limits.toObject?.() || org.limits, ...body.limits };
    }
    if (body.domains !== undefined || body.domain !== undefined) {
      const domains = normalizeDomains({
        domains: body.domains ?? org.domains,
        domain: body.domain ?? org.domain,
      });
      org.domains = domains;
      org.domain = domains[0] || '';
    }

    await org.save();
    if (body.mongoUri?.trim() && body.mongoUri.trim() !== prevUri) {
      evictTenantConnection(String(org._id));
    }
    clearOrganizationCache();

    const lean = org.toObject();
    res.json({
      success: true,
      organization: toOrganizationDto(lean),
    });
  } catch (err) {
    console.error('platform PATCH:', err);
    res.status(400).json({ success: false, message: err.message || 'Mise à jour impossible' });
  }
});

router.delete('/:slug', async (req, res) => {
  try {
    const Organization = getOrganizationModel();
    const org = await Organization.findOne({ slug: req.params.slug.toLowerCase() });
    if (!org) {
      return res.status(404).json({ success: false, message: 'Cabinet introuvable' });
    }
    org.status = 'suspended';
    await org.save();
    clearOrganizationCache();
    evictTenantConnection(String(org._id));
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
