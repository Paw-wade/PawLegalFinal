const mongoose = require('mongoose');

const dossierSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Peut être null si l'utilisateur n'est pas encore inscrit
  },
  // Informations du client (si pas d'utilisateur inscrit)
  clientNom: {
    type: String,
    trim: true
  },
  clientPrenom: {
    type: String,
    trim: true
  },
  clientEmail: {
    type: String,
    trim: true,
    lowercase: true
  },
  clientTelephone: {
    type: String,
    trim: true
  },
  numero: {
    type: String,
    unique: true,
    sparse: true, // Permet plusieurs valeurs null
    trim: true
  },
  titre: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  categorie: {
    type: String,
    enum: [
      'sejour_titres',
      'contentieux_administratif',
      'asile',
      'regroupement_familial',
      'nationalite_francaise',
      'eloignement_urgence',
      'autre'
    ],
    default: 'autre'
  },
  type: {
    type: String,
    trim: true
  },
  statut: {
    type: String,
    enum: [
      'recu',
      'accepte',
      'refuse',
      'annule',
      'en_attente_onboarding',
      'en_cours_instruction',
      'pieces_manquantes',
      'dossier_complet',
      'depose',
      'reception_confirmee',
      'complement_demande',
      'decision_defavorable',
      'communication_motifs',
      'recours_preparation',
      'refere_mesures_utiles',
      'refere_suspension_rep',
      'gain_cause',
      'rejet',
      'decision_favorable',
      'autre'
    ],
    default: 'recu'
  },
  priorite: {
    type: String,
    enum: ['basse', 'normale', 'haute', 'urgente'],
    default: 'normale'
  },
  dateEcheance: {
    type: Date
  },
  documents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document'
  }],
  messages: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  }],
  rendezVous: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RendezVous'
  }],
  // Lien vers le message de contact d'origine (si le dossier a été créé depuis un message de contact)
  createdFromContactMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    required: false
  },
  notes: {
    type: String,
    trim: true
  },
  motifRefus: {
    type: String,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true // L'admin qui a créé le dossier
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Le membre de l'équipe à qui le dossier est assigné (déprécié, utiliser teamMembers)
  },
  // Équipe de traitement du dossier
  teamMembers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  teamLeader: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Chef d'équipe unique
  },
  externalMembers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExternalTeamMember',
    required: false
  }],
  // Collaborateurs actifs (état temporaire)
  activeCollaborators: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    lastActivity: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Générer automatiquement un numéro unique pour le dossier avant de sauvegarder
dossierSchema.pre('save', async function(next) {
  this.updatedAt = Date.now();
  
  // Nettoyer les collaborateurs actifs si le dossier est clôturé ou annulé
  const statutsFinaux = ['annule', 'decision_favorable', 'decision_defavorable', 'rejet', 'gain_cause'];
  if (this.isModified('statut') && statutsFinaux.includes(this.statut)) {
    // Vider la liste des collaborateurs actifs
    this.activeCollaborators = [];
    console.log(`🧹 Nettoyage des collaborateurs actifs pour le dossier ${this._id} (statut: ${this.statut})`);
  }
  
  // Générer un numéro unique si ce n'est pas déjà défini
  if (!this.numero) {
    try {
      // Générer un numéro au format DOS-YYYYMMDD-XXXX
      const date = this.createdAt || new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const prefix = `DOS-${year}${month}${day}-`;
      
      // Trouver le dernier numéro du jour en utilisant la collection directement
      const collection = this.constructor.collection;
      const lastDossier = await collection.findOne(
        { numero: { $regex: `^${prefix}` } },
        { sort: { numero: -1 } }
      );
      
      let sequence = 1;
      if (lastDossier && lastDossier.numero) {
        const parts = lastDossier.numero.split('-');
        if (parts.length >= 3) {
          const lastSequence = parseInt(parts[2] || '0');
          sequence = lastSequence + 1;
        }
      }
      
      // Vérifier que le numéro n'existe pas déjà
      let numero = `${prefix}${String(sequence).padStart(4, '0')}`;
      let exists = await collection.findOne({ numero });
      let attempts = 0;
      while (exists && attempts < 100) {
        sequence++;
        numero = `${prefix}${String(sequence).padStart(4, '0')}`;
        exists = await collection.findOne({ numero });
        attempts++;
      }
      
      this.numero = numero;
    } catch (error) {
      console.error('Erreur lors de la génération du numéro de dossier:', error);
      // En cas d'erreur, générer un numéro basé sur le timestamp
      this.numero = `DOS-${Date.now()}`;
    }
  }
  
  next();
});

// Index pour améliorer les performances
dossierSchema.index({ user: 1, createdAt: -1 });
dossierSchema.index({ statut: 1 });
dossierSchema.index({ categorie: 1 });
dossierSchema.index({ type: 1 });
dossierSchema.index({ createdBy: 1 });
dossierSchema.index({ assignedTo: 1 });
// Note: L'index sur 'numero' est créé automatiquement par unique: true dans la définition du champ

module.exports = mongoose.model('Dossier', dossierSchema);

