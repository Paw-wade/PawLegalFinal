const webPush = require('web-push');
const User = require('../models/User');

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:contact@adapapers.fr';

  if (!publicKey || !privateKey) {
    return false;
  }

  webPush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

async function pruneSubscriptions(userId, endpointsToRemove) {
  if (!userId || !Array.isArray(endpointsToRemove) || endpointsToRemove.length === 0) return;
  await User.updateOne(
    { _id: userId },
    {
      $pull: {
        pushSubscriptions: {
          endpoint: { $in: endpointsToRemove },
        },
      },
    }
  );
}

async function sendPushToUser(userId, payload) {
  if (!userId) return { sent: 0, removed: 0, skipped: true };
  if (!ensureConfigured()) return { sent: 0, removed: 0, skipped: true };

  const user = await User.findById(userId).select('pushSubscriptions');
  const subscriptions = Array.isArray(user?.pushSubscriptions) ? user.pushSubscriptions : [];
  if (subscriptions.length === 0) return { sent: 0, removed: 0, skipped: true };

  const body = JSON.stringify(payload || {});
  const failedEndpoints = [];
  let sent = 0;

  for (const sub of subscriptions) {
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) continue;
    const webPushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
    };
    try {
      await webPush.sendNotification(webPushSubscription, body);
      sent += 1;
    } catch (error) {
      const statusCode = error?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        failedEndpoints.push(sub.endpoint);
      } else {
        console.error('Erreur envoi web push:', error?.message || error);
      }
    }
  }

  if (failedEndpoints.length > 0) {
    await pruneSubscriptions(userId, failedEndpoints);
  }

  return { sent, removed: failedEndpoints.length, skipped: false };
}

module.exports = {
  ensureConfigured,
  sendPushToUser,
};

