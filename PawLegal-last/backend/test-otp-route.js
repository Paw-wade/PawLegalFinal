// Script de test pour vérifier que la route OTP est bien chargée
const express = require('express');
const app = express();

console.log('🧪 Test du chargement de la route OTP...\n');

try {
  const otpRouter = require('./routes/otp');
  console.log('✅ Route OTP chargée avec succès');
  console.log('📋 Routes disponibles:');
  
  otpRouter.stack.forEach((r) => {
    if (r.route) {
      const methods = Object.keys(r.route.methods).join(', ').toUpperCase();
      console.log(`   ${methods} ${r.route.path}`);
    }
  });
  
  console.log('\n✅ Test réussi : La route OTP est correctement configurée');
  process.exit(0);
} catch (error) {
  console.error('❌ Erreur lors du chargement de la route OTP:');
  console.error('   Message:', error.message);
  console.error('   Stack:', error.stack);
  process.exit(1);
}

