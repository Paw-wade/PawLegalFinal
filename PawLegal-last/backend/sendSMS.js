// sendSMS.js
const twilio = require('twilio');

// Variables d'environnement
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

// Initialiser le client Twilio de manière paresseuse (lazy initialization)
let client = null;

/**
 * Initialise le client Twilio si les credentials sont valides
 * @returns {object|null} - Client Twilio ou null si non configuré
 */
function getTwilioClient() {
  // Si le client est déjà initialisé, le retourner
  if (client !== null) {
    return client;
  }

  // Vérifier que les credentials Twilio sont configurés
  if (!accountSid || !authToken) {
    console.warn('⚠️ Twilio non configuré : TWILIO_ACCOUNT_SID et TWILIO_AUTH_TOKEN doivent être définis dans .env');
    return null;
  }

  // Vérifier que l'Account SID commence par "AC" (format valide)
  if (!accountSid.startsWith('AC')) {
    console.warn('⚠️ TWILIO_ACCOUNT_SID invalide : doit commencer par "AC". Vérifiez votre configuration Twilio.');
    return null;
  }

  try {
    // Initialiser le client Twilio
    client = twilio(accountSid, authToken);
    console.log('✅ Client Twilio initialisé avec succès');
    return client;
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation du client Twilio:', error.message);
    return null;
  }
}

/**
 * Formate un numéro de téléphone pour Twilio (format E.164)
 * @param {string} phone - numéro de téléphone à formater
 * @returns {string|null} - numéro formaté ou null si invalide
 */
function formatPhoneNumber(phone) {
  if (!phone) return null;
  
  // Supprimer tous les espaces, tirets, points, parenthèses
  let cleaned = phone.replace(/[\s\-\.\(\)]/g, '');
  
  // Si le numéro commence par 0, le remplacer par +33 (code France)
  if (cleaned.startsWith('0')) {
    cleaned = '+33' + cleaned.substring(1);
  }
  // Si le numéro ne commence pas par +, ajouter +33
  else if (!cleaned.startsWith('+')) {
    // Si c'est un numéro français (10 chiffres), ajouter +33
    if (cleaned.length === 10 && /^[0-9]+$/.test(cleaned)) {
      cleaned = '+33' + cleaned.substring(1);
    } else {
      cleaned = '+' + cleaned;
    }
  }
  
  return cleaned;
}

/**
 * Envoie un SMS via Twilio
 * @param {string} to - numéro du destinataire, ex: '+33612345678' ou '0612345678'
 * @param {string} body - message à envoyer
 * @param {object} options - options supplémentaires (from, etc.)
 * @returns {Promise<object>} - message Twilio créé
 */
async function sendSMS(to, body, options = {}) {
  // Obtenir le client Twilio (initialisation paresseuse)
  const twilioClient = getTwilioClient();
  if (!twilioClient) {
    throw new Error('Twilio n\'est pas configuré. Vérifiez vos variables d\'environnement TWILIO_ACCOUNT_SID et TWILIO_AUTH_TOKEN.');
  }

  if (!twilioPhoneNumber) {
    throw new Error('TWILIO_PHONE_NUMBER n\'est pas configuré dans les variables d\'environnement.');
  }

  if (!to) {
    throw new Error('Le numéro de téléphone du destinataire est requis.');
  }

  if (!body || body.trim().length === 0) {
    throw new Error('Le message SMS ne peut pas être vide.');
  }

  try {
    // Formater le numéro de téléphone
    const formattedTo = formatPhoneNumber(to);
    if (!formattedTo) {
      throw new Error(`Numéro de téléphone invalide: ${to}`);
    }

    // Préparer les options du message
    const messageOptions = {
      body: body.trim(),
      from: options.from || twilioPhoneNumber,
      to: formattedTo,
    };

    // Envoyer le SMS
    const message = await twilioClient.messages.create(messageOptions);
    
    console.log(`✅ SMS envoyé avec succès:`);
    console.log(`   - SID: ${message.sid}`);
    console.log(`   - À: ${formattedTo}`);
    console.log(`   - Statut: ${message.status}`);
    
    return {
      success: true,
      sid: message.sid,
      status: message.status,
      to: formattedTo,
      from: messageOptions.from,
      body: body.trim()
    };
  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi du SMS:', error);
    
    // Gérer les erreurs spécifiques de Twilio
    if (error.code === 21211) {
      throw new Error('Le numéro de téléphone fourni est invalide.');
    } else if (error.code === 21608) {
      throw new Error('Le numéro de téléphone n\'est pas vérifié. En mode test, vous ne pouvez envoyer des SMS qu\'aux numéros vérifiés.');
    } else if (error.code === 21408) {
      throw new Error('Vous n\'avez pas la permission d\'envoyer des SMS à ce numéro.');
    } else if (error.message) {
      throw new Error(`Erreur Twilio: ${error.message}`);
    } else {
      throw new Error('Erreur lors de l\'envoi du SMS. Vérifiez vos credentials Twilio.');
    }
  }
}

