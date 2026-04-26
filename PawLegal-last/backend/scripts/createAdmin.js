const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');
const readline = require('readline');

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

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

const createAdmin = async () => {
  try {
    await connectDB();

    console.log('\n📝 Création d\'un compte administrateur\n');

    const firstName = await question('Prénom: ');
    const lastName = await question('Nom: ');
    const email = await question('Email: ');
    const password = await question('Mot de passe (min 8 caractères): ');
    const phone = await question('Téléphone (optionnel): ') || undefined;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log('\n❌ Un utilisateur avec cet email existe déjà.');
      rl.close();
      process.exit(1);
    }

    if (password.length < 8) {
      console.log('\n❌ Le mot de passe doit contenir au moins 8 caractères.');
      rl.close();
      process.exit(1);
    }

    const admin = await User.create({
      firstName,
      lastName,
      email,
      password,
      phone,
      role: 'admin',
      isActive: true,
      profilComplete: true
    });

    console.log('\n✅ Compte administrateur créé avec succès !\n');
    console.log('📋 Détails du compte:');
    console.log(`   Nom: ${admin.firstName} ${admin.lastName}`);
    console.log(`   Email: ${admin.email}`);
    console.log(`   Rôle: ${admin.role}`);
    console.log(`   ID: ${admin._id}\n`);

    rl.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erreur lors de la création de l\'admin:', error.message);
    rl.close();
    process.exit(1);
  }
};

createAdmin();



