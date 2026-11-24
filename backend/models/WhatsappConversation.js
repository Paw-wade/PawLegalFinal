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
  filename: { type: String, default: '' },
  mimeType: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

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
        'mes_dossiers',
        'suivi_dossier',
        'demande_menu',
      ],
      default: 'menu',
    },
    rdv: {
      nom: String,
      prenom: String,
      telephone: String,
      motif: String,
      note: String,
    },
    messages: { type: [messageSchema], default: [] },
    unreadAdmin: { type: Number, default: 0 },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    dossierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', default: null },
    lastActivity: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

whatsappConversationSchema.methods.isExpired = function () {
  const hoursSince = (Date.now() - this.lastActivity) / (1000 * 60 * 60);
  return hoursSince > 24;
};

module.exports = mongoose.model('WhatsappConversation', whatsappConversationSchema);
