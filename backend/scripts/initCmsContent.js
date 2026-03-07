const mongoose = require('mongoose');
const CmsContent = require('../models/CmsContent');
require('dotenv').config();

// Configuration des clés CMS à initialiser
const cmsKeys = [
  {
    key: 'home.hero.badge',
    value: 'Expertise juridique reconnue',
    page: 'home',
    section: 'hero',
    description: 'Badge affiché dans la section hero de la page d\'accueil'
  },
  {
    key: 'home.hero.title',
    value: 'Votre partenaire de confiance',
    page: 'home',
    section: 'hero',
    description: 'Titre principal de la section hero'
  },
  {
    key: 'home.hero.title_highlight',
    value: 'de confiance',
    page: 'home',
    section: 'hero',
    description: 'Partie du titre à mettre en évidence'
  },
  {
    key: 'home.hero.subtitle',
    value: "Nous vous accompagnons dans toutes vos démarches administratives liées au séjour en France : première demande et renouvellement de titre de séjour, regroupement familial et demande de visa. Bénéficiez d’un accompagnement personnalisé pour constituer un dossier complet, conforme et sécurisé. Suivez l'évolution de votre dossier en temps réel sur la plateforme.",
    page: 'home',
    section: 'hero',
    description: 'Sous-titre de la section hero'
  },
  {
    key: 'home.hero.cta_primary',
    value: 'Créer mon compte gratuit',
    page: 'home',
    section: 'hero',
    description: 'Texte du bouton d\'action principal'
  },
  {
    key: 'home.hero.cta_secondary',
    value: 'Consultation rapide',
    page: 'home',
    section: 'hero',
    description: 'Texte du bouton d\'action secondaire'
  },
  {
    key: 'home.hero.small_text',
    value: "Suivez en temps réel l'évolution de votre dossier",
    page: 'home',
    section: 'hero',
    description: 'Petit texte informatif sous les boutons'
  },
  {
    key: 'home.domains.title',
    value: "Nos Domaines d'Intervention",
    page: 'home',
    section: 'domains',
    description: 'Titre de la section domaines d\'intervention'
  },
  {
    key: 'home.domains.subtitle',
    value: 'Une expertise reconnue dans trois domaines essentiels du droit',
    page: 'home',
    section: 'domains',
    description: 'Sous-titre de la section domaines d\'intervention'
  }
];

async function initCmsContent() {
  try {
    // Connexion à MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MONGODB_URI n\'est pas défini dans le fichier .env');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB');

    const locale = 'fr-FR';
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const cmsKey of cmsKeys) {
      // Vérifier si la clé existe déjà
      const existing = await CmsContent.findOne({
        key: cmsKey.key,
        locale: locale,
        isActive: true
      }).sort({ version: -1 });

      if (existing) {
        // Si elle existe et est publiée, on la met à jour si la valeur a changé
        if (existing.status === 'published' && existing.value === cmsKey.value) {
          console.log(`⏭️  Clé "${cmsKey.key}" existe déjà avec la même valeur - ignorée`);
          skippedCount++;
          continue;
        }
        
        // Si elle existe et est publiée mais la valeur a changé, on la met à jour
        if (existing.status === 'published' && existing.value !== cmsKey.value) {
          const newVersion = existing.version + 1;
          existing.value = cmsKey.value;
          existing.description = cmsKey.description;
          existing.page = cmsKey.page;
          existing.section = cmsKey.section;
          existing.version = newVersion;
          existing.status = 'published';
          existing.isActive = true;
          
          // Ajouter à l'historique
          if (!existing.changeHistory) {
            existing.changeHistory = [];
          }
          existing.changeHistory.push({
            version: newVersion,
            value: cmsKey.value,
            description: cmsKey.description,
            status: 'published',
            changeType: 'updated',
            updatedAt: new Date()
          });

          await existing.save();
          console.log(`✅ Clé "${cmsKey.key}" mise à jour et republiée (version ${newVersion})`);
          updatedCount++;
          continue;
        }
        
        // Si elle existe mais est en draft, on la met à jour
        const newVersion = existing.version + 1;
        existing.value = cmsKey.value;
        existing.description = cmsKey.description;
        existing.page = cmsKey.page;
        existing.section = cmsKey.section;
        existing.version = newVersion;
        existing.status = 'published';
        existing.isActive = true;
        
        // Ajouter à l'historique
        if (!existing.changeHistory) {
          existing.changeHistory = [];
        }
        existing.changeHistory.push({
          version: newVersion,
          value: cmsKey.value,
          description: cmsKey.description,
          status: 'published',
          changeType: 'published',
          updatedAt: new Date()
        });

        await existing.save();
        console.log(`✅ Clé "${cmsKey.key}" mise à jour et publiée (version ${newVersion})`);
        updatedCount++;
      } else {
        // Créer une nouvelle entrée
        const newEntry = await CmsContent.create({
          key: cmsKey.key,
          value: cmsKey.value,
          locale: locale,
          page: cmsKey.page,
          section: cmsKey.section,
          description: cmsKey.description,
          version: 1,
          isActive: true,
          status: 'published',
          changeHistory: [{
            version: 1,
            value: cmsKey.value,
            description: cmsKey.description,
            status: 'published',
            changeType: 'created',
            updatedAt: new Date()
          }]
        });

        console.log(`✅ Clé "${cmsKey.key}" créée et publiée`);
        createdCount++;
      }
    }

    console.log('\n📊 Résumé:');
    console.log(`   - ${createdCount} clé(s) créée(s)`);
    console.log(`   - ${updatedCount} clé(s) mise(s) à jour`);
    console.log(`   - ${skippedCount} clé(s) ignorée(s) (déjà publiées)`);
    console.log(`\n✅ Initialisation terminée avec succès!`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Exécuter le script
initCmsContent();

