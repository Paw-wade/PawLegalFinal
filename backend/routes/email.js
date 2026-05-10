const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const { sendTransactionalEmailDetailed } = require('../utils/emailNotifications');
const { protect, authorize } = require('../middleware/auth');
const EmailTemplate = require('../models/EmailTemplate');
const EmailEventSetting = require('../models/EmailEventSetting');
const EmailLog = require('../models/EmailLog');

const router = express.Router();

/** Routes email console : templates / événements / logs nécessitent MongoDB. */
function requireMongo(req, res, next) {
  if (mongoose.connection.readyState === 1) return next();
  return res.status(503).json({
    success: false,
    code: 'DATABASE_UNAVAILABLE',
    message:
      'Base de données indisponible. La console email nécessite MongoDB : vérifiez MONGODB_URI et la whitelist IP sur MongoDB Atlas, puis redémarrez le backend.',
  });
}

const DEFAULT_TEMPLATES = [
  {
    code: 'account_welcome',
    name: 'Bienvenue utilisateur',
    description: 'Envoyé après validation du compte (lien d’activation / OTP)',
    subject: 'Bienvenue sur Ada Papers, {{firstName}} !',
    htmlContent:
      '<p>Bienvenue sur Ada Papers, {{firstName}} !</p><p>Nous sommes ravis de vous accueillir. Votre espace personnel est maintenant actif.</p><p><strong>CE QUE VOUS POUVEZ FAIRE DÈS MAINTENANT</strong></p><p>📁 <strong>Création et suivi de dossier</strong><br/>Créez un dossier d’accompagnement et suivez l’avancement de votre dossier en temps réel, de la création jusqu’à la finalisation.</p><p>⏱️ <strong>Calculateur de délais</strong><br/>Anticipez vos échéances et planifiez vos démarches sereinement.</p><p>🤖 <strong>Paw AI</strong><br/>Obtenez des réponses claires et vérifiées, corroborées par des décisions de justice et adaptées à votre situation. Recevez également des recommandations sur les démarches à suivre.</p><p>💬 <strong>Accompagnement humain</strong><br/>Notre équipe reste disponible à chaque étape depuis votre espace.</p><p><strong>Accédez à votre espace :</strong> https://adapapers.fr</p><p>Cordialement,<br/>L’équipe Ada Papers</p><p style="font-size:12px;color:#666;">© 2025 Ada Papers — adapapers.fr<br/>Si vous n’êtes pas à l’origine de cette inscription, ignorez ce message.</p>',
    textContent:
      'Bienvenue sur Ada Papers, {{firstName}} !\n\nNous sommes ravis de vous accueillir. Votre espace personnel est maintenant actif.\n\nCE QUE VOUS POUVEZ FAIRE DÈS MAINTENANT\n\n📁 Création et suivi de dossier\nCréez un dossier d’accompagnement et suivez l’avancement de votre dossier en temps réel, de la création jusqu’à la finalisation.\n\n⏱️ Calculateur de délais\nAnticipez vos échéances et planifiez vos démarches sereinement.\n\n🤖 Paw AI\nObtenez des réponses claires et vérifiées, corroborées par des décisions de justice et adaptées à votre situation. Recevez également des recommandations sur les démarches à suivre.\n\n💬 Accompagnement humain\nNotre équipe reste disponible à chaque étape depuis votre espace.\n\nAccédez à votre espace : https://adapapers.fr\n\nCordialement,\nL’équipe Ada Papers\n\n© 2025 Ada Papers — adapapers.fr\nSi vous n’êtes pas à l’origine de cette inscription, ignorez ce message.',
    category: 'account',
    isSystem: true,
    variables: [{ name: 'firstName', description: 'Prénom', example: 'Ablaye' }],
  },
  {
    code: 'password_reset_code',
    name: 'Code de réinitialisation',
    description: 'Code temporaire envoyé pour récupérer le compte',
    subject: 'Code de réinitialisation',
    htmlContent:
      '<p>Bonjour,</p><p>Vous avez demandé la réinitialisation de votre mot de passe.</p><p>Votre code de vérification est : <strong>{{code}}</strong>.</p><p>Ce code est valable pendant 10 minutes. Pour des raisons de sécurité, ne le partagez avec personne.</p><p>Si vous n’êtes pas à l’origine de cette demande, vous pouvez ignorer cet e-mail.</p><p>Cordialement,<br/>L’équipe Ada Papers</p>',
    textContent:
      'Bonjour,\n\nVous avez demandé la réinitialisation de votre mot de passe.\n\nVotre code de vérification est : {{code}}.\nCe code est valable pendant 10 minutes. Pour des raisons de sécurité, ne le partagez avec personne.\n\nSi vous n’êtes pas à l’origine de cette demande, vous pouvez ignorer cet e-mail.\n\nCordialement,\nL’équipe Ada Papers',
    category: 'account',
    isSystem: true,
    variables: [{ name: 'code', description: 'Code OTP', example: '123456' }],
  },
  {
    code: 'signup_activation_link',
    name: 'Activation de compte',
    description: 'Lien signe pour activer le compte et definir le mot de passe',
    subject: 'Activez votre compte Ada Papers',
    htmlContent:
      '<p>Bonjour {{firstName}},</p><p>Bienvenue sur Ada Papers. Pour choisir votre mot de passe et activer votre compte, cliquez sur le lien ci-dessous :</p><p><a href="{{activationUrl}}">Activer mon compte</a></p><p>Si le bouton ne fonctionne pas, copiez-collez ce lien : {{activationUrl}}</p><p>Cordialement,<br/>L equipe Ada Papers</p>',
    textContent:
      'Bonjour {{firstName}},\n\nPour activer votre compte et choisir votre mot de passe, ouvrez ce lien :\n{{activationUrl}}\n\nCordialement,\nL equipe Ada Papers',
    category: 'account',
    isSystem: true,
    variables: [
      { name: 'firstName', description: 'Prenom', example: 'Ablaye' },
      { name: 'activationUrl', description: 'Lien d activation', example: 'https://adapapers.fr/auth/activate?token=...' },
    ],
  },
  {
    code: 'password_reset_link',
    name: 'Lien de reinitialisation mot de passe',
    description: 'Lien de reinitialisation envoye par email',
    subject: 'Reinitialisation de votre mot de passe',
    htmlContent:
      '<p>Bonjour {{firstName}},</p><p>Vous avez demande une reinitialisation de mot de passe.</p><p><a href="{{resetUrl}}">Reinitialiser mon mot de passe</a></p><p>Ce lien est valable 1 heure.</p><p>Cordialement,<br/>L equipe Ada Papers</p>',
    textContent:
      'Bonjour {{firstName}},\n\nVous avez demande une reinitialisation de mot de passe.\nLien : {{resetUrl}}\nCe lien est valable 1 heure.\n\nCordialement,\nL equipe Ada Papers',
    category: 'account',
    isSystem: true,
    variables: [
      { name: 'firstName', description: 'Prenom', example: 'Ablaye' },
      { name: 'resetUrl', description: 'Lien de reinitialisation', example: 'https://adapapers.fr/auth/reset-password?token=...' },
    ],
  },
  {
    code: 'dossier_created',
    name: 'Dossier créé',
    description: 'Confirmation de création de dossier',
    subject: 'Votre dossier {{dossierNumero}} a été créé',
    htmlContent:
      '<p>Bonjour,</p><p>Nous vous confirmons la création de votre dossier <strong>{{dossierNumero}}</strong>.</p><p>Notre équipe procédera à l’analyse de votre situation et vous informera des prochaines étapes dès que nécessaire.</p><p>Nous vous invitons à consulter régulièrement votre espace personnel pour suivre l’avancement.</p><p>Cordialement,<br/>L’équipe Ada Papers</p>',
    textContent:
      'Bonjour,\n\nNous vous confirmons la création de votre dossier {{dossierNumero}}.\n\nNotre équipe procédera à l’analyse de votre situation et vous informera des prochaines étapes dès que nécessaire.\nNous vous invitons à consulter régulièrement votre espace personnel pour suivre l’avancement.\n\nCordialement,\nL’équipe Ada Papers',
    category: 'dossier',
    isSystem: true,
    variables: [{ name: 'dossierNumero', description: 'Référence dossier', example: 'DOS-001' }],
  },
  {
    code: 'dossier_updated',
    name: 'Dossier mis a jour',
    description: 'Notification de mise a jour dossier',
    subject: 'Votre dossier a ete mis a jour - Ada Papers',
    htmlContent:
      '<p>Bonjour {{firstName}},</p><p>Votre dossier {{dossierNumero}} a ete mis a jour.</p><p>Connectez-vous a votre espace pour consulter les changements.</p><p>Cordialement,<br/>L equipe Ada Papers</p>',
    textContent:
      'Bonjour {{firstName}},\n\nVotre dossier {{dossierNumero}} a ete mis a jour.\nConnectez-vous a votre espace pour consulter les changements.\n\nCordialement,\nL equipe Ada Papers',
    category: 'dossier',
    isSystem: true,
    variables: [
      { name: 'firstName', description: 'Prenom', example: 'Ablaye' },
      { name: 'dossierNumero', description: 'Reference dossier', example: 'DOS-001' },
    ],
  },
  {
    code: 'dossier_status_changed',
    name: 'Changement de statut dossier',
    description: 'Notification de changement de statut',
    subject: 'Mise à jour de votre dossier {{dossierNumero}}',
    htmlContent:
      '<p>Bonjour,</p><p>Le statut de votre dossier <strong>{{dossierNumero}}</strong> a été mis à jour.</p><p>Nouveau statut : <strong>{{status}}</strong>.</p><p>Pour davantage de détails, nous vous invitons à consulter votre espace client.</p><p>Cordialement,<br/>L’équipe Ada Papers</p>',
    textContent:
      'Bonjour,\n\nLe statut de votre dossier {{dossierNumero}} a été mis à jour.\nNouveau statut : {{status}}.\n\nPour davantage de détails, nous vous invitons à consulter votre espace client.\n\nCordialement,\nL’équipe Ada Papers',
    category: 'dossier',
    isSystem: true,
    variables: [
      { name: 'dossierNumero', description: 'Référence dossier', example: 'DOS-001' },
      { name: 'status', description: 'Nouveau statut', example: 'En cours' },
    ],
  },
  {
    code: 'appointment_request_received',
    name: 'Demande de rendez-vous recue',
    description: 'Confirmation client de la demande de rendez-vous',
    subject: 'Demande de rendez-vous bien recue - Ada Papers',
    htmlContent:
      '<p>Bonjour {{firstName}},</p><p>Votre demande de rendez-vous a bien ete enregistree pour le {{date}} a {{heure}}.</p><p>Nous revenons vers vous rapidement.</p><p>Cordialement,<br/>L equipe Ada Papers</p>',
    textContent:
      'Bonjour {{firstName}},\n\nVotre demande de rendez-vous a bien ete enregistree pour le {{date}} a {{heure}}.\nNous revenons vers vous rapidement.\n\nCordialement,\nL equipe Ada Papers',
    category: 'system',
    isSystem: true,
    variables: [
      { name: 'firstName', description: 'Prenom', example: 'Ablaye' },
      { name: 'date', description: 'Date du rendez-vous', example: '12/05/2026' },
      { name: 'heure', description: 'Heure du rendez-vous', example: '10:30' },
    ],
  },
  {
    code: 'appointment_created',
    name: 'Rendez-vous cree',
    description: 'Confirmation de rendez-vous planifie',
    subject: 'Rendez-vous enregistre - Ada Papers',
    htmlContent:
      '<p>Bonjour {{firstName}},</p><p>Votre rendez-vous est confirme pour le {{date}} a {{heure}}.</p><p>Cordialement,<br/>L equipe Ada Papers</p>',
    textContent:
      'Bonjour {{firstName}},\n\nVotre rendez-vous est confirme pour le {{date}} a {{heure}}.\n\nCordialement,\nL equipe Ada Papers',
    category: 'system',
    isSystem: true,
    variables: [
      { name: 'firstName', description: 'Prenom', example: 'Ablaye' },
      { name: 'date', description: 'Date du rendez-vous', example: '12/05/2026' },
      { name: 'heure', description: 'Heure du rendez-vous', example: '10:30' },
    ],
  },
  {
    code: 'appointment_updated',
    name: 'Rendez-vous modifie',
    description: 'Notification de modification de rendez-vous',
    subject: 'Rendez-vous modifie - Ada Papers',
    htmlContent:
      '<p>Bonjour {{firstName}},</p><p>Votre rendez-vous a ete modifie. Nouvelle date : {{date}} a {{heure}}.</p><p>Cordialement,<br/>L equipe Ada Papers</p>',
    textContent:
      'Bonjour {{firstName}},\n\nVotre rendez-vous a ete modifie. Nouvelle date : {{date}} a {{heure}}.\n\nCordialement,\nL equipe Ada Papers',
    category: 'system',
    isSystem: true,
    variables: [
      { name: 'firstName', description: 'Prenom', example: 'Ablaye' },
      { name: 'date', description: 'Date du rendez-vous', example: '13/05/2026' },
      { name: 'heure', description: 'Heure du rendez-vous', example: '11:00' },
    ],
  },
  {
    code: 'appointment_cancelled',
    name: 'Rendez-vous annule',
    description: 'Notification d annulation de rendez-vous',
    subject: 'Rendez-vous annule - Ada Papers',
    htmlContent:
      '<p>Bonjour {{firstName}},</p><p>Votre rendez-vous prevu le {{date}} a {{heure}} a ete annule.</p><p>Cordialement,<br/>L equipe Ada Papers</p>',
    textContent:
      'Bonjour {{firstName}},\n\nVotre rendez-vous prevu le {{date}} a {{heure}} a ete annule.\n\nCordialement,\nL equipe Ada Papers',
    category: 'system',
    isSystem: true,
    variables: [
      { name: 'firstName', description: 'Prenom', example: 'Ablaye' },
      { name: 'date', description: 'Date du rendez-vous', example: '14/05/2026' },
      { name: 'heure', description: 'Heure du rendez-vous', example: '09:00' },
    ],
  },
  {
    code: 'appointment_reminder',
    name: 'Rappel de rendez-vous',
    description: 'Rappel envoye la veille du rendez-vous',
    subject: 'Rappel : rendez-vous demain - Ada Papers',
    htmlContent:
      '<p>Bonjour {{firstName}},</p><p>Rappel de votre rendez-vous de demain, {{date}} a {{heure}}.</p><p>Cordialement,<br/>L equipe Ada Papers</p>',
    textContent:
      'Bonjour {{firstName}},\n\nRappel de votre rendez-vous de demain, {{date}} a {{heure}}.\n\nCordialement,\nL equipe Ada Papers',
    category: 'system',
    isSystem: true,
    variables: [
      { name: 'firstName', description: 'Prenom', example: 'Ablaye' },
      { name: 'date', description: 'Date du rendez-vous', example: '15/05/2026' },
      { name: 'heure', description: 'Heure du rendez-vous', example: '15:00' },
    ],
  },
  {
    code: 'contact_confirmation',
    name: 'Confirmation formulaire contact',
    description: 'Accuse de reception suite au formulaire de contact',
    subject: 'Confirmation de reception de votre demande - Ada Papers',
    htmlContent:
      '<p>Bonjour {{firstName}},</p><p>Nous confirmons la bonne reception de votre demande.</p><p>Notre equipe vous recontacte rapidement.</p><p>Cordialement,<br/>L equipe Ada Papers</p>',
    textContent:
      'Bonjour {{firstName}},\n\nNous confirmons la bonne reception de votre demande.\nNotre equipe vous recontacte rapidement.\n\nCordialement,\nL equipe Ada Papers',
    category: 'message',
    isSystem: true,
    variables: [{ name: 'firstName', description: 'Prenom', example: 'Ablaye' }],
  },
  {
    code: 'contact_admin_alert',
    name: 'Alerte admin contact',
    description: 'Alerte admin lors d un nouveau formulaire de contact',
    subject: 'Nouveau message de contact - {{subject}}',
    htmlContent:
      '<p>Bonjour,</p><p>Un nouveau message de contact a ete recu.</p><p><strong>Sujet :</strong> {{subject}}</p><p><strong>Expediteur :</strong> {{senderName}} ({{senderEmail}})</p>',
    textContent:
      'Bonjour,\n\nUn nouveau message de contact a ete recu.\nSujet : {{subject}}\nExpediteur : {{senderName}} ({{senderEmail}})',
    category: 'message',
    isSystem: true,
    variables: [
      { name: 'subject', description: 'Sujet', example: 'Demande d information' },
      { name: 'senderName', description: 'Nom expediteur', example: 'Jean Dupont' },
      { name: 'senderEmail', description: 'Email expediteur', example: 'jean@exemple.com' },
    ],
  },
  {
    code: 'tarification_payment_reminder',
    name: 'Rappel paiement tarification',
    description: 'Rappel de paiement pour la tarification',
    subject: 'Rappel : tarification - Ada Papers',
    htmlContent:
      '<p>Bonjour {{firstName}},</p><p>Un rappel concernant le paiement de votre tarification.</p><p>Connectez-vous a votre espace pour finaliser la demarche.</p><p>Cordialement,<br/>L equipe Ada Papers</p>',
    textContent:
      'Bonjour {{firstName}},\n\nUn rappel concernant le paiement de votre tarification.\nConnectez-vous a votre espace pour finaliser la demarche.\n\nCordialement,\nL equipe Ada Papers',
    category: 'payment',
    isSystem: true,
    variables: [{ name: 'firstName', description: 'Prenom', example: 'Ablaye' }],
  },
  {
    code: 'tarification_exonerated',
    name: 'Tarification exonerée',
    description: 'Notification d exoneration de frais de tarification',
    subject: 'Frais de tarification exoneres - Ada Papers',
    htmlContent:
      '<p>Bonjour {{firstName}},</p><p>Vos frais de tarification ont ete exoneres.</p><p>Cordialement,<br/>L equipe Ada Papers</p>',
    textContent:
      'Bonjour {{firstName}},\n\nVos frais de tarification ont ete exoneres.\n\nCordialement,\nL equipe Ada Papers',
    category: 'payment',
    isSystem: true,
    variables: [{ name: 'firstName', description: 'Prenom', example: 'Ablaye' }],
  },
  {
    code: 'dossier_transmitted_admin',
    name: 'Dossier transmis (admin)',
    description: 'Notification admin lors de la transmission d un dossier',
    subject: 'Nouveau dossier transmis - Ada Papers',
    htmlContent:
      '<p>Bonjour,</p><p>Un nouveau dossier a ete transmis par {{clientName}}.</p><p>Reference : {{dossierNumero}}</p>',
    textContent:
      'Bonjour,\n\nUn nouveau dossier a ete transmis par {{clientName}}.\nReference : {{dossierNumero}}',
    category: 'dossier',
    isSystem: true,
    variables: [
      { name: 'clientName', description: 'Nom client', example: 'Ablaye Diop' },
      { name: 'dossierNumero', description: 'Reference dossier', example: 'DOS-001' },
    ],
  },
  {
    code: 'dossier_transmitted_client',
    name: 'Dossier transmis (client)',
    description: 'Confirmation client de transmission de dossier',
    subject: 'Votre dossier a ete transmis - Ada Papers',
    htmlContent:
      '<p>Bonjour {{firstName}},</p><p>Votre dossier {{dossierNumero}} a bien ete transmis.</p><p>Cordialement,<br/>L equipe Ada Papers</p>',
    textContent:
      'Bonjour {{firstName}},\n\nVotre dossier {{dossierNumero}} a bien ete transmis.\n\nCordialement,\nL equipe Ada Papers',
    category: 'dossier',
    isSystem: true,
    variables: [
      { name: 'firstName', description: 'Prenom', example: 'Ablaye' },
      { name: 'dossierNumero', description: 'Reference dossier', example: 'DOS-001' },
    ],
  },
  {
    code: 'task_deadline_reminder',
    name: 'Rappel echeance tache',
    description: 'Rappel avant echeance de tache',
    subject: '{{taskTitle}} - Ada Papers',
    htmlContent:
      '<p>Bonjour {{firstName}},</p><p>Rappel : la tache "{{taskTitle}}" arrive a echeance le {{dueDate}}.</p><p>Cordialement,<br/>L equipe Ada Papers</p>',
    textContent:
      'Bonjour {{firstName}},\n\nRappel : la tache "{{taskTitle}}" arrive a echeance le {{dueDate}}.\n\nCordialement,\nL equipe Ada Papers',
    category: 'task',
    isSystem: true,
    variables: [
      { name: 'firstName', description: 'Prenom', example: 'Ablaye' },
      { name: 'taskTitle', description: 'Titre de la tache', example: 'Completer le dossier' },
      { name: 'dueDate', description: 'Date echeance', example: '20/05/2026' },
    ],
  },
  {
    code: 'task_overdue',
    name: 'Tache en retard',
    description: 'Notification de tache en retard',
    subject: 'Tache en retard - Ada Papers',
    htmlContent:
      '<p>Bonjour {{firstName}},</p><p>La tache "{{taskTitle}}" est en retard.</p><p>Connectez-vous a votre espace pour la traiter.</p><p>Cordialement,<br/>L equipe Ada Papers</p>',
    textContent:
      'Bonjour {{firstName}},\n\nLa tache "{{taskTitle}}" est en retard.\nConnectez-vous a votre espace pour la traiter.\n\nCordialement,\nL equipe Ada Papers',
    category: 'task',
    isSystem: true,
    variables: [
      { name: 'firstName', description: 'Prenom', example: 'Ablaye' },
      { name: 'taskTitle', description: 'Titre de la tache', example: 'Completer le dossier' },
    ],
  },
  {
    code: 'message_received',
    name: 'Nouveau message',
    description: 'Alerte email pour nouveau message interne',
    subject: 'Nouveau message reçu',
    htmlContent:
      '<p>Bonjour,</p><p>Vous avez reçu un nouveau message de <strong>{{senderName}}</strong> dans votre espace Ada Papers.</p><p>Nous vous invitons à vous connecter afin de consulter son contenu et y répondre si nécessaire.</p><p>Cordialement,<br/>L’équipe Ada Papers</p>',
    textContent:
      'Bonjour,\n\nVous avez reçu un nouveau message de {{senderName}} dans votre espace Ada Papers.\nNous vous invitons à vous connecter afin de consulter son contenu et y répondre si nécessaire.\n\nCordialement,\nL’équipe Ada Papers',
    category: 'message',
    isSystem: true,
    variables: [{ name: 'senderName', description: 'Expéditeur', example: 'Ada Papers' }],
  },
  {
    code: 'account_email_changed',
    name: 'Email de compte modifie',
    description: 'Template prevu pour confirmer un changement d email',
    subject: 'Votre email de connexion a ete modifie',
    htmlContent:
      '<p>Bonjour {{firstName}},</p><p>Nous confirmons que votre email de connexion a ete modifie.</p><p>Si vous n etes pas a l origine de ce changement, contactez le support immediatement.</p><p>Cordialement,<br/>L equipe Ada Papers</p>',
    textContent:
      'Bonjour {{firstName}},\n\nNous confirmons que votre email de connexion a ete modifie.\nSi vous n etes pas a l origine de ce changement, contactez le support immediatement.\n\nCordialement,\nL equipe Ada Papers',
    category: 'account',
    isSystem: true,
    variables: [{ name: 'firstName', description: 'Prenom', example: 'Ablaye' }],
  },
  {
    code: 'account_phone_changed',
    name: 'Telephone de compte modifie',
    description: 'Template prevu pour confirmer un changement de telephone',
    subject: 'Votre numero de telephone a ete modifie',
    htmlContent:
      '<p>Bonjour {{firstName}},</p><p>Nous confirmons la modification de votre numero de telephone.</p><p>Si cette action n est pas de vous, contactez notre support.</p><p>Cordialement,<br/>L equipe Ada Papers</p>',
    textContent:
      'Bonjour {{firstName}},\n\nNous confirmons la modification de votre numero de telephone.\nSi cette action n est pas de vous, contactez notre support.\n\nCordialement,\nL equipe Ada Papers',
    category: 'account',
    isSystem: true,
    variables: [{ name: 'firstName', description: 'Prenom', example: 'Ablaye' }],
  },
  {
    code: 'document_request_created',
    name: 'Demande de document recue',
    description: 'Template prevu pour confirmer une demande de document',
    subject: 'Votre demande de document a bien ete enregistree',
    htmlContent:
      '<p>Bonjour {{firstName}},</p><p>Votre demande de document "{{documentType}}" a bien ete prise en compte.</p><p>Vous serez informe(e) des prochaines etapes depuis votre espace.</p><p>Cordialement,<br/>L equipe Ada Papers</p>',
    textContent:
      'Bonjour {{firstName}},\n\nVotre demande de document "{{documentType}}" a bien ete prise en compte.\nVous serez informe(e) des prochaines etapes depuis votre espace.\n\nCordialement,\nL equipe Ada Papers',
    category: 'dossier',
    isSystem: true,
    variables: [
      { name: 'firstName', description: 'Prenom', example: 'Ablaye' },
      { name: 'documentType', description: 'Type de document', example: 'Passeport' },
    ],
  },
  {
    code: 'document_request_processed',
    name: 'Demande de document traitee',
    description: 'Template prevu quand une demande de document est traitee',
    subject: 'Mise a jour de votre demande de document',
    htmlContent:
      '<p>Bonjour {{firstName}},</p><p>Votre demande de document "{{documentType}}" est maintenant au statut : <strong>{{status}}</strong>.</p><p>Cordialement,<br/>L equipe Ada Papers</p>',
    textContent:
      'Bonjour {{firstName}},\n\nVotre demande de document "{{documentType}}" est maintenant au statut : {{status}}.\n\nCordialement,\nL equipe Ada Papers',
    category: 'dossier',
    isSystem: true,
    variables: [
      { name: 'firstName', description: 'Prenom', example: 'Ablaye' },
      { name: 'documentType', description: 'Type de document', example: 'Passeport' },
      { name: 'status', description: 'Statut', example: 'Valide' },
    ],
  },
  {
    code: 'payment_received',
    name: 'Paiement recu',
    description: 'Template prevu pour confirmer un paiement',
    subject: 'Paiement recu - Merci pour votre reglement',
    htmlContent:
      '<p>Bonjour {{firstName}},</p><p>Nous confirmons la reception de votre paiement de {{amount}}.</p><p>Reference : {{paymentRef}}</p><p>Cordialement,<br/>L equipe Ada Papers</p>',
    textContent:
      'Bonjour {{firstName}},\n\nNous confirmons la reception de votre paiement de {{amount}}.\nReference : {{paymentRef}}\n\nCordialement,\nL equipe Ada Papers',
    category: 'payment',
    isSystem: true,
    variables: [
      { name: 'firstName', description: 'Prenom', example: 'Ablaye' },
      { name: 'amount', description: 'Montant', example: '49 EUR' },
      { name: 'paymentRef', description: 'Reference paiement', example: 'PAY-2026-001' },
    ],
  },
  {
    code: 'payment_failed',
    name: 'Paiement echoue',
    description: 'Template prevu pour notifier un echec de paiement',
    subject: 'Echec de paiement - Action requise',
    htmlContent:
      '<p>Bonjour {{firstName}},</p><p>Votre tentative de paiement n a pas pu aboutir.</p><p>Merci de reessayer depuis votre espace personnel.</p><p>Cordialement,<br/>L equipe Ada Papers</p>',
    textContent:
      'Bonjour {{firstName}},\n\nVotre tentative de paiement n a pas pu aboutir.\nMerci de reessayer depuis votre espace personnel.\n\nCordialement,\nL equipe Ada Papers',
    category: 'payment',
    isSystem: true,
    variables: [{ name: 'firstName', description: 'Prenom', example: 'Ablaye' }],
  },
  {
    code: 'admin_new_user_alert',
    name: 'Alerte admin nouvel utilisateur',
    description: 'Template prevu pour alerter l equipe d une nouvelle inscription',
    subject: 'Nouvel utilisateur inscrit - {{userEmail}}',
    htmlContent:
      '<p>Bonjour,</p><p>Un nouvel utilisateur vient de s inscrire.</p><p><strong>Nom :</strong> {{userName}}<br/><strong>Email :</strong> {{userEmail}}</p>',
    textContent:
      'Bonjour,\n\nUn nouvel utilisateur vient de s inscrire.\nNom : {{userName}}\nEmail : {{userEmail}}',
    category: 'system',
    isSystem: true,
    variables: [
      { name: 'userName', description: 'Nom complet utilisateur', example: 'Ablaye Diop' },
      { name: 'userEmail', description: 'Email utilisateur', example: 'ablaye@exemple.com' },
    ],
  },
  {
    code: 'weekly_activity_summary',
    name: 'Resume hebdomadaire activite',
    description: 'Template prevu pour un recapitulatif hebdomadaire',
    subject: 'Votre resume hebdomadaire Ada Papers',
    htmlContent:
      '<p>Bonjour {{firstName}},</p><p>Voici votre resume hebdomadaire :</p><ul><li>{{items}}</li></ul><p>Cordialement,<br/>L equipe Ada Papers</p>',
    textContent:
      'Bonjour {{firstName}},\n\nVoici votre resume hebdomadaire :\n{{items}}\n\nCordialement,\nL equipe Ada Papers',
    category: 'other',
    isSystem: true,
    variables: [
      { name: 'firstName', description: 'Prenom', example: 'Ablaye' },
      { name: 'items', description: 'Liste des points', example: '1 dossier mis a jour; 2 messages recus' },
    ],
  },
  {
    code: 'maintenance_announcement',
    name: 'Annonce maintenance',
    description: 'Template prevu pour informer les utilisateurs d une maintenance',
    subject: 'Information maintenance programmee',
    htmlContent:
      '<p>Bonjour {{firstName}},</p><p>Une maintenance est prevue le {{date}} entre {{startTime}} et {{endTime}}.</p><p>Des interruptions temporaires peuvent survenir.</p><p>Merci de votre comprehension.</p>',
    textContent:
      'Bonjour {{firstName}},\n\nUne maintenance est prevue le {{date}} entre {{startTime}} et {{endTime}}.\nDes interruptions temporaires peuvent survenir.\nMerci de votre comprehension.',
    category: 'system',
    isSystem: true,
    variables: [
      { name: 'firstName', description: 'Prenom', example: 'Ablaye' },
      { name: 'date', description: 'Date maintenance', example: '30/05/2026' },
      { name: 'startTime', description: 'Heure debut', example: '22:00' },
      { name: 'endTime', description: 'Heure fin', example: '23:30' },
    ],
  },
];

