const Task = require('../models/Task');
const Notification = require('../models/Notification');

/**
 * Verifie toutes les minutes les appels planifies dont l'echeance
 * est dans la fenetre [-1 min, +1 min] et qui n'ont pas encore ete notifies.
 * Cree une Notification pour chaque utilisateur concerne (push auto via hook).
 */
async function checkAppelPlanifieNotifications() {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 60_000);
    const windowEnd = new Date(now.getTime() + 60_000);

    const tasks = await Task.find({
      type: 'appel_planifie',
      statut: { $nin: ['termine', 'annule'] },
      appelNotifSent: false,
      dateEcheance: { $gte: windowStart, $lte: windowEnd },
    });

    for (const task of tasks) {
      const recipients = task.assignedTo && task.assignedTo.length > 0
        ? task.assignedTo
        : [task.createdBy];

      const phoneLabel = task.phone ? ` - ${task.phone}` : '';
      const noteLabel = task.description ? ` : ${task.description}` : '';

      for (const userId of recipients) {
        if (!userId) continue;
        try {
          await Notification.create({
            user: userId,
            type: 'appel_planifie',
            titre: task.titre || 'Appel planifie',
            message: `Appel prevu maintenant${phoneLabel}${noteLabel}`,
            lien: '/admin/whatsapp',
            metadata: {
              taskId: String(task._id),
              phone: task.phone || '',
              whatsappConvId: task.whatsappConvId ? String(task.whatsappConvId) : null,
            },
          });
        } catch (err) {
          console.error('Erreur notification appel planifie:', err?.message || err);
        }
      }

      task.appelNotifSent = true;
      await task.save();
    }
  } catch (err) {
    console.error('Erreur checkAppelPlanifieNotifications:', err?.message || err);
  }
}

module.exports = { checkAppelPlanifieNotifications };
