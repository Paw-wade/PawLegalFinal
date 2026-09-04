/**
 * E-mail de test : même contenu que la proposition de RDV (admin → client).
 * Usage : node scripts/sendRdvProposalTestEmail.js [destinataire@example.com]
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { sendTransactionalEmailDetailed, escapeHtml } = require('../utils/emailNotifications');
const { getPrimaryFrontendUrl } = require('../utils/frontendOrigins');

async function main() {
  const to = (process.argv[2] || 'contact@adapapers.fr').trim();
  const name = 'Contact test';
  const dateLabelSms = new Date().toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const heure = '14:00';
  const rdvUrl = `${getPrimaryFrontendUrl()}/client/rendez-vous`;

  const subject = '[Ada Papers] Test - proposition de rendez-vous';
  const htmlContent = `<p>Bonjour ${escapeHtml(name)},</p><p>Vous avez reçu une proposition de rendez-vous.</p><p><strong>Date :</strong> ${escapeHtml(dateLabelSms)}<br/><strong>Heure :</strong> ${escapeHtml(heure)}</p><p>Merci de <strong>accepter ou refuser</strong> depuis votre espace <a href="${escapeHtml(rdvUrl)}">Mes rendez-vous</a>. L’équipe Ada Papers sera notifiée de votre choix.</p>`;
  const textContent = `Bonjour ${name},

Ada Papers vous propose un rendez-vous.
Date : ${dateLabelSms}
Heure : ${heure}

Acceptez ou refusez depuis votre espace Mes rendez-vous : ${rdvUrl}

L’équipe Ada Papers sera notifiée de votre choix.`;

  const r = await sendTransactionalEmailDetailed({
    to,
    toName: name,
    subject,
    htmlContent,
    textContent,
  });

  if (r.ok) {
    console.log(`✅ RDV test envoyé (${r.provider}) à ${to}`);
    console.log(`   Lien Mes rendez-vous : ${rdvUrl}`);
  } else {
    console.error('❌ Échec:', r.error || 'inconnu');
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