const DEFAULT_EVENTS = [
  { eventKey: 'account_created', label: 'Compte créé', description: 'Email de bienvenue', category: 'account', templateCode: 'account_welcome' },
  { eventKey: 'signup_activation_link', label: 'Activation compte', description: 'Envoi du lien d activation de compte', category: 'account', templateCode: 'signup_activation_link' },
  { eventKey: 'password_reset_requested', label: 'Réinitialisation mot de passe', description: 'Envoi code temporaire', category: 'account', templateCode: 'password_reset_code' },
  { eventKey: 'password_reset_link', label: 'Lien de reinitialisation', description: 'Envoi du lien de reinitialisation', category: 'account', templateCode: 'password_reset_link' },
  { eventKey: 'dossier_created', label: 'Dossier créé', description: 'Confirmation client', category: 'dossier', templateCode: 'dossier_created' },
  { eventKey: 'dossier_updated', label: 'Dossier mis a jour', description: 'Notification de mise a jour', category: 'dossier', templateCode: 'dossier_updated' },
  { eventKey: 'dossier_status_changed', label: 'Statut dossier modifié', description: 'Notification de changement de statut', category: 'dossier', templateCode: 'dossier_status_changed' },
  { eventKey: 'dossier_transmitted_admin', label: 'Transmission dossier admin', description: 'Nouveau dossier transmis cote admin', category: 'dossier', templateCode: 'dossier_transmitted_admin' },
  { eventKey: 'dossier_transmitted_client', label: 'Transmission dossier client', description: 'Confirmation client de transmission', category: 'dossier', templateCode: 'dossier_transmitted_client' },
  { eventKey: 'appointment_request_received', label: 'Demande RDV recue', description: 'Confirmation demande de rendez-vous', category: 'system', templateCode: 'appointment_request_received' },
  { eventKey: 'appointment_created', label: 'Rendez-vous cree', description: 'Confirmation rendez-vous enregistre', category: 'system', templateCode: 'appointment_created' },
  { eventKey: 'appointment_updated', label: 'Rendez-vous modifie', description: 'Notification de modification', category: 'system', templateCode: 'appointment_updated' },
  { eventKey: 'appointment_cancelled', label: 'Rendez-vous annule', description: 'Notification d annulation', category: 'system', templateCode: 'appointment_cancelled' },
  { eventKey: 'appointment_reminder', label: 'Rappel rendez-vous', description: 'Rappel de rendez-vous', category: 'system', templateCode: 'appointment_reminder' },
  { eventKey: 'contact_confirmation', label: 'Confirmation contact', description: 'Accuse de reception client', category: 'message', templateCode: 'contact_confirmation' },
  { eventKey: 'contact_admin_alert', label: 'Alerte admin contact', description: 'Nouveau message de contact cote admin', category: 'message', templateCode: 'contact_admin_alert' },
  { eventKey: 'message_received', label: 'Message reçu', description: 'Notification message interne', category: 'message', templateCode: 'message_received' },
  { eventKey: 'tarification_payment_reminder', label: 'Rappel tarification', description: 'Rappel de paiement de tarification', category: 'payment', templateCode: 'tarification_payment_reminder' },
  { eventKey: 'tarification_exonerated', label: 'Tarification exoneree', description: 'Notification exoneration des frais', category: 'payment', templateCode: 'tarification_exonerated' },
  { eventKey: 'task_deadline_reminder', label: 'Rappel echeance tache', description: 'Rappel avant echeance de tache', category: 'task', templateCode: 'task_deadline_reminder' },
  { eventKey: 'task_overdue', label: 'Tache en retard', description: 'Notification tache en retard', category: 'task', templateCode: 'task_overdue' },
];

