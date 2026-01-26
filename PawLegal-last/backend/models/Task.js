const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  titre: {
    type: String,
    required: false,
    trim: true,
    default: ''
  },
  description: {
    type: String,
    trim: true
  },
  statut: {
    type: String,
    enum: ['a_faire', 'en_cours', 'en_attente', 'termine', 'annule'],
    default: 'a_faire'
  },
  priorite: {
    type: String,
    enum: ['basse', 'normale', 'haute', 'urgente'],
    default: 'normale'
  },
  assignedTo: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'User',
    default: [],
    validate: {
      validator: function(v) {
        // Permettre un tableau vide temporairement (pendant la modification)
        // La validation finale se fera dans les routes
        return Array.isArray(v);
      },
      message: 'assignedTo doit être un tableau'
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Le créateur de la tâche est requis'],
  },
  dateEcheance: {
    type: Date
  },
  dateDebut: {
    type: Date
  },
  dateFin: {
    type: Date
  },
  dossier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dossier',
    required: false // Optionnel, une tâche peut être liée à un dossier
  },
  notes: {
    type: String,
    trim: true
  },
  // Historique des commentaires/notes internes liés à la tâche
  commentaires: [
    {
      utilisateur: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      contenu: {
        type: String,
        required: true,
        trim: true,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  effectue: {
    type: Boolean,
    default: false
  },
  commentaireEffectue: {
    type: String,
    trim: true
  },
  dateEffectue: {
    type: Date
  },
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  archived: {
    type: Boolean,
    default: false,
    index: true
  },
  archivedAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Index pour améliorer les performances
taskSchema.index({ assignedTo: 1, statut: 1 });
taskSchema.index({ createdBy: 1 });
taskSchema.index({ dossier: 1 });
taskSchema.index({ dateEcheance: 1 });
taskSchema.index({ statut: 1, priorite: 1 });
taskSchema.index({ archived: 1, statut: 1 });

// Mettre à jour updatedAt avant de sauvegarder et normaliser assignedTo
taskSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  // Si assignedTo n'est pas un tableau, le convertir
  if (this.assignedTo && !Array.isArray(this.assignedTo)) {
    this.assignedTo = [this.assignedTo];
  }
  next();
});

module.exports = mongoose.model('Task', taskSchema);

