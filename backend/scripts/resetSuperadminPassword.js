/**
 * One-off: set wadepaw@gmail.com password to Pawlegal25 (hashed via updateOne).
 * Usage: node scripts/resetSuperadminPassword.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const EMAIL = process.env.RESET_EMAIL || 'wadepaw@gmail.com';
const PLAIN = process.env.RESET_PASSWORD || 'Pawlegal25';

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findOne({ email: EMAIL }).select(
    '+password isActive role firstName lastName needsPasswordSetup'
  );
  if (!user) {
    console.error('USER_NOT_FOUND', EMAIL);
    process.exit(1);
  }
  console.log('Found:', {
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    name: `${user.firstName} ${user.lastName}`,
  });

  const salt = await bcrypt.genSalt(10);
  const hashed = await bcrypt.hash(PLAIN, salt);
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        password: hashed,
        needsPasswordSetup: false,
      },
      $unset: {
        resetPasswordToken: 1,
        resetPasswordExpires: 1,
      },
    }
  );

  const check = await User.findById(user._id).select('+password');
  const ok = await check.comparePassword(PLAIN);
  console.log('PASSWORD_SET_OK=', ok);
  if (!ok) process.exit(1);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
