const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  direction: { type: String, enum: ['inbound', 'outbound'], required: true },
  type: {
    type: String,
    enum: ['text', 'image', 'document', 'audio', 'video', 'sticker', 'location', 'unknown'],
    default: 'text',
  },
  content: { type: String, default: '' },
  mediaUrl: { type: String, default: '' },
  mediaId: { type: String, default: '' },
  mediaUri: { type: String, default: '' },
  filename: { type: String, default: '' },
  mimeType: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
  waMessageId: { type: String, default: '' },
  replyToWaId: { type: String, default: '' },
  replyToContent: { type: String, default: '' },
  isInternalNote: { type: Boolean, default: false },
  pinned: { type: Boolean, default: false },
}, { _id: true });

const whatsappConversationSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, trim: true },
    contactName: { type: String, default: '' },
    state: {
      type: String,
      enum: [
        'menu',
        'faq_menu',
        'rdv_name',
        'rdv_motif',
        'rdv_tel',
        'rdv_note',
        'rdv_confirm',
        'contact_name',
        'rdv_creneau',
        'mes_dossiers',
        'suivi_dossier',
        'demande_menu',
        'titre_sejour_menu',
        'dossier_select',
        'dossier_detail',
        'doc_choix_type',
        'doc_attente_fichier',
        'contact_motif',
        'contact_message',
        'dossier_docs_list',
      ],
      default: 'menu',
    },
    rdv: {
      nom: String,
      prenom: String,
      telephone: String,
      motif: String,
      note: String,
      date: String,
      heure: String,
      creneauId: { type: mongoose.Schema.Types.ObjectId, default: null },
    },
    docContext: {
      dossierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', default: null },
      dossierNumero: { type: String, default: '' },
      dossierCount: { type: Number, default: 0 },
      docType: { type: String, default: '' },
      documentRequestId: { type: String, default: '' },
    },
    messages: { type: [messageSchema], default: [] },
    unreadAdmin: { type: Number, default: 0 },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    dossierIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Dossier' }],
    customName: { type: String, default: '' },
    humanMode: { type: Boolean, default: false },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lastActivity: { type: Date, default: Date.now },
    reminderAt: { type: Date, default: null },
    reminderNote: { type: String, default: '' },
    followUpStatus: {
      type: String,
      enum: ['none', 'en_attente_client', 'en_attente_document', 'en_cours', 'resolu'],
      default: 'none',
    },
  },
  { timestamps: true }
);

whatsappConversationSchema.methods.isExpired = function () {
  const hoursSince = (Date.now() - this.lastActivity) / (1000 * 60 * 60);
  return hoursSince > 24;
};

module.exports = mongoose.model('WhatsappConversation', whatsappConversationSchema);
