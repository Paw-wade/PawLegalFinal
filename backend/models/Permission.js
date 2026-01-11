const mongoose = require('mongoose');

// Schéma pour les permissions détaillées
const permissionSchema = new mongoose.Schema({
  domaine: {
    type: String,
    required: true,
    enum: [
      'tableau_de_bord',
      'utilisateurs',
      'dossiers',
      'taches',
      'rendez_vous',
      'creneaux',
      'messages',
      'documents',
      'temoignages',
      'notifications',
      'sms',
      'cms',
      'logs',
      'corbeille'
    ]
  },
  consulter: {
    type: Boolean,
    default: false
  },
  modifier: {
    type: Boolean,
    default: false
  },
  nePasConsulter: {
    type: Boolean,
    default: false
  },
  nePasModifier: {
    type: Boolean,
    default: false
  },
  supprimer: {
    type: Boolean,
    default: false
  }
}, { _id: false });

// Schéma principal des permissions utilisateur
const userPermissionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  roles: [{
    type: String,
    enum: ['client', 'admin', 'superadmin', 'assistant', 'comptable', 'secretaire', 'juriste', 'stagiaire', 'visiteur']
  }],
  permissions: [permissionSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Mettre à jour updatedAt avant de sauvegarder
userPermissionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index pour améliorer les performances
// Note: L'index sur 'user' est créé automatiquement par unique: true
userPermissionSchema.index({ roles: 1 });

module.exports = mongoose.model('Permission', userPermissionSchema);

