const mongoose = require('mongoose');
const dotenv = require('dotenv');
const CmsContent = require('../models/CmsContent');

dotenv.config();

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || '');
    console.log(`✅ MongoDB connecté : ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error('❌ Erreur de connexion MongoDB:', error.message);
    process.exit(1);
  }
};

// Clés CMS par défaut à créer
const defaultCmsKeys = [
  {
    key: 'layout.header.subtitle_home',
    value: "Service d'Accompagnement aux démarches administratives",
    locale: 'fr-FR',
    page: 'layout',
    section: 'header',
    description: 'Sous-titre du header sur la page d\'accueil',
    status: 'published'
  },
  {
    key: 'layout.header.subtitle_admin',
    value: "Panneau d'Administration",
    locale: 'fr-FR',
    page: 'layout',
    section: 'header',
    description: 'Sous-titre du header sur le dashboard administrateur',
    status: 'published'
  },
  {
    key: 'layout.header.subtitle_client',
    value: 'Espace Client',
    locale: 'fr-FR',
    page: 'layout',
    section: 'header',
    description: 'Sous-titre du header sur le dashboard client',
    status: 'published'
  },
  {
    key: 'admin.dashboard.title',
    value: 'Tableau de bord Administrateur',
    locale: 'fr-FR',
    page: 'admin',
    section: 'dashboard',
    description: 'Titre principal du dashboard administrateur',
    status: 'published'
  },
  {
    key: 'admin.dashboard.subtitle',
    value: "Vue d'ensemble Ada Papers",
    locale: 'fr-FR',
    page: 'admin',
    section: 'dashboard',
    description: 'Sous-titre du dashboard administrateur',
    status: 'published'
  },
  {
    key: 'client.dashboard.title',
    value: 'Bienvenue',
    locale: 'fr-FR',
    page: 'client',
    section: 'dashboard',
    description: 'Titre principal du dashboard client',
    status: 'published'
  },
  {
    key: 'client.dashboard.subtitle',
    value: "Gérez vos dossiers et suivez l'avancement de vos démarches",
    locale: 'fr-FR',
    page: 'client',
    section: 'dashboard',
    description: 'Sous-titre du dashboard client',
    status: 'published'
  }
];

const initCmsKeys = async () => {
  try {
    await connectDB();

    console.log('\n📝 Initialisation des clés CMS manquantes\n');

    let created = 0;
    let skipped = 0;
    let updated = 0;

    for (const cmsData of defaultCmsKeys) {
      // Vérifier si la clé existe déjà
      const existing = await CmsContent.findOne({
        key: cmsData.key,
        locale: cmsData.locale
      }).sort({ version: -1 });

      if (existing) {
        // Si elle existe mais n'est pas publiée, la mettre à jour
        if (existing.status !== 'published') {
          const newVersion = existing.version + 1;
          existing.value = cmsData.value;
          existing.status = 'published';
          existing.isActive = true;
          existing.page = cmsData.page;
          existing.section = cmsData.section;
          existing.description = cmsData.description;
          existing.version = newVersion;

          // Ajouter à l'historique
          if (!existing.changeHistory) {
            existing.changeHistory = [];
          }
          existing.changeHistory.push({
            version: existing.version - 1,
            value: existing.value,
            description: existing.description,
            status: existing.status,
            changeType: 'published',
            updatedAt: new Date()
          });

          await existing.save();
          console.log(`✅ Clé "${cmsData.key}" mise à jour et publiée`);
          updated++;
        } else {
          console.log(`⏭️  Clé "${cmsData.key}" existe déjà et est publiée`);
          skipped++;
        }
      } else {
        // Créer une nouvelle entrée
        const entry = await CmsContent.create({
          ...cmsData,
          version: 1,
          isActive: true,
          changeHistory: [{
            version: 1,
            value: cmsData.value,
            description: cmsData.description,
            status: cmsData.status,
            changeType: 'created',
            updatedAt: new Date()
          }]
        });

        console.log(`✅ Clé "${cmsData.key}" créée avec succès`);
        created++;
      }
    }

    console.log('\n📊 Résumé:');
    console.log(`   ✅ Créées: ${created}`);
    console.log(`   🔄 Mises à jour: ${updated}`);
    console.log(`   ⏭️  Ignorées: ${skipped}`);
    console.log(`   📝 Total traité: ${defaultCmsKeys.length}\n`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erreur lors de l\'initialisation des clés CMS:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

initCmsKeys();