/**
 * Remplit les variables dans un template de message
 * @param {string} template - template avec variables {{variable}}
 * @param {object} variables - objet avec les valeurs des variables
 * @returns {string} - message avec variables remplacées
 */
function fillTemplate(template, variables = {}) {
  let message = template;
  Object.keys(variables).forEach(key => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    message = message.replace(regex, variables[key] || '');
  });
  return message;
}

/**
 * Vérifie si un utilisateur accepte de recevoir un type de SMS
 * @param {object} user - utilisateur MongoDB
 * @param {string} smsType - type de SMS (appointment_confirmed, etc.)
 * @returns {boolean} - true si l'utilisateur accepte ce type de SMS
 */
function canReceiveSMS(user, smsType) {
  // Si pas d'utilisateur, autoriser (pour les SMS OTP ou manuels)
  if (!user) return true;
  
  // Si les préférences SMS n'existent pas, autoriser par défaut
  if (!user.smsPreferences) return true;
  
  // Si les SMS sont désactivés globalement, refuser (sauf OTP)
  if (!user.smsPreferences.enabled && smsType !== 'otp') return false;
  
  // Si le type spécifique est désactivé, refuser (sauf OTP)
  if (user.smsPreferences.types && user.smsPreferences.types[smsType] === false && smsType !== 'otp') {
    return false;
  }
  
  return true;
}

/**
 * Envoie un SMS de notification avec template et historique
 * @param {string} to - numéro du destinataire
 * @param {string} type - type de notification (appointment_confirmed, etc.) ou code de template
 * @param {object} data - données pour personnaliser le message
 * @param {object} options - options supplémentaires (userId, sentBy, context, contextId, skipPreferences)
 * @returns {Promise<object>} - résultat de l'envoi
 */
