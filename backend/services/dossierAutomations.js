'use strict';
const AutomationRule = require('../models/AutomationRule');
const Notification = require('../models/Notification');
const { sendTransactionalEmail } = require('../utils/emailNotifications');
const { sendNotificationSMS } = require('../sendSMS');

function interpolate(template, vars) {
  if (!template) return '';
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '');
}

async function triggerAutomations(dossier, oldStatut, newStatut) {
  if (!newStatut || newStatut === oldStatut) return;

  let rules;
  try {
    rules = await AutomationRule.find({ statutDeclencheur: newStatut, actif: true }).lean();
  } catch (err) {
    console.error('[automations] Erreur chargement regles:', err.message);
    return;
  }
  if (!rules || rules.length === 0) return;

  const clientId = dossier.user?._id || dossier.user || dossier.client;
  let client = null;
  try {
    const User = require('../models/User');
    client = await User.findById(clientId).select('email phone firstName lastName').lean();
  } catch (_) {}

  let assigneUser = null;
  if (dossier.assignedTo) {
    try {
      const User = require('../models/User');
      assigneUser = await User.findById(dossier.assignedTo).select('email phone firstName lastName').lean();
    } catch (_) {}
  }

  const dossierNumero = dossier.numero || dossier.reference || String(dossier._id).slice(-6).toUpperCase();
  const dossierTitre = dossier.titre || dossier.type || dossier.typeDemande || 'Dossier';

  for (const rule of rules) {
    for (const action of rule.actions) {
      const cible = action.destinataire === 'client' ? client : assigneUser;
      if (!cible) continue;

      const templateVars = {
        prenom: cible.firstName || cible.lastName || '',
        dossier_titre: dossierTitre,
        statut_label: newStatut,
        dossier_numero: dossierNumero,
      };

      const titre = interpolate(action.titre, templateVars);
      const message = interpolate(action.message, templateVars);

      try {
        if (action.type === 'notification_inapp') {
          await Notification.create({
            user: cible._id || cible.id,
            type: 'dossier',
            titre: titre || 'Mise a jour de votre dossier',
            message,
            lien: `/admin/dossiers/${dossier._id}`,
          });
        } else if (action.type === 'email' && cible.email) {
          await sendTransactionalEmail({
            to: cible.email,
            subject: titre || 'Mise a jour de votre dossier',
            html: `<p>${message.replace(/\n/g, '<br/>')}</p>`,
            text: message,
          });
        } else if (action.type === 'sms' && cible.phone) {
          await sendNotificationSMS(cible.phone, message);
        }
      } catch (err) {
        console.error(`[automations] Erreur action ${action.type} (regle ${rule._id}):`, err.message);
      }
    }
  }
}

module.exports = { triggerAutomations };