function renderWithVariables(template, variables = {}) {
  const normalize = (v) => (v === undefined || v === null ? '' : String(v));
  const replacer = (_, key) => normalize(variables[String(key).trim()]);
  return String(template || '').replace(/\{\{(.*?)\}\}/g, replacer);
}

async function logEmail(payload) {
  try {
    await EmailLog.create(payload);
  } catch (error) {
    console.error('Erreur log email:', error.message);
  }
}

// Endpoint utilitaire d'envoi direct (préserve le flux de tests manuel existant)
router.post(
  '/send',
  [
    body('to').isEmail().withMessage('Email destinataire invalide'),
    body('subject').trim().notEmpty().withMessage('Le sujet est requis'),
    body('htmlContent').trim().notEmpty().withMessage('Le contenu HTML est requis'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Erreurs de validation', errors: errors.array() });
    }

    const { to, toName = '', subject, htmlContent, textContent = '' } = req.body;
    try {
      const result = await sendTransactionalEmailDetailed({ to, toName, subject, htmlContent, textContent });
      if (!result.ok) {
        throw new Error(result.error || 'Envoi impossible (Brevo et SMTP non configurés ou en erreur)');
      }
      await logEmail({
        eventKey: 'manual',
        to,
        toName,
        subject,
        htmlContent,
        textContent,
        status: 'sent',
        providerMessageId: result.provider || '',
      });
      return res.json({ success: true, provider: result.provider, messageId: result.provider || null });
    } catch (error) {
      await logEmail({
        eventKey: 'manual',
        to,
        toName,
        subject,
        htmlContent,
        textContent,
        status: 'failed',
        error: error.message,
      });
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.use(protect);
router.use(authorize('admin', 'superadmin'));
router.use(requireMongo);

router.post('/init-defaults', async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const created = [];
    const existing = [];
    const updated = [];

    for (const tpl of DEFAULT_TEMPLATES) {
      const found = await EmailTemplate.findOne({ code: tpl.code });
      if (found) {
        // Migration douce: si le template systeme est une ancienne version connue,
        // on l'aligne sur le contenu par defaut actuel.
        if (
          tpl.code === 'account_welcome' &&
          found.isSystem &&
          (found.subject === 'Bienvenue sur Ada Papers' ||
            String(found.description || '').includes('creation de compte') ||
            String(found.description || '').includes('création de compte'))
        ) {
          found.name = tpl.name;
          found.description = tpl.description;
          found.subject = tpl.subject;
          found.htmlContent = tpl.htmlContent;
          found.textContent = tpl.textContent;
          found.category = tpl.category;
          found.variables = tpl.variables || [];
          found.isActive = true;
          found.updatedBy = userId;
          await found.save();
          updated.push(tpl.code);
          continue;
        }
        existing.push(tpl.code);
        continue;
      }
      const doc = await EmailTemplate.create({ ...tpl, createdBy: userId, updatedBy: userId });
      created.push(doc);
    }

    for (const ev of DEFAULT_EVENTS) {
      const found = await EmailEventSetting.findOne({ eventKey: ev.eventKey });
      if (!found) {
        await EmailEventSetting.create({ ...ev, enabled: true, updatedBy: userId });
      }
    }

    res.json({
      success: true,
      created: created.length,
      existing: existing.length,
      updated: updated.length,
      templates: created,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

router.get('/templates', async (req, res) => {
  try {
    const { search, category, isActive } = req.query;
    const q = {};
    if (category) q.category = category;
    if (isActive !== undefined) q.isActive = isActive === 'true';
    if (search) {
      q.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }
    const templates = await EmailTemplate.find(q).sort({ category: 1, code: 1 });
    res.json({ success: true, count: templates.length, templates });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

router.post(
  '/templates',
  [
    body('code').trim().notEmpty(),
    body('name').trim().notEmpty(),
    body('subject').trim().notEmpty(),
    body('htmlContent').trim().notEmpty(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

      const existing = await EmailTemplate.findOne({ code: req.body.code });
      if (existing) return res.status(400).json({ success: false, message: 'Un template avec ce code existe déjà' });

      const doc = await EmailTemplate.create({
        ...req.body,
        variables: req.body.variables || [],
        category: req.body.category || 'other',
        isActive: req.body.isActive !== undefined ? req.body.isActive : true,
        createdBy: req.user.id,
        updatedBy: req.user.id,
      });
      res.status(201).json({ success: true, template: doc });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
    }
  }
);

router.put('/templates/:id', async (req, res) => {
  try {
    const doc = await EmailTemplate.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Template non trouvé' });

    if (req.body.code && req.body.code !== doc.code) {
      const exists = await EmailTemplate.findOne({ code: req.body.code });
      if (exists) return res.status(400).json({ success: false, message: 'Un template avec ce code existe déjà' });
      doc.code = req.body.code;
    }
    ['name', 'description', 'subject', 'htmlContent', 'textContent', 'category'].forEach((k) => {
      if (req.body[k] !== undefined) doc[k] = req.body[k];
    });
    if (req.body.variables !== undefined) doc.variables = req.body.variables;
    if (req.body.isActive !== undefined) doc.isActive = req.body.isActive;
    doc.updatedBy = req.user.id;
    await doc.save();
    res.json({ success: true, template: doc });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

router.delete('/templates/:id', async (req, res) => {
  try {
    const doc = await EmailTemplate.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Template non trouvé' });
    if (doc.isSystem) return res.status(403).json({ success: false, message: 'Les templates système ne peuvent pas être supprimés' });
    await doc.deleteOne();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

router.post('/templates/:id/preview', async (req, res) => {
  try {
    const doc = await EmailTemplate.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Template non trouvé' });
    const variables = req.body.variables || {};
    res.json({
      success: true,
      preview: {
        subject: renderWithVariables(doc.subject, variables),
        htmlContent: renderWithVariables(doc.htmlContent, variables),
        textContent: renderWithVariables(doc.textContent, variables),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

router.post(
  '/templates/:id/send-test',
  [body('to').isEmail().withMessage('Email destinataire invalide')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

      const template = await EmailTemplate.findById(req.params.id);
      if (!template) return res.status(404).json({ success: false, message: 'Template non trouvé' });
      if (!template.isActive) return res.status(400).json({ success: false, message: 'Template inactif' });

      const variables = req.body.variables || {};
      const subject = renderWithVariables(template.subject, variables);
      const htmlContent = renderWithVariables(template.htmlContent, variables);
      const textContent = renderWithVariables(template.textContent, variables);

      const result = await sendTransactionalEmailDetailed({
        to: req.body.to,
        toName: req.body.toName || '',
        subject,
        htmlContent,
        textContent,
      });
      if (!result.ok) {
        throw new Error(result.error || 'Envoi impossible (Brevo et SMTP non configurés ou en erreur)');
      }

      await logEmail({
        eventKey: 'template_test',
        to: req.body.to,
        toName: req.body.toName || '',
        subject,
        htmlContent,
        textContent,
        templateCode: template.code,
        variables,
        status: 'sent',
        sentBy: req.user.id,
        providerMessageId: result.provider || '',
      });

      res.json({ success: true, provider: result.provider, messageId: result.provider || null });
    } catch (error) {
      await logEmail({
        eventKey: 'template_test',
        to: req.body.to || '',
        toName: req.body.toName || '',
        subject: 'N/A',
        status: 'failed',
        error: error.message,
        sentBy: req.user.id,
      });
      res.status(500).json({ success: false, message: 'Erreur envoi test', error: error.message });
    }
  }
);

router.get('/events', async (req, res) => {
  try {
    const events = await EmailEventSetting.find().sort({ category: 1, eventKey: 1 });
    res.json({ success: true, count: events.length, events });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

router.put('/events/:id', async (req, res) => {
  try {
    const event = await EmailEventSetting.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Événement non trouvé' });
    ['label', 'description', 'category', 'templateCode', 'conditions'].forEach((k) => {
      if (req.body[k] !== undefined) event[k] = req.body[k];
    });
    if (req.body.enabled !== undefined) event.enabled = req.body.enabled;
    if (req.body.cooldownSec !== undefined) event.cooldownSec = req.body.cooldownSec;
    event.updatedBy = req.user.id;
    await event.save();
    res.json({ success: true, event });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

router.get('/logs', async (req, res) => {
  try {
    const { to, status, eventKey, templateCode, page = 1, limit = 50 } = req.query;
    const q = {};
    if (to) q.to = { $regex: to, $options: 'i' };
    if (status) q.status = status;
    if (eventKey) q.eventKey = eventKey;
    if (templateCode) q.templateCode = templateCode;

    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      EmailLog.find(q).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).populate('sentBy', 'firstName lastName email'),
      EmailLog.countDocuments(q),
    ]);

    res.json({ success: true, logs, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

module.exports = router;

