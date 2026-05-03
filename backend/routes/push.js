const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { handleImpersonation, getEffectiveUserId, forbidImpersonationWrite } = require('../middleware/impersonation');
const User = require('../models/User');
const { ensureConfigured, sendPushToUser } = require('../utils/pushService');

const router = express.Router();

router.get('/public-key', (req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  if (!publicKey) {
    return res.status(503).json({
      success: false,
      message: 'Web Push non configuré sur le serveur.',
    });
  }
  return res.json({ success: true, publicKey });
});

router.use(protect);
router.use(handleImpersonation);

// Diagnostic de configuration Web Push (admin uniquement)
router.get('/health', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const hasPublicKey = Boolean(process.env.VAPID_PUBLIC_KEY);
    const hasPrivateKey = Boolean(process.env.VAPID_PRIVATE_KEY);
    const configured = ensureConfigured();

    const currentUser = await User.findById(getEffectiveUserId(req)).select('pushSubscriptions pushPreferences');
    const subscriptionsCount = Array.isArray(currentUser?.pushSubscriptions)
      ? currentUser.pushSubscriptions.length
      : 0;

    return res.json({
      success: true,
      configured,
      hasPublicKey,
      hasPrivateKey,
      vapidSubject: process.env.VAPID_SUBJECT || null,
      pushEnabledByDefault: currentUser?.pushPreferences?.enabled !== false,
      currentUserSubscriptions: subscriptionsCount,
    });
  } catch (error) {
    console.error('Erreur diagnostic Web Push:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur.',
    });
  }
});

router.post('/subscribe', async (req, res) => {
  try {
    if (forbidImpersonationWrite(req, res)) return;
    if (!ensureConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Web Push non configuré sur le serveur.',
      });
    }

    const { subscription } = req.body || {};
    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const auth = subscription?.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({
        success: false,
        message: 'Abonnement push invalide.',
      });
    }

    const userId = getEffectiveUserId(req);
    const existing = await User.findOne({
      _id: userId,
      'pushSubscriptions.endpoint': endpoint,
    }).select('_id');

    if (existing) {
      await User.updateOne(
        { _id: userId, 'pushSubscriptions.endpoint': endpoint },
        {
          $set: {
            'pushPreferences.enabled': true,
            'pushSubscriptions.$.keys.p256dh': p256dh,
            'pushSubscriptions.$.keys.auth': auth,
            'pushSubscriptions.$.userAgent': String(req.headers['user-agent'] || ''),
            'pushSubscriptions.$.lastSeenAt': new Date(),
          },
        }
      );
    } else {
      await User.updateOne(
        { _id: userId },
        {
          $push: {
            pushSubscriptions: {
              endpoint,
              keys: { p256dh, auth },
              userAgent: String(req.headers['user-agent'] || ''),
              createdAt: new Date(),
              lastSeenAt: new Date(),
            },
          },
          $set: {
            'pushPreferences.enabled': true,
          },
        }
      );
    }

    return res.json({
      success: true,
      message: 'Abonnement push enregistré.',
    });
  } catch (error) {
    console.error('Erreur abonnement Web Push:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur.',
    });
  }
});

router.post('/unsubscribe', async (req, res) => {
  try {
    if (forbidImpersonationWrite(req, res)) return;
    const endpoint = String(req.body?.endpoint || '').trim();
    if (!endpoint) {
      return res.status(400).json({
        success: false,
        message: 'Endpoint manquant.',
      });
    }

    await User.updateOne(
      { _id: getEffectiveUserId(req) },
      { $pull: { pushSubscriptions: { endpoint } } }
    );

    return res.json({ success: true, message: 'Abonnement supprimé.' });
  } catch (error) {
    console.error('Erreur désabonnement Web Push:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur.',
    });
  }
});

router.post('/test', async (req, res) => {
  try {
    if (forbidImpersonationWrite(req, res)) return;
    const payload = {
      title: 'Notification test',
      body: 'Web Push Ada Papers est bien activé.',
      url: '/client/notifications',
      icon: '/ada-papers-logo.png',
      badge: '/ada-papers-logo.png',
      tag: `push-test-${Date.now()}`,
    };
    const result = await sendPushToUser(getEffectiveUserId(req), payload);
    return res.json({ success: true, result });
  } catch (error) {
    console.error('Erreur envoi test Web Push:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur.',
    });
  }
});

module.exports = router;

