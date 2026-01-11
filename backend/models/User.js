const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'Le prénom est requis'],
    trim: true
  },
  lastName: {
    type: String,
    required: [true, 'Le nom est requis'],
    trim: true
  },
  email: {
    type: String,
    required: false, // Email optionnel lors de la création, peut être ajouté plus tard
    unique: true,
    sparse: true, // Permet plusieurs valeurs null
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Veuillez entrer un email valide']
  },
  password: {
    type: String,
    required: false, // Mot de passe optionnel lors de la création via OTP
    minlength: [8, 'Le mot de passe doit contenir au moins 8 caractères'],
    select: false
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  needsPasswordSetup: {
    type: Boolean,
    default: false // Indique si l'utilisateur doit définir un mot de passe
  },
  phone: {
    type: String,
    trim: true,
    required: [true, 'Le numéro de téléphone est requis']
  },
  role: {
    type: String,
    enum: ['client', 'admin', 'superadmin', 'assistant', 'comptable', 'secretaire', 'juriste', 'stagiaire', 'visiteur', 'partenaire'],
    default: 'client'
  },
  partenaireInfo: {
    typeOrganisme: {
      type: String,
      enum: ['consulat', 'association', 'avocat'],
      required: false
    },
    nomOrganisme: {
      type: String,
      trim: true
    },
    adresseOrganisme: {
      type: String,
      trim: true
    },
    contactPrincipal: {
      type: String,
      trim: true
    }
  },
  profilComplete: {
    type: Boolean,
    default: false
  },
  dateNaissance: {
    type: Date
  },
  lieuNaissance: {
    type: String,
    trim: true
  },
  nationalite: {
    type: String,
    trim: true
  },
  sexe: {
    type: String,
    enum: ['M', 'F', 'Autre']
  },
  numeroEtranger: {
    type: String,
    trim: true
  },
  numeroTitre: {
    type: String,
    trim: true
  },
  typeTitre: {
    type: String,
    trim: true
  },
  dateDelivrance: {
    type: Date
  },
  dateExpiration: {
    type: Date
  },
  adressePostale: {
    type: String,
    trim: true
  },
  ville: {
    type: String,
    trim: true
  },
  codePostal: {
    type: String,
    trim: true
  },
  pays: {
    type: String,
    trim: true,
    default: 'France'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  smsPreferences: {
    enabled: {
      type: Boolean,
      default: true // Par défaut, les SMS sont activés
    },
    types: {
      appointment_confirmed: { type: Boolean, default: true },
      appointment_cancelled: { type: Boolean, default: true },
      appointment_updated: { type: Boolean, default: true },
      appointment_reminder: { type: Boolean, default: true },
      dossier_created: { type: Boolean, default: true },
      dossier_updated: { type: Boolean, default: true },
      dossier_status_changed: { type: Boolean, default: true },
      document_uploaded: { type: Boolean, default: true },
      message_received: { type: Boolean, default: true },
      task_assigned: { type: Boolean, default: true },
      task_reminder: { type: Boolean, default: true },
      account_security: { type: Boolean, default: true },
      otp: { type: Boolean, default: true } // OTP toujours activé pour sécurité
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Hash le mot de passe avant de sauvegarder (seulement si un mot de passe est fourni)
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) {
    return next();
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Méthode pour comparer les mots de passe
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) {
    return false; // Pas de mot de passe défini
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

// Mettre à jour updatedAt avant de sauvegarder
userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('User', userSchema);


