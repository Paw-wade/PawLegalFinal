const mongoose = require('mongoose');

const trashSchema = new mongoose.Schema({
  // Type d'élément supprimé (message, document, dossier, etc.)
  itemType: {
    type: String,
    required: true,
    enum: ['message', 'document', 'dossier', 'appointment', 'temoignage', 'user', 'task', 'notification', 'other']
  },
  
  // ID de l'élément original
  originalId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  
  // Données complètes de l'élément supprimé (pour restauration)
  itemData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  
  // Utilisateur qui a supprimé l'élément
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Date de suppression
  deletedAt: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  },
  
  // Origine/page d'où provient l'élément
  origin: {
    type: String,
    required: true,
    default: 'unknown'
  },
  
  // Informations sur le propriétaire original (pour filtrage client/admin)
  originalOwner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  
  // Métadonnées supplémentaires
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Index pour la recherche efficace
trashSchema.index({ deletedAt: 1, itemType: 1 });
trashSchema.index({ deletedBy: 1 });
trashSchema.index({ originalOwner: 1 });

// Méthode statique pour nettoyer les éléments de plus de 30 jours
trashSchema.statics.cleanOldItems = async function() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const result = await this.deleteMany({
    deletedAt: { $lt: thirtyDaysAgo }
  });
  
  console.log(`🗑️ Nettoyage automatique: ${result.deletedCount} élément(s) supprimé(s) définitivement`);
  return result;
};

module.exports = mongoose.model('Trash', trashSchema);

