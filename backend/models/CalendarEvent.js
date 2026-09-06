const mongoose = require('mongoose');

const calendarEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['evenement', 'email_programme'],
      required: true,
    },
    titre: { type: String, required: true, trim: true, maxlength: 300 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    date: { type: Date, required: true },
    heureDebut: { type: String, trim: true, default: '' },
    heureFin: { type: String, trim: true, default: '' },
    couleur: {
      type: String,
      enum: ['blue', 'green', 'purple', 'orange', 'red', 'amber', 'indigo', 'pink'],
      default: 'blue',
    },
    visibilite: {
      type: String,
      enum: ['prive', 'equipe', 'tous'],
      default: 'equipe',
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    dossierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', default: null },
    // Pour email_programme uniquement
    emailTo: { type: String, trim: true, default: '' },
    emailSujet: { type: String, trim: true, default: '' },
    emailCorps: { type: String, trim: true, default: '' },
    emailEnvoye: { type: Boolean, default: false },
    emailEnvoyeAt: { type: Date, default: null },
    // Rappel simple (legacy)
    rappelVeille: { type: Boolean, default: false },
    rappelVeilleSent: { type: Boolean, default: false },
    // Rappels configures
    rappels: [
      {
        triggerAt: { type: Date, required: true },
        canaux: { type: [String], enum: ['email', 'inapp', 'sms'], default: ['email', 'inapp'] },
        sent: { type: Boolean, default: false },
        sentAt: { type: Date, default: null },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('CalendarEvent', calendarEventSchema);
