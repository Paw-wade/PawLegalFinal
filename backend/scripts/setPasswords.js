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

const generatePassword = (length = 12) => {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};

const setPasswords = async () => {
  try {
    await connectDB();

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🔐 DÉFINITION DES MOTS DE PASSE');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Récupérer tous les utilisateurs avec le mot de passe
    const allUsers = await User.find({}).select('+password');
    
    const passwords = {};
    let count = 0;

    for (const user of allUsers) {
      // Vérifier si l'utilisateur a un mot de passe
      // On vérifie directement le champ password
      const hasPassword = user.password && 
                         user.password !== '' && 
                         user.password !== null && 
                         user.password !== undefined &&
                         user.password.length > 0;

      if (!hasPassword) {
        // Générer un mot de passe
        const plainPassword = generatePassword(12);
        
        // Hasher le mot de passe manuellement
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(plainPassword, salt);
        
        // Mettre à jour directement dans MongoDB pour éviter le hook pre-save
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
    }

    if (count === 0) {
      console.log('✅ Tous les comptes ont déjà un mot de passe\n');
    } else {
      console.log(`\n✅ ${count} mot(s) de passe défini(s)\n`);

      // Afficher un résumé des mots de passe générés
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('📝 RÉSUMÉ DES MOTS DE PASSE GÉNÉRÉS');
      console.log('═══════════════════════════════════════════════════════════════\n');
      
      for (const userId of Object.keys(passwords)) {
        const info = passwords[userId];
        console.log(`👤 ${info.name}`);
        console.log(`   Email    : ${info.email}`);
        console.log(`   Rôle     : ${info.role}`);
        console.log(`   Mot de passe : ${info.password}\n`);
      }
      console.log('⚠️  IMPORTANT : Notez ces mots de passe dans un endroit sûr !\n');
    }

    // Vérification finale
    const finalCheck = await User.find({}).select('+password');
    const withPassword = finalCheck.filter(u => u.password && u.password !== '' && u.password !== null).length;
    const withoutPassword = finalCheck.filter(u => !u.password || u.password === '' || u.password === null).length;

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

setPasswords();
