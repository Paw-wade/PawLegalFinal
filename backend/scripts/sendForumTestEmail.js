/**
 * Envoie un e-mail de test avec un lien vers le forum.
 * Usage : node scripts/sendForumTestEmail.js [destinataire@example.com]
 * Variables : BREVO_API_KEY ou SMTP (voir emailNotifications).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { sendTransactionalEmailDetailed } = require('../utils/emailNotifications');
const { getPrimaryFrontendUrl } = require('../utils/frontendOrigins');

async function main() {
  const to = (process.argv[2] || 'contact@adapapers.fr').trim();
  const base = getPrimaryFrontendUrl();
  const forumUrl = `${base}/forum`;

  const subject = '[Ada Papers] Test — lien vers le forum';
  const htmlContent = `
<p>Ceci est un <strong>e-mail de test</strong> automatique (script <code>sendForumTestEmail.js</code>).</p>
<p style="margin:24px 0;">
  <a href="${forumUrl}" style="display:inline-block;padding:12px 20px;background:#ea580c;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Accéder au forum</a>
</p>
<p style="font-size:13px;color:#555;">Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :<br/>
<span style="word-break:break-all;">${forumUrl}</span></p>
`;

  const textContent = `E-mail de test Ada Papers.\n\nForum : ${forumUrl}\n`;

  const r = await sendTransactionalEmailDetailed({
    to,
    subject,
    htmlContent,
    textContent,
  });

  if (r.ok) {
    console.log(`✅ Envoyé (${r.provider}) à ${to}`);
    console.log(`   Lien forum : ${forumUrl}`);
  } else {
    console.error('❌ Échec:', r.error || 'inconnu');
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
