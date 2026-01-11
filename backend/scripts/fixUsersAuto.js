const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');
const crypto = require('crypto');

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

const generatePassword = (length = 12) => {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};

const fixUsersAuto = async () => {
  try {
    await connectDB();

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🔧 CORRECTION AUTOMATIQUE DES COMPTES UTILISATEURS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    let changesMade = false;
    const passwords = {}; // Stocker les mots de passe générés

    // 1. Corriger les rôles "consulat" et "avocat" en "partenaire"
    console.log('📋 Étape 1 : Correction des rôles invalides...\n');

    const usersWithInvalidRoles = await User.find({
      role: { $in: ['consulat', 'avocat'] }
    });

    if (usersWithInvalidRoles.length > 0) {
      console.log(`   Trouvé ${usersWithInvalidRoles.length} compte(s) avec des rôles invalides :\n`);

      for (const user of usersWithInvalidRoles) {
        const oldRole = user.role;
        const newRole = 'partenaire';
        const typeOrganisme = oldRole === 'consulat' ? 'consulat' : 'avocat';

        console.log(`   - ${user.firstName} ${user.lastName} (${user.email || 'N/A'})`);
        console.log(`     Rôle actuel : ${oldRole}`);
        console.log(`     Nouveau rôle : ${newRole} (typeOrganisme: ${typeOrganisme})`);

        // Mettre à jour le rôle et partenaireInfo
        user.role = newRole;
        if (!user.partenaireInfo) {
          user.partenaireInfo = {};
        }
        user.partenaireInfo.typeOrganisme = typeOrganisme;
        
        // Si nomOrganisme n'est pas défini, utiliser le nom de l'utilisateur
        if (!user.partenaireInfo.nomOrganisme) {
          user.partenaireInfo.nomOrganisme = `${user.firstName} ${user.lastName}`;
        }

        await user.save();
        console.log(`     ✅ Rôle corrigé avec succès\n`);
        changesMade = true;
      }
    } else {
      console.log('   ✅ Aucun compte avec des rôles invalides trouvé\n');
    }

    // 2. Définir des mots de passe pour les comptes qui n'en ont pas
    console.log('📋 Étape 2 : Définition des mots de passe...\n');

    // Récupérer tous les utilisateurs avec le mot de passe (select('+password') pour inclure le champ)
    const allUsersForPassword = await User.find({}).select('+password');
    
    // Filtrer ceux qui n'ont pas de mot de passe
    const usersWithoutPassword = allUsersForPassword.filter(user => {
      // Vérifier si le champ password existe et n'est pas vide
      const hasPassword = user.password && 
                         user.password !== '' && 
                         user.password !== null && 
                         user.password !== undefined;
      return !hasPassword;
    });

    if (usersWithoutPassword.length > 0) {
      console.log(`   Trouvé ${usersWithoutPassword.length} compte(s) sans mot de passe\n`);
      console.log('   Génération automatique de mots de passe sécurisés...\n');

      for (const user of usersWithoutPassword) {
        // Générer un mot de passe aléatoire
        const password = generatePassword(12);
        passwords[user._id.toString()] = {
          email: user.email || 'N/A',
          name: `${user.firstName} ${user.lastName}`,
          password: password
        };

        // Définir le mot de passe (sera hashé automatiquement par le pre-save hook)
        user.password = password;
        user.needsPasswordSetup = false;

        await user.save();
        console.log(`   ✅ Mot de passe défini pour ${user.firstName} ${user.lastName} (${user.email || 'N/A'})`);
        changesMade = true;
      }

      // Afficher un résumé des mots de passe générés
      console.log('\n   ═══════════════════════════════════════════════════════════════');
      console.log('   📝 RÉSUMÉ DES MOTS DE PASSE GÉNÉRÉS');
      console.log('   ═══════════════════════════════════════════════════════════════\n');
      
      for (const userId of Object.keys(passwords)) {
        const info = passwords[userId];
        console.log(`   ${info.name} (${info.email})`);
        console.log(`   Mot de passe : ${info.password}\n`);
      }
      console.log('   ⚠️  IMPORTANT : Notez ces mots de passe dans un endroit sûr !\n');
    } else {
      console.log('   ✅ Tous les comptes ont déjà un mot de passe\n');
    }

    // 3. Marquer les téléphones comme vérifiés pour les comptes actifs
    console.log('📋 Étape 3 : Vérification des téléphones...\n');

    const usersWithUnverifiedPhone = await User.find({
      isActive: true,
      phoneVerified: false,
      phone: { $exists: true, $ne: null, $ne: '' }
    });

    if (usersWithUnverifiedPhone.length > 0) {
      console.log(`   Marquer ${usersWithUnverifiedPhone.length} téléphone(s) comme vérifié(s)...\n`);

      for (const user of usersWithUnverifiedPhone) {
        user.phoneVerified = true;
        await user.save();
        console.log(`   ✅ Téléphone vérifié pour ${user.firstName} ${user.lastName} (${user.phone})`);
        changesMade = true;
      }
      console.log('');
    } else {
      console.log('   ✅ Tous les téléphones sont déjà vérifiés\n');
    }

    // Résumé final
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ CORRECTIONS TERMINÉES');
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (!changesMade) {
      console.log('ℹ️  Aucune modification nécessaire.\n');
    }

    // Afficher un résumé des changements
    const allUsersForStats = await User.find({});
    const statsByRole = {};
    allUsersForStats.forEach(user => {
      statsByRole[user.role] = (statsByRole[user.role] || 0) + 1;
    });

    console.log('📊 Nouvelle répartition des rôles :\n');
    Object.entries(statsByRole)
      .sort((a, b) => b[1] - a[1])
      .forEach(([role, count]) => {
        console.log(`   ${role.padEnd(15)}: ${count} compte(s)`);
      });

    const usersWithPasswordForStats = await User.find({}).select('+password');
    const withPassword = usersWithPasswordForStats.filter(u => u.password && u.password !== '' && u.password !== null).length;
    const withoutPassword = usersWithPasswordForStats.filter(u => !u.password || u.password === '' || u.password === null).length;

    console.log(`\n📊 Mots de passe :\n`);
    console.log(`   Avec mot de passe    : ${withPassword}`);
    console.log(`   Sans mot de passe   : ${withoutPassword}`);

    const verifiedPhones = await User.find({ phoneVerified: true }).countDocuments();
    const unverifiedPhones = await User.find({ phoneVerified: false }).countDocuments();

    console.log(`\n📊 Téléphones :\n`);
    console.log(`   Vérifiés            : ${verifiedPhones}`);
    console.log(`   Non vérifiés        : ${unverifiedPhones}`);

    console.log('\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erreur lors de la correction des utilisateurs:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

fixUsersAuto();
