const express = require('express');
const { body, validationResult } = require('express-validator');
const { sendTransactionalEmail, escapeHtml } = require('../utils/emailNotifications');

const router = express.Router();

const SUBJECTS = ['demo', 'pricing', 'partnership', 'other'];

const SUBJECT_LABELS = {
  demo: 'Démonstration de la plateforme',
  pricing: 'Tarifs & offre commerciale',
  partnership: 'Partenariat',
  other: 'Autre demande',
};

const rateByIp = new Map();
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 10;

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
  const raw =
    process.env.PLATFORM_COMMERCIAL_EMAILS ||
    process.env.PLATFORM_ADMIN_EMAILS ||
    process.env.PLATFORM_SIGNUP_NOTIFY_EMAILS ||
    '';
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
    body('name').trim().notEmpty().isLength({ max: 120 }),
    body('email').isEmail().normalizeEmail(),
    body('phone').optional({ values: 'falsy' }).trim().isLength({ max: 40 }),
    body('organization').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
    body('subject').isIn(SUBJECTS).withMessage('Sujet invalide'),
    body('message').trim().notEmpty().isLength({ max: 4000 }),
    body('gdprConsent').equals('true').withMessage('Consentement requis'),
    body('website').optional({ values: 'falsy' }).trim(),
  ],
  async (req, res) => {
    try {
      if (req.body.website) {
        return res.json({ success: true, message: 'Message envoyé.' });
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

      const name = req.body.name.trim();
      const email = req.body.email;
      const phone = String(req.body.phone || '').trim();
      const organization = String(req.body.organization || '').trim();
      const subject = req.body.subject;
      const message = req.body.message.trim();
      const subjectLabel = SUBJECT_LABELS[subject] || subject;

      try {
        await sendTransactionalEmail({
          to: email,
          toName: name,
          subject: 'Ada Papers | Votre message au service commercial',
          htmlContent: `<p>Bonjour ${escapeHtml(name)},</p><p>Nous avons bien reçu votre demande concernant <strong>${escapeHtml(subjectLabel)}</strong>. Un membre de notre équipe commerciale vous recontactera sous peu.</p>`,
          textContent: `Bonjour ${name}, nous avons bien reçu votre demande (${subjectLabel}). Notre équipe vous recontactera sous peu.`,
        });
      } catch (mailErr) {
        console.warn('⚠️ Accusé réception contact commercial:', mailErr.message);
      }

      const notifyList = platformNotifyEmails();
      if (notifyList.length) {
        const html = `<p>Nouveau message, service commercial Ada Papers.</p>
<ul>
<li><strong>Nom :</strong> ${escapeHtml(name)}</li>
<li><strong>Email :</strong> ${escapeHtml(email)}</li>
<li><strong>Téléphone :</strong> ${escapeHtml(phone || 'Non renseigné')}</li>
<li><strong>Organisation :</strong> ${escapeHtml(organization || 'Non renseigné')}</li>
<li><strong>Sujet :</strong> ${escapeHtml(subjectLabel)}</li>
</ul>
<p><strong>Message :</strong></p>
<p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`;
        for (const to of notifyList) {
          try {
            await sendTransactionalEmail({
              to,
              subject: `[Ada Papers] Contact commercial : ${name}`,
              htmlContent: html,
              textContent: `Contact commercial de ${name} (${email}), ${subjectLabel}\n\n${message}`,
            });
          } catch (e) {
            console.warn('⚠️ Notification contact commercial:', e.message);
          }
        }
      }

      res.status(201).json({
        success: true,
        message: 'Message envoyé',
      });
    } catch (err) {
      console.error('POST public commercial-contact:', err);
      res.status(500).json({ success: false, message: err.message || 'Erreur serveur' });
    }
  }
);

module.exports = router;
