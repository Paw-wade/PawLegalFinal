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
      'constitution_societe',
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
    trim: true,
    default: 'recu'
  },
  priorite: {
    type: String,
    enum: ['basse', 'normale', 'haute', 'urgente'],
    default: 'normale'
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  pinnedAt: {
    type: Date,
    required: false
  },
  pinnedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
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
  assignmentHistory: [{
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false
    },
    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    changedAt: {
      type: Date,
      default: Date.now
    }
  }],
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
  // Étapes supplémentaires ajoutées manuellement par l'admin ou le partenaire (non prévues dans le flux standard)
  etapesSupplementaires: [{
    id: { type: String, trim: true },
    label: { type: String, required: true, trim: true },
    date: { type: Date },
    ordre: { type: Number, default: 0 },
    addedAt: { type: Date, default: Date.now },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  // Compléments au récit : informations ajoutées par le client, le créateur, l'admin ou le partenaire (visibles dans le récap et le PDF)
  complementsRecit: [{
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    addedAt: { type: Date, default: Date.now },
    authorName: { type: String, trim: true },
    role: { type: String, trim: true },
    /** Titre court affiché en onglet / en-tête (optionnel) */
    title: { type: String, trim: true, default: '' },
    text: { type: String, required: true, trim: true }
  }],
  // Formule tarifaire choisie par le client (visible admin uniquement côté API pour les partenaires)
  formuleTarifaire: {
    type: String,
    enum: ['standard', 'premium'],
    required: false
  },
  formuleTarifaireChoisieAt: {
    type: Date,
    required: false
  },
  // Rappel envoyé au client (notification + SMS) si le dossier passe « En cours » sans choix
  formuleTarifaireReminderSent: {
    type: Boolean,
    default: false
  },
  // Montant de tarification fixé manuellement par superadmin (pas de choix Standard/Premium côté client)
  montantTarificationFixe: {
    type: Number,
    min: 0,
    required: false
  },
  montantTarificationFixeAt: {
    type: Date,
    required: false
  },
  montantTarificationFixeBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  // Tarifications multiples (prestations différentes) fixées par Ada Papers
  tarificationPrestations: [
    {
      label: { type: String, trim: true, required: true, maxlength: 160 },
      montant: { type: Number, min: 0, required: true },
      statut: {
        type: String,
        enum: ['a_regler', 'reglee'],
        default: 'a_regler',
      },
      createdAt: { type: Date, default: Date.now },
      createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    },
  ],
  tarificationNotificationSentAt: {
    type: Date,
    required: false
  },
  /** Résumé du dernier message « notification tarification » envoyé au client (in-app / base pour SMS). */
  tarificationLastNotifySummary: {
    type: String,
    trim: true,
    maxlength: 2000,
    required: false,
  },
  paiementTarificationEffectue: {
    type: Boolean,
    default: false
  },
  paiementTarificationEffectueAt: {
    type: Date,
    required: false
  },
  paiementTarificationEffectueBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  // Exonération des frais de tarification (décision admin à l’acceptation ou ultérieurement)
  fraisExoneres: {
    type: Boolean,
    default: false
  },
  fraisExoneresAt: {
    type: Date,
    required: false
  },
  fraisExoneresBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  fraisExoneresMotif: {
    type: String,
    trim: true,
    maxlength: 500,
    required: false
  },
  // Mise en stand-by : le dossier existe mais n'est pas traité temporairement
  isStandby: {
    type: Boolean,
    default: false
  },
  standbyReason: {
    type: String,
    trim: true,
    maxlength: 500,
    required: false
  },
  standbyAt: {
    type: Date,
    required: false
  },
  standbyUntil: {
    type: Date,
    required: false
  },
  standbyBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  transmittedTo: [{
    partenaire: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    transmittedAt: {
      type: Date,
      default: Date.now
    },
    transmittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    notes: {
      type: String,
      trim: true
    },
    acknowledged: {
      type: Boolean,
      default: false
    },
    acknowledgedAt: {
      type: Date
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'refused'],
      default: 'pending'
    },
    /** Si la transmission a envoyé une notification (in-app + email) au titulaire du dossier. */
    clientWasNotified: {
      type: Boolean,
      default: true
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
      // Format court : DOS-YYMM-NN (séquence mensuelle sur 2 chiffres, ex. DOS-2604-07)
      const date = this.createdAt || new Date();
      const yy = String(date.getFullYear() % 100).padStart(2, '0');
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const yymm = `${yy}${mm}`;
      const prefix = `DOS-${yymm}-`;

      const collection = this.constructor.collection;
      const lastDossier = await collection.findOne(
        { numero: { $regex: `^DOS-${yymm}-\\d{2}$` } },
        { sort: { numero: -1 } }
      );

      let sequence = 1;
      if (lastDossier && lastDossier.numero) {
        const parts = lastDossier.numero.split('-');
        if (parts.length >= 3) {
          const lastSequence = parseInt(parts[2] || '0', 10);
          if (Number.isFinite(lastSequence)) {
            sequence = lastSequence + 1;
          }
        }
      }

      if (sequence > 99) {
        throw new Error(`Séquence mensuelle dépassée (>99) pour le préfixe ${prefix}`);
      }

      let numero = `${prefix}${String(sequence).padStart(2, '0')}`;
      let exists = await collection.findOne({ numero });
      let attempts = 0;
      while (exists && attempts < 100) {
        sequence++;
        if (sequence > 99) {
          throw new Error(`Séquence mensuelle dépassée (>99) pour le préfixe ${prefix}`);
        }
        numero = `${prefix}${String(sequence).padStart(2, '0')}`;
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