async function sendNotificationSMS(to, type, data = {}, options = {}) {
  const SmsTemplate = require('./models/SmsTemplate');
  const SmsHistory = require('./models/SmsHistory');
  const User = require('./models/User');
  
  let message = '';
  let templateCode = type;
  let templateName = type;
  let variables = data;
  
  // Vérifier les préférences utilisateur si un userId est fourni
  if (options.userId && !options.skipPreferences) {
    const user = await User.findById(options.userId);
    if (user && !canReceiveSMS(user, type)) {
      console.log(`⚠️ SMS non envoyé: l'utilisateur ${options.userId} a désactivé les SMS de type ${type}`);
      return {
        success: false,
        skipped: true,
        reason: 'user_preferences',
        message: 'SMS non envoyé selon les préférences utilisateur'
      };
    }
  }
  
  // Essayer de charger un template depuis la base de données
  try {
    const template = await SmsTemplate.findOne({ 
      code: type, 
      isActive: true 
    });
    
    if (template) {
      templateCode = template.code;
      templateName = template.name;
      message = fillTemplate(template.message, data);
    } else {
      // Fallback sur les messages par défaut si aucun template trouvé
      const defaultMessages = {
        appointment_confirmed: `Bonjour {{name}}, votre rendez-vous est confirmé le {{date}} à {{time}}. Paw Legal.`,
        appointment_reminder: `Rappel: Vous avez un rendez-vous demain le {{date}} à {{time}}. Paw Legal.`,
        appointment_cancelled: `Votre rendez-vous du {{date}} à {{time}} a été annulé. Paw Legal.`,
        appointment_updated: `Votre rendez-vous du {{date}} à {{time}} a été modifié. Paw Legal.`,
        dossier_created: `Votre dossier "{{dossierTitle}}" a été créé. Référence: {{dossierId}}. Paw Legal.`,
        dossier_updated: `Votre dossier "{{dossierTitle}}" a été mis à jour. Statut: {{statut}}. Paw Legal.`,
        dossier_status_changed: `Votre dossier "{{dossierTitle}}" a changé de statut: {{statut}}. Paw Legal.`,
        document_uploaded: `Un nouveau document a été ajouté à votre dossier "{{dossierTitle}}". Paw Legal.`,
        document_request: `{{isUrgentText}}Document requis pour votre dossier {{dossierNumero}}. Type: {{documentType}}. Connectez-vous pour envoyer. Paw Legal.`,
        document_received: `Document "{{documentName}}" reçu pour le dossier {{dossierNumero}}. Paw Legal.`,
        message_received: `Vous avez reçu un nouveau message de {{senderName}}. Connectez-vous pour le consulter. Paw Legal.`,
        task_assigned: `Une nouvelle tâche vous a été assignée: {{taskTitle}}. Paw Legal.`,
        task_reminder: `Rappel: La tâche "{{taskTitle}}" est due le {{dateEcheance}}. Paw Legal.`,
        task_overdue: `⚠️ ALERTE: La tâche "{{taskTitle}}" assignée à {{assignedTo}} est en retard de {{daysOverdue}} jour(s). Échéance: {{deadlineDate}}. Paw Legal.`,
      };
      
      const defaultTemplate = defaultMessages[type] || data.message || 'Vous avez reçu une notification de Paw Legal.';
      message = fillTemplate(defaultTemplate, data);
    }
  } catch (error) {
    console.error('Erreur lors du chargement du template:', error);
    // Fallback sur un message simple
    message = data.message || 'Vous avez reçu une notification de Paw Legal.';
  }
  
  // Envoyer le SMS
  let result;
  let historyRecord;
  
  try {
    result = await sendSMS(to, message);
    
    // Enregistrer dans l'historique
    try {
      historyRecord = await SmsHistory.create({
        to: result.to,
        message: result.body,
        templateCode,
        templateName,
        variables: data,
        status: result.status === 'sent' || result.status === 'queued' ? 'sent' : 'pending',
        twilioSid: result.sid,
        twilioStatus: result.status,
        sentBy: options.sentBy || null,
        sentToUser: options.userId || null,
        context: options.context || 'other',
        contextId: options.contextId || null,
        sentAt: new Date()
      });
    } catch (historyError) {
      console.error('⚠️ Erreur lors de l\'enregistrement de l\'historique:', historyError);
      // Ne pas bloquer l'envoi si l'historique échoue
    }
    
    return {
      ...result,
      templateCode,
      templateName,
      historyId: historyRecord?._id
    };
  } catch (error) {
    // Enregistrer l'échec dans l'historique
    try {
      await SmsHistory.create({
        to: formatPhoneNumber(to) || to,
        message,
        templateCode,
        templateName,
        variables: data,
        status: 'failed',
        error: error.message,
        sentBy: options.sentBy || null,
        sentToUser: options.userId || null,
        context: options.context || 'other',
        contextId: options.contextId || null,
        sentAt: new Date()
      });
    } catch (historyError) {
      console.error('⚠️ Erreur lors de l\'enregistrement de l\'échec:', historyError);
    }
    
    throw error;
  }
}

module.exports = {
  sendSMS,
  sendNotificationSMS,
  formatPhoneNumber,
  fillTemplate,
  canReceiveSMS
};
