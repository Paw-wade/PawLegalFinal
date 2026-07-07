/**
 * Rattache les utilisateurs staff au cabinet par défaut et renseigne cabinetId sur les documents existants.
 * Usage: node scripts/assign-default-cabinet.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const { ensureDefaultCabinet } = require('../utils/cabinetResolver');

const STAFF_ROLES = ['admin', 'superadmin', 'assistant', 'comptable', 'secretaire', 'juriste', 'stagiaire'];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const Cabinet = require('../models/Cabinet');
  const User = require('../models/User');
  const Document = require('../models/Document');

  const cabinet = await ensureDefaultCabinet();
  console.log('Cabinet:', cabinet.name, cabinet.slug, cabinet.s3Prefix);

  const userRes = await User.updateMany(
    { role: { $in: STAFF_ROLES }, $or: [{ cabinetId: null }, { cabinetId: { $exists: false } }] },
    { $set: { cabinetId: cabinet._id } }
  );
  console.log('Users staff mis à jour:', userRes.modifiedCount);

  const docRes = await Document.updateMany(
    { $or: [{ cabinetId: null }, { cabinetId: { $exists: false } }] },
    { $set: { cabinetId: cabinet._id } }
  );
  console.log('Documents mis à jour:', docRes.modifiedCount);

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
