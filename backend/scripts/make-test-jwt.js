/** Genere un JWT admin pour tests API locaux. Usage: node scripts/make-test-jwt.js */
require('dotenv').config();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findOne({ email: 'wadepaw@gmail.com' }).select('_id role email').lean();
  if (!user) {
    console.error('User not found');
    process.exit(1);
  }
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '90d',
  });
  console.log(token);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
