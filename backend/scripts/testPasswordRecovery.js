/**
 * Test end-to-end password recovery (email link flow).
 * Does not leave the account broken: restores Pawlegal25 at the end for wadepaw.
 *
 * Usage: node scripts/testPasswordRecovery.js
 */
require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { sendTransactionalEmailDetailed } = require('../utils/emailNotifications');
const { getPrimaryFrontendUrl } = require('../utils/frontendOrigins');

const API = process.env.TEST_API_URL || 'https://api.adapapers.fr';
const SUPER_EMAIL = 'wadepaw@gmail.com';
const FINAL_PASSWORD = 'Pawlegal25';
const TEMP_PASSWORD = 'TempReset99!';

async function httpPost(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function setPassword(userId, plain) {
  const salt = await bcrypt.genSalt(10);
  const hashed = await bcrypt.hash(plain, salt);
  await User.updateOne(
    { _id: userId },
    {
      $set: { password: hashed, needsPasswordSetup: false },
      $unset: { resetPasswordToken: 1, resetPasswordExpires: 1 },
    }
  );
}

(async () => {
  console.log('API=', API);
  console.log('Primary frontend URL for reset links=', getPrimaryFrontendUrl());
  console.log('BREVO configured=', !!(process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY));

  await mongoose.connect(process.env.MONGODB_URI);

  // --- 1) Production forgot-password endpoint (generic success) ---
  const forgot = await httpPost('/api/auth/forgot-password', { email: SUPER_EMAIL });
  console.log('\n[1] POST /forgot-password', forgot.status, forgot.json);

  // --- 2) Simulate deliverPasswordResetLinkEmail with known token + real Brevo send ---
  const user = await User.findOne({ email: SUPER_EMAIL }).select(
    '+resetPasswordToken +resetPasswordExpires firstName lastName email'
  );
  if (!user) {
    console.error('Superadmin not found');
    process.exit(1);
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenHashed = crypto.createHash('sha256').update(resetToken).digest('hex');
  user.resetPasswordToken = resetTokenHashed;
  user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
  await user.save();

  const resetUrl = `${getPrimaryFrontendUrl()}/auth/reset-password?token=${resetToken}`;
  console.log('\n[2] Reset URL (token known for test):', resetUrl);

  const emailResult = await sendTransactionalEmailDetailed({
    to: user.email,
    toName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    subject: '[TEST] Réinitialisation de votre mot de passe',
    htmlContent: `<p>Bonjour ${user.firstName || ''},</p><p>Test de récupération. Lien :</p><p><a href="${resetUrl}">Réinitialiser</a></p><p>${resetUrl}</p>`,
    textContent: `Test reset: ${resetUrl}`,
  });
  console.log('[2] Email send result:', emailResult);

  // --- 3) Reset via production API ---
  const reset = await httpPost('/api/auth/reset-password', {
    token: resetToken,
    password: TEMP_PASSWORD,
  });
  console.log('\n[3] POST /reset-password', reset.status, reset.json);

  // --- 4) Login with temp password ---
  const loginTemp = await httpPost('/api/auth/login', {
    email: SUPER_EMAIL,
    password: TEMP_PASSWORD,
  });
  console.log(
    '\n[4] Login with temp password:',
    loginTemp.status,
    loginTemp.json.success,
    loginTemp.json.message
  );

  // --- 5) Second user sample (any other user with email) for forgot-password ---
  const other = await User.findOne({
    email: { $exists: true, $ne: null, $ne: SUPER_EMAIL },
    isActive: true,
  })
    .select('email role firstName lastName')
    .lean();
  if (other?.email) {
    const forgotOther = await httpPost('/api/auth/forgot-password', { email: other.email });
    console.log(
      '\n[5] forgot-password for another account',
      other.email,
      other.role,
      '→',
      forgotOther.status,
      forgotOther.json.message
    );
  } else {
    console.log('\n[5] No other user with email to sample');
  }

  // Unknown email should still return success (no enumeration)
  const forgotUnknown = await httpPost('/api/auth/forgot-password', {
    email: 'nobody-does-not-exist-xyz@example.com',
  });
  console.log('\n[6] forgot-password unknown email →', forgotUnknown.status, forgotUnknown.json.message);

  // --- Restore superadmin password ---
  await setPassword(user._id, FINAL_PASSWORD);
  const loginFinal = await httpPost('/api/auth/login', {
    email: SUPER_EMAIL,
    password: FINAL_PASSWORD,
  });
  console.log(
    '\n[7] Restored & login Pawlegal25:',
    loginFinal.status,
    loginFinal.json.success,
    loginFinal.json.message
  );

  const summary = {
    forgotEndpointOk: forgot.status === 200 && forgot.json.success === true,
    emailSent: emailResult.ok === true,
    emailProvider: emailResult.provider || null,
    emailError: emailResult.error || null,
    resetOk: reset.status === 200 && reset.json.success === true,
    loginAfterResetOk: loginTemp.status === 200 && loginTemp.json.success === true,
    loginFinalOk: loginFinal.status === 200 && loginFinal.json.success === true,
    resetLinkBase: getPrimaryFrontendUrl(),
  };
  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));

  await mongoose.disconnect();
  if (!summary.resetOk || !summary.loginAfterResetOk || !summary.loginFinalOk) {
    process.exit(1);
  }
  if (!summary.emailSent) {
    console.error('\n⚠️ Reset API works, but email delivery FAILED — users will not receive the link.');
    process.exit(2);
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
