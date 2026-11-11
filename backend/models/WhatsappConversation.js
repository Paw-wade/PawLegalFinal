const mongoose = require('mongoose');

const whatsappConversationSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, trim: true },
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
      ],
      default: 'menu',
    },
    // Données collectées pour le RDV en cours
    rdv: {
      nom: String,
      prenom: String,
      telephone: String,
      motif: String,
      note: String,
    },
    lastActivity: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Réinitialise la conversation après 24h d'inactivité
whatsappConversationSchema.methods.isExpired = function () {
  const hoursSince = (Date.now() - this.lastActivity) / (1000 * 60 * 60);
  return hoursSince > 24;
};

module.exports = mongoose.model('WhatsappConversation', whatsappConversationSchema);
