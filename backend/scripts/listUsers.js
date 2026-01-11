const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');

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

const formatDate = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleString('fr-FR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getRoleColor = (role) => {
  const colors = {
    'superadmin': '\x1b[35m', // Magenta
    'admin': '\x1b[32m', // Green
    'partenaire': '\x1b[34m', // Blue
    'client': '\x1b[36m', // Cyan
    'assistant': '\x1b[33m', // Yellow
    'comptable': '\x1b[33m',
    'secretaire': '\x1b[33m',
    'juriste': '\x1b[33m',
    'stagiaire': '\x1b[33m',
    'visiteur': '\x1b[37m' // White
  };
  return colors[role] || '\x1b[0m';
};

const getRoleLabel = (role) => {
  const labels = {
    'superadmin': 'Super Admin',
    'admin': 'Admin',
    'partenaire': 'Partenaire',
    'client': 'Client',
    'assistant': 'Assistant',
    'comptable': 'Comptable',
    'secretaire': 'Secrétaire',
    'juriste': 'Juriste',
    'stagiaire': 'Stagiaire',
    'visiteur': 'Visiteur'
  };
  return labels[role] || role;
};

const listUsers = async () => {
  try {
    await connectDB();

    console.log('📋 Récupération de tous les utilisateurs...\n');

    // Récupérer avec le champ password pour vérifier s'il existe
    const users = await User.find({}).select('+password').sort({ createdAt: -1 });

    if (users.length === 0) {
      console.log('⚠️  Aucun utilisateur trouvé dans la base de données.\n');
      process.exit(0);
    }

    // Statistiques par rôle
    const statsByRole = {};
    users.forEach(user => {
      statsByRole[user.role] = (statsByRole[user.role] || 0) + 1;
    });

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 STATISTIQUES PAR RÔLE');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    Object.entries(statsByRole)
      .sort((a, b) => b[1] - a[1])
      .forEach(([role, count]) => {
        const color = getRoleColor(role);
        const reset = '\x1b[0m';
        console.log(`   ${color}${getRoleLabel(role).padEnd(15)}${reset}: ${count} compte(s)`);
      });

    console.log(`\n   ${'Total'.padEnd(15)}: ${users.length} compte(s)\n`);

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('👥 LISTE DÉTAILLÉE DES COMPTES');
    console.log('═══════════════════════════════════════════════════════════════\n');

    users.forEach((user, index) => {
      const color = getRoleColor(user.role);
      const reset = '\x1b[0m';
      const roleLabel = getRoleLabel(user.role);
      const statusIcon = user.isActive ? '✅' : '❌';
      const profileIcon = user.profilComplete ? '✓' : '✗';
      const phoneIcon = user.phoneVerified ? '✓' : '✗';
      // Vérifier si le mot de passe existe (peut être hashé, donc on vérifie juste s'il n'est pas null/undefined/vide)
      const hasPassword = user.password && 
                         user.password !== '' && 
                         user.password !== null && 
                         user.password !== undefined &&
                         user.password.length > 0;
      const passwordIcon = hasPassword ? '✓' : '✗';

      console.log(`${index + 1}. ${color}${roleLabel}${reset} - ${user.firstName} ${user.lastName}`);
      console.log(`   ID              : ${user._id}`);
      console.log(`   Email           : ${user.email || 'N/A'}`);
      console.log(`   Téléphone       : ${user.phone || 'N/A'}`);
      console.log(`   Statut          : ${statusIcon} ${user.isActive ? 'Actif' : 'Inactif'}`);
      console.log(`   Profil complet  : ${profileIcon} ${user.profilComplete ? 'Oui' : 'Non'}`);
      console.log(`   Tél. vérifié    : ${phoneIcon} ${user.phoneVerified ? 'Oui' : 'Non'}`);
      console.log(`   Mot de passe    : ${passwordIcon} ${hasPassword ? 'Défini' : 'Non défini'}`);
      
      if (user.needsPasswordSetup) {
        console.log(`   ⚠️  Mot de passe à configurer`);
      }

      // Informations spécifiques aux partenaires
      if (user.role === 'partenaire' && user.partenaireInfo) {
        console.log(`   ── Informations Partenaire ──`);
        console.log(`   Type organisme  : ${user.partenaireInfo.typeOrganisme || 'N/A'}`);
        console.log(`   Nom organisme   : ${user.partenaireInfo.nomOrganisme || 'N/A'}`);
        console.log(`   Adresse         : ${user.partenaireInfo.adresseOrganisme || 'N/A'}`);
        console.log(`   Contact principal: ${user.partenaireInfo.contactPrincipal || 'N/A'}`);
      }

      // Informations personnelles (si disponibles)
      if (user.dateNaissance || user.lieuNaissance || user.nationalite) {
        console.log(`   ── Informations Personnelles ──`);
        if (user.dateNaissance) console.log(`   Date de naissance: ${formatDate(user.dateNaissance)}`);
        if (user.lieuNaissance) console.log(`   Lieu de naissance: ${user.lieuNaissance}`);
        if (user.nationalite) console.log(`   Nationalité      : ${user.nationalite}`);
      }

      // Informations sur le titre de séjour (si disponibles)
      if (user.numeroEtranger || user.numeroTitre || user.typeTitre) {
        console.log(`   ── Titre de Séjour ──`);
        if (user.numeroEtranger) console.log(`   N° Étranger      : ${user.numeroEtranger}`);
        if (user.numeroTitre) console.log(`   N° Titre         : ${user.numeroTitre}`);
        if (user.typeTitre) console.log(`   Type titre       : ${user.typeTitre}`);
        if (user.dateDelivrance) console.log(`   Date délivrance  : ${formatDate(user.dateDelivrance)}`);
        if (user.dateExpiration) console.log(`   Date expiration  : ${formatDate(user.dateExpiration)}`);
      }

      // Adresse (si disponible)
      if (user.adressePostale || user.ville || user.codePostal) {
        console.log(`   ── Adresse ──`);
        if (user.adressePostale) console.log(`   Adresse          : ${user.adressePostale}`);
        if (user.ville) console.log(`   Ville            : ${user.ville}`);
        if (user.codePostal) console.log(`   Code postal      : ${user.codePostal}`);
        if (user.pays) console.log(`   Pays             : ${user.pays}`);
      }

      console.log(`   Créé le         : ${formatDate(user.createdAt)}`);
      console.log(`   Modifié le      : ${formatDate(user.updatedAt)}`);
      console.log('');
    });

    // Résumé des comptes actifs/inactifs
    const activeCount = users.filter(u => u.isActive).length;
    const inactiveCount = users.filter(u => !u.isActive).length;
    const completeProfileCount = users.filter(u => u.profilComplete).length;
    const incompleteProfileCount = users.filter(u => !u.profilComplete).length;
    const verifiedPhoneCount = users.filter(u => u.phoneVerified).length;
    const unverifiedPhoneCount = users.filter(u => !u.phoneVerified).length;
    const withPasswordCount = users.filter(u => {
      const pwd = u.password;
      return pwd && pwd !== '' && pwd !== null && pwd !== undefined && pwd.length > 0;
    }).length;
    const withoutPasswordCount = users.length - withPasswordCount;

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📈 RÉSUMÉ');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`   Comptes actifs          : ${activeCount}`);
    console.log(`   Comptes inactifs        : ${inactiveCount}`);
    console.log(`   Profils complétés       : ${completeProfileCount}`);
    console.log(`   Profils incomplets      : ${incompleteProfileCount}`);
    console.log(`   Téléphones vérifiés     : ${verifiedPhoneCount}`);
    console.log(`   Téléphones non vérifiés : ${unverifiedPhoneCount}`);
    console.log(`   Avec mot de passe       : ${withPasswordCount}`);
    console.log(`   Sans mot de passe       : ${withoutPasswordCount}`);
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erreur lors de la récupération des utilisateurs:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

listUsers();
