/**
 * Script pour corriger les index dupliqués dans MongoDB
 * 
 * Ce script supprime les index dupliqués qui causent des warnings Mongoose.
 * 
 * Usage: node scripts/fix-duplicate-indexes.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Dossier = require('../models/Dossier');

async function fixDuplicateIndexes() {
  try {
    // Connexion à MongoDB
    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI) {
      console.error('❌ MONGODB_URI n\'est pas défini dans le fichier .env');
      process.exit(1);
    }

    await mongoose.connect(mongoURI);
    console.log('✅ Connecté à MongoDB');

    const collection = Dossier.collection;
    const indexes = await collection.indexes();
    
    console.log('\n📋 Index actuels sur la collection "dossiers":');
    indexes.forEach((index, i) => {
      console.log(`  ${i + 1}. ${JSON.stringify(index.key)} - Options: ${JSON.stringify(index)}`);
    });

    // Chercher les index dupliqués sur "numero"
    const numeroIndexes = indexes.filter(idx => 
      idx.key && idx.key.numero === 1
    );

    if (numeroIndexes.length > 1) {
      console.log(`\n⚠️ ${numeroIndexes.length} index trouvés sur "numero". Suppression des doublons...`);
      
      // Garder le premier index (celui créé par unique: true dans le schéma)
      // Supprimer les autres
      for (let i = 1; i < numeroIndexes.length; i++) {
        const indexToDrop = numeroIndexes[i];
        const indexName = indexToDrop.name || 'numero_1';
        
        try {
          await collection.dropIndex(indexName);
          console.log(`✅ Index "${indexName}" supprimé`);
        } catch (error) {
          if (error.code === 27) {
            console.log(`ℹ️ Index "${indexName}" n'existe pas (déjà supprimé)`);
          } else {
            console.error(`❌ Erreur lors de la suppression de l'index "${indexName}":`, error.message);
          }
        }
      }
    } else if (numeroIndexes.length === 1) {
      console.log('\n✅ Un seul index sur "numero" trouvé - pas de doublon');
    } else {
      console.log('\n⚠️ Aucun index sur "numero" trouvé');
    }

    // Vérifier les index après nettoyage
    const indexesAfter = await collection.indexes();
    console.log('\n📋 Index après nettoyage:');
    indexesAfter.forEach((index, i) => {
      console.log(`  ${i + 1}. ${JSON.stringify(index.key)}`);
    });

    console.log('\n✅ Nettoyage terminé');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Exécuter le script
fixDuplicateIndexes();

