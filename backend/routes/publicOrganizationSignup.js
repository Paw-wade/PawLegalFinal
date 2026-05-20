const express = require('express');
const { body, validationResult } = require('express-validator');
const { isMultiTenantEnabled } = require('../lib/db/master');
const { getCabinetSignupRequestModel, ORGANIZATION_TYPES } = require('../models/CabinetSignupRequest');
const { validateSlug } = require('../lib/platform/organizationDto');
const { sendTransactionalEmail, escapeHtml } = require('../utils/emailNotifications');

const router = express.Router();

const rateByIp = new Map();
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 8;

function checkRateLimit(ip) {
  const key = ip || 'unknown';
  const now = Date.now();
  let entry = rateByIp.get(key);
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    entry = { start: now, count: 0 };
    rateByIp.set(key, entry);
  }
  entry.count += 1;
  return entry.count <= RATE_MAX;
}

function platformNotifyEmails() {
  const raw = process.env.PLATFORM_ADMIN_EMAILS || process.env.PLATFORM_SIGNUP_NOTIFY_EMAILS || '';
  const list = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (list.length) return list;
  const fallback = (process.env.EMAIL_FROM || 'contact@adapapers.fr').trim();
  return fallback ? [fallback] : [];
}

router.post(
  '/',
  [
    body('organizationType')
      .isIn(ORGANIZATION_TYPES)
      .withMessage('Type de structure invalide'),
    body('organizationTypeOther')
      .optional({ values: 'falsy' })
      .trim()
      .isLength({ max: 120 }),
    body('structureName').trim().notEmpty().isLength({ max: 200 }),
    body('contactName').trim().notEmpty().isLength({ max: 120 }),
    body('contactEmail').isEmail().normalizeEmail(),
    body('phone').optional({ values: 'falsy' }).trim().isLength({ max: 40 }),
    body('city').optional({ values: 'falsy' }).trim().isLength({ max: 120 }),
    body('barreau').optional({ values: 'falsy' }).trim().isLength({ max: 120 }),
    body('siret').optional({ values: 'falsy' }).trim().isLength({ max: 20 }),
    body('teamSize').optional({ values: 'falsy' }).trim().isLength({ max: 40 }),
    body('practiceArea').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
    body('desiredSlug').optional({ values: 'falsy' }).trim().isLength({ max: 64 }),
    body('desiredDomains').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
    body('message').optional({ values: 'falsy' }).trim().isLength({ max: 4000 }),
    body('gdprConsent').equals('true').withMessage('Consentement requis'),
    body('website').optional({ values: 'falsy' }).trim(),
  ],
  async (req, res) => {
    try {
      if (!isMultiTenantEnabled()) {
        return res.status(503).json({
          success: false,
          message: 'Les demandes d’espace organisation ne sont pas disponibles pour le moment.',
        });
      }

      if (req.body.website) {
        return res.json({ success: true, message: 'Demande enregistrée.' });
      }

      const ip =
        String(req.headers['x-forwarded-for'] || '')
          .split(',')[0]
          .trim() || req.ip;
      if (!checkRateLimit(ip)) {
        return res.status(429).json({
          success: false,
          message: 'Trop de demandes. Réessayez dans quelques minutes.',
        });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Vérifiez les champs du formulaire',
          errors: errors.array(),
        });
      }

      const organizationType = req.body.organizationType;
      if (organizationType === 'other' && !String(req.body.organizationTypeOther || '').trim()) {
        return res.status(400).json({
          success: false,
          message: 'Précisez le type de structure.',
        });
      }

      const desiredSlug = String(req.body.desiredSlug || '')
        .trim()
        .toLowerCase();
      if (desiredSlug) {
        const slugErr = validateSlug(desiredSlug);
        if (slugErr) {
          return res.status(400).json({ success: false, message: slugErr });
        }
      }

      const CabinetSignupRequest = getCabinetSignupRequestModel();
      const recent = await CabinetSignupRequest.findOne({
        contactEmail: req.body.contactEmail,
        status: { $in: ['pending', 'in_review'] },
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }).lean();
      if (recent) {
        return res.status(409).json({
          success: false,
          message:
            'Une demande est déjà en cours pour cet email. Notre équipe vous recontactera sous peu.',
        });
      }

      const doc = await CabinetSignupRequest.create({
        organizationType,
        organizationTypeOther: String(req.body.organizationTypeOther || '').trim(),
        structureName: req.body.structureName.trim(),
        contactName: req.body.contactName.trim(),
        contactEmail: req.body.contactEmail,
        phone: String(req.body.phone || '').trim(),
        city: String(req.body.city || '').trim(),
        barreau: String(req.body.barreau || '').trim(),
        siret: String(req.body.siret || '').trim(),
        teamSize: String(req.body.teamSize || '').trim(),
        practiceArea: String(req.body.practiceArea || '').trim(),
        desiredSlug,
        desiredDomains: String(req.body.desiredDomains || '').trim(),
        message: String(req.body.message || '').trim(),
        gdprConsent: true,
        meta: {
          ip: ip || '',
          userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
        },
      });

      const { contactName, structureName } = doc;

      try {
        await sendTransactionalEmail({
          to: doc.contactEmail,
          toName: contactName,
          subject: 'Demande d’espace Ada Papers | Accusé de réception',
          htmlContent: `<p>Nous avons bien reçu votre demande pour <strong>${escapeHtml(structureName)}</strong>.</p><p>Notre équipe l’examine et vous recontactera à cette adresse email.</p>`,
          textContent: `Nous avons bien reçu votre demande pour ${structureName}. Notre équipe l'examine et vous recontactera.`,
        });
      } catch (mailErr) {
        console.warn('⚠️ Accusé réception demande organisation:', mailErr.message);
      }

      const notifyList = platformNotifyEmails();
      if (notifyList.length) {
        const consoleUrl =
          process.env.PLATFORM_CONSOLE_URL ||
          `${(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3004').replace(/\/+$/, '')}/platform/demandes-organisations`;
        const html = `<p>Nouvelle demande d’espace organisation.</p>
<ul>
<li><strong>Structure :</strong> ${escapeHtml(structureName)}</li>
<li><strong>Type :</strong> ${escapeHtml(doc.organizationType)}</li>
<li><strong>Contact :</strong> ${escapeHtml(contactName)}, ${escapeHtml(doc.contactEmail)}</li>
<li><strong>Slug souhaité :</strong> ${escapeHtml(desiredSlug || 'Non renseigné')}</li>
</ul>
<p><a href="${escapeHtml(consoleUrl)}">Voir dans la console</a></p>`;
        for (const to of notifyList) {
          try {
            await sendTransactionalEmail({
              to,
              subject: `[Ada Papers] Nouvelle demande : ${structureName}`,
              htmlContent: html,
              textContent: `Nouvelle demande: ${structureName} (${doc.contactEmail})`,
            });
          } catch (e) {
            console.warn('⚠️ Notification plateforme demande organisation:', e.message);
          }
        }
      }

      res.status(201).json({
        success: true,
        message: 'Demande enregistrée',
        requestId: String(doc._id),
      });
    } catch (err) {
      console.error('POST public organization-signup:', err);
      res.status(500).json({ success: false, message: err.message || 'Erreur serveur' });
    }
  }
);

module.exports = router;
