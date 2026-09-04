const crypto = require('crypto');
const { extractAssociesWithEmail } = require('./etatCivilRequests');
const { getFrontendOriginsList, getPrimaryFrontendUrl } = require('../utils/frontendOrigins');
const { sendTransactionalEmail, escapeHtml } = require('../utils/emailNotifications');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Base URL sûre pour les liens e-mail : l'origine du client si elle est autorisée, sinon l'URL publique. */
function resolveEmailBaseUrl(origin) {
  const clean = String(origin || '').trim().replace(/\/+$/, '');
  if (clean) {
    try {
      const allowed = getFrontendOriginsList().map((o) => String(o).trim().replace(/\/+$/, '').toLowerCase());
      if (allowed.includes(clean.toLowerCase())) return clean;
    } catch { /* ignore */ }
  }
  return getPrimaryFrontendUrl();
}

function buildEmail({ nom, cabinetNom, url }) {
  const prenomNom = escapeHtml(nom);
  const cab = escapeHtml(cabinetNom || 'le cabinet');
  const subject = 'Documents à compléter pour la constitution de la société';
  const htmlContent = `
    <p>Bonjour ${prenomNom},</p>
    <p>Dans le cadre de la constitution de la société, ${cab} vous invite à compléter les documents qui vous concernent :
    votre fiche d'identité à remplir en ligne et le dépôt de votre pièce d'identité (et, le cas échéant, une procuration).</p>
    <p><a href="${url}" style="display:inline-block;background:#0d9488;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">Compléter mes documents</a></p>
    <p>Ou copiez ce lien dans votre navigateur :<br><a href="${url}">${url}</a></p>
    <p style="color:#64748b;font-size:13px">Ce lien vous est personnel et ne donne accès qu'aux documents qui vous concernent.</p>`;
  const textContent =
    `Bonjour ${nom},\n\n` +
    `Dans le cadre de la constitution de la société, ${cabinetNom || 'le cabinet'} vous invite à compléter les documents qui vous concernent ` +
    `(fiche d'identité à remplir + dépôt de votre pièce d'identité, et le cas échéant une procuration).\n\n` +
    `Compléter mes documents : ${url}\n\n` +
    `Ce lien vous est personnel et ne donne accès qu'aux documents qui vous concernent.`;
  return { subject, htmlContent, textContent };
}

/**
 * Après remplissage de la fiche société : pour chaque associé dont l'e-mail est renseigné,
 * crée/retrouve une invitation ciblée (ses fiches + pièces) et lui envoie le lien par e-mail
 * (une seule fois - dédoublonné par `invitationEmailSentAt`).
 * Best-effort : les échecs d'envoi n'interrompent pas la soumission.
 * @returns {Promise<{ sent: number }>}
 */
async function sendAssocieInvitations(dossierId, schema, data, { origin, requestedBy, createdViaGuest, cabinetNom } = {}) {
  if (!schema || !schema.associesSource) return { sent: 0 };
  const FicheRequest = require('../models/FicheRequest');
  const PieceRequest = require('../models/PieceRequest');
  const FicheInvite = require('../models/FicheInvite');

  const associes = extractAssociesWithEmail(schema, data).filter((a) => EMAIL_RE.test(a.email));
  if (associes.length === 0) return { sent: 0 };

  const base = resolveEmailBaseUrl(origin);
  let sent = 0;

  for (const { nom, email } of associes) {
    const frs = await FicheRequest.find({ dossier: dossierId, pourPersonne: nom, statut: { $ne: 'annulee' } }).select('_id').lean();
    const prs = await PieceRequest.find({ dossier: dossierId, pourPersonne: nom, statut: { $ne: 'annulee' } }).select('_id').lean();
    if (frs.length === 0 && prs.length === 0) continue;
    const ficheIds = frs.map((f) => f._id);
    const pieceIds = prs.map((p) => p._id);

    let invite = await FicheInvite.findOne({ dossier: dossierId, personne: nom });
    if (!invite) {
      invite = await FicheInvite.create({
        token: crypto.randomBytes(24).toString('hex'), dossier: dossierId, personne: nom, personneEmail: email,
        ficheRequests: ficheIds, pieceRequests: pieceIds, allowUpload: true,
        createdBy: requestedBy || null, createdViaGuest: !!createdViaGuest,
      });
    } else {
      // Rafraîchit le périmètre + l'e-mail, sans re-générer le token.
      invite.ficheRequests = ficheIds;
      invite.pieceRequests = pieceIds;
      invite.personneEmail = email;
      await invite.save();
    }

    if (invite.invitationEmailSentAt) continue; // déjà invité par e-mail

    const url = `${base}/invitation/${invite.token}`;
    const { subject, htmlContent, textContent } = buildEmail({ nom, cabinetNom, url });
    try {
      const ok = await sendTransactionalEmail({ to: email, toName: nom, subject, htmlContent, textContent });
      if (ok) {
        invite.invitationEmailSentAt = new Date();
        await invite.save();
        sent += 1;
      }
    } catch (e) {
      console.warn('[associeInvitations] envoi e-mail échoué pour', email, ':', e?.message || e);
    }
  }
  return { sent };
}

/**
 * Renvoie l'e-mail d'invitation d'une invitation existante (bouton « Renvoyer » côté admin).
 * @returns {Promise<{ ok: boolean, sentAt?: Date, email?: string, error?: string }>}
 */
async function resendAssocieInvitation(dossierId, inviteId, { origin, cabinetNom } = {}) {
  const FicheInvite = require('../models/FicheInvite');
  const invite = await FicheInvite.findOne({ _id: inviteId, dossier: dossierId });
  if (!invite) return { ok: false, error: 'not_found' };
  const email = String(invite.personneEmail || '').trim();
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'no_email' };
  const url = `${resolveEmailBaseUrl(origin)}/invitation/${invite.token}`;
  const { subject, htmlContent, textContent } = buildEmail({ nom: invite.personne || '', cabinetNom, url });
  const ok = await sendTransactionalEmail({ to: email, toName: invite.personne || '', subject, htmlContent, textContent });
  if (!ok) return { ok: false, error: 'send_failed' };
  invite.invitationEmailSentAt = new Date();
  await invite.save();
  return { ok: true, sentAt: invite.invitationEmailSentAt, email };
}

module.exports = { sendAssocieInvitations, resendAssocieInvitation };
