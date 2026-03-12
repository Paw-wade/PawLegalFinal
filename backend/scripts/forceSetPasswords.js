const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

dotenv.config();

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || '');
    console.log(`✅ MongoDB connecté : ${conn.connection.host}\n`);
    return conn;
  } catch (error) {
    console.error('❌ Erreur de connexion MongoDB:', error.message);
    process.exit(1);
  }
};

// Mot de passe par défaut pour tous les utilisateurs
const DEFAULT_PASSWORD = 'Pawlegal25+';

const forceSetPasswords = async () => {
  try {
    await connectDB();

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🔐 DÉFINITION FORCÉE DES MOTS DE PASSE');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Récupérer tous les utilisateurs
    const allUsers = await User.find({});
    
    const passwords = {};
    let count = 0;

    console.log(`📋 Traitement de ${allUsers.length} compte(s)...\n`);

    for (const user of allUsers) {
      // Utiliser le mot de passe par défaut pour tous les utilisateurs
      const plainPassword = DEFAULT_PASSWORD;
      
      // Hasher le mot de passe
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(plainPassword, salt);
      
      // Mettre à jour directement dans MongoDB
      await User.updateOne(
        { _id: user._id },
        { 
          $set: { 
            password: hashedPassword,
            needsPasswordSetup: false
          }
        }
      );

      passwords[user._id.toString()] = {
        email: user.email || 'N/A',
        name: `${user.firstName} ${user.lastName}`,
        role: user.role,
        password: plainPassword
      };

      count++;
      console.log(`✅ Mot de passe défini pour ${user.firstName} ${user.lastName} (${user.email || 'N/A'}) - Rôle: ${user.role}`);
    }

    console.log(`\n✅ ${count} mot(s) de passe défini(s)\n`);

    // Afficher un résumé des mots de passe générés
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📝 RÉSUMÉ DES MOTS DE PASSE GÉNÉRÉS');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // Grouper par rôle pour une meilleure lisibilité
    const byRole = {};
    for (const userId of Object.keys(passwords)) {
      const info = passwords[userId];
      if (!byRole[info.role]) {
        byRole[info.role] = [];
      }
      byRole[info.role].push(info);
    }

    // Afficher par rôle
    for (const role of Object.keys(byRole).sort()) {
      console.log(`\n📌 ${role.toUpperCase()}:`);
      console.log('─'.repeat(60));
      for (const info of byRole[role]) {
        console.log(`\n👤 ${info.name}`);
        console.log(`   Email        : ${info.email}`);
        console.log(`   Mot de passe : ${info.password}`);
      }
    }

    console.log('\n\n⚠️  IMPORTANT : Notez ces mots de passe dans un endroit sûr !');
    console.log('   Vous pouvez les sauvegarder dans un fichier sécurisé.\n');

    // Vérification finale
    const finalCheck = await User.find({}).select('+password');
    const withPassword = finalCheck.filter(u => {
      const pwd = u.password;
      return pwd && pwd !== '' && pwd !== null && pwd !== undefined && pwd.length > 0;
    }).length;
    const withoutPassword = finalCheck.length - withPassword;

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 STATISTIQUES FINALES');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`   Avec mot de passe    : ${withPassword}`);
    console.log(`   Sans mot de passe   : ${withoutPassword}\n`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erreur lors de la définition des mots de passe:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

forceSetPasswords();
