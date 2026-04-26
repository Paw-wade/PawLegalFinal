const Task = require('../models/Task');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { sendNotificationSMS, formatPhoneNumber } = require('../sendSMS');

/**
 * Vérifie les tâches avec échéance et envoie des notifications
 * - 2 jours avant l'échéance
 * - 1 jour avant l'échéance
 * - Le jour même de l'échéance
 */
async function checkTaskDeadlines() {
  try {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    // Calculer les dates pour les notifications
    const inTwoDays = new Date(now);
    inTwoDays.setDate(inTwoDays.getDate() + 2);
    
    const inOneDay = new Date(now);
    inOneDay.setDate(inOneDay.getDate() + 1);
    
    const today = new Date(now);
    
    // Récupérer toutes les tâches avec échéance qui ne sont pas terminées ou annulées
    const tasks = await Task.find({
      dateEcheance: { $exists: true, $ne: null },
      statut: { $nin: ['termine', 'annule'] }
    })
      .populate('assignedTo', 'firstName lastName email role')
      .populate('createdBy', 'firstName lastName email role');

    // Récupérer tous les admins
    const admins = await User.find({
      role: { $in: ['admin', 'superadmin'] },
      isActive: { $ne: false }
    });

    let notificationsSent = 0;

    for (const task of tasks) {
      if (!task.dateEcheance) continue;

      const deadline = new Date(task.dateEcheance);
      deadline.setHours(0, 0, 0, 0);

      const daysUntilDeadline = Math.floor((deadline - now) / (1000 * 60 * 60 * 24));

      // Déterminer le type de notification
      let notificationType = null;
      let message = '';
      let titre = '';

      if (daysUntilDeadline === 2) {
        notificationType = 'deadline_2_days';
        titre = 'Échéance dans 2 jours';
        message = `La tâche "${task.titre}" arrive à échéance dans 2 jours (${deadline.toLocaleDateString('fr-FR')}).`;
      } else if (daysUntilDeadline === 1) {
        notificationType = 'deadline_1_day';
        titre = 'Échéance demain';
        message = `La tâche "${task.titre}" arrive à échéance demain (${deadline.toLocaleDateString('fr-FR')}).`;
      } else if (daysUntilDeadline === 0) {
        notificationType = 'deadline_today';
        titre = 'Échéance aujourd\'hui';
        message = `La tâche "${task.titre}" arrive à échéance aujourd'hui (${deadline.toLocaleDateString('fr-FR')}).`;
      }

      if (!notificationType) continue;

      // Récupérer tous les destinataires (assignés + admins)
      const recipients = new Set();
      
      // Ajouter les personnes assignées
      const assignedToArray = Array.isArray(task.assignedTo) 
        ? task.assignedTo 
        : [task.assignedTo].filter(Boolean);
      
      assignedToArray.forEach(assigned => {
        if (assigned && assigned._id) {
          recipients.add(assigned._id.toString());
        } else if (assigned) {
          recipients.add(assigned.toString());
        }
      });

      // Ajouter tous les admins
      admins.forEach(admin => {
        recipients.add(admin._id.toString());
      });

      // Envoyer les notifications
      for (const recipientId of recipients) {
        try {
          // Vérifier si une notification de ce type a déjà été envoyée aujourd'hui
          const existingNotification = await Notification.findOne({
            user: recipientId,
            type: 'other',
            'metadata.taskId': task._id.toString(),
            'metadata.deadlineNotificationType': notificationType,
            createdAt: {
              $gte: new Date(now),
              $lt: new Date(now.getTime() + 24 * 60 * 60 * 1000)
            }
          });

          if (existingNotification) {
            continue; // Notification déjà envoyée aujourd'hui
          }

          await Notification.create({
            user: recipientId,
            type: 'other',
            titre,
            message,
            lien: '/admin/taches',
            metadata: {
              taskId: task._id.toString(),
              deadlineNotificationType: notificationType,
              deadlineDate: task.dateEcheance,
              daysUntilDeadline
            }
          });

          notificationsSent++;
        } catch (notifError) {
          console.error(`Erreur lors de l'envoi de la notification d'échéance à ${recipientId}:`, notifError);
        }
      }
    }

    console.log(`✅ Vérification des échéances terminée. ${notificationsSent} notification(s) envoyée(s).`);
    return { success: true, notificationsSent };
  } catch (error) {
    console.error('❌ Erreur lors de la vérification des échéances de tâches:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Vérifie les tâches en retard et envoie des notifications à tous les administrateurs
 */
async function checkOverdueTasks() {
  try {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Récupérer toutes les tâches en retard (dateEcheance < aujourd'hui) qui ne sont pas terminées ou annulées
    const overdueTasks = await Task.find({
      dateEcheance: { $exists: true, $ne: null, $lt: now },
      statut: { $nin: ['termine', 'annule'] },
      effectue: { $ne: true }
    })
      .populate('assignedTo', 'firstName lastName email role phone')
      .populate('createdBy', 'firstName lastName email role')
      .populate('dossier', 'titre numero statut');

    if (overdueTasks.length === 0) {
      return { success: true, count: 0, notificationsSent: 0, smsSent: 0 };
    }

    // Récupérer tous les administrateurs
    const admins = await User.find({
      role: { $in: ['admin', 'superadmin'] },
      isActive: { $ne: false }
    });

    let notificationsSent = 0;
    let smsSent = 0;

    // Pour chaque tâche en retard
    for (const task of overdueTasks) {
      const assignedToArray = Array.isArray(task.assignedTo) 
        ? task.assignedTo 
        : [task.assignedTo].filter(Boolean);
      
      // Obtenir le nom de la personne assignée (ou plusieurs)
      const assignedNames = assignedToArray
        .map((assigned) => {
          if (assigned && assigned.firstName && assigned.lastName) {
            return `${assigned.firstName} ${assigned.lastName}`;
          } else if (assigned && assigned.email) {
            return assigned.email;
          }
          return null;
        })
        .filter(Boolean)
        .join(', ') || 'Non assignée';

      const deadlineDate = new Date(task.dateEcheance);
      deadlineDate.setHours(0, 0, 0, 0);
      const daysOverdue = Math.floor((now.getTime() - deadlineDate.getTime()) / (1000 * 60 * 60 * 24));
      const taskTitle = task.titre || 'Sans titre';
      const deadlineDateFormatted = new Date(task.dateEcheance).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });

      // Vérifier si une notification a déjà été envoyée aujourd'hui pour cette tâche
      const todayStart = new Date(now);
      const todayEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      
      const existingNotifications = await Notification.find({
        type: 'other',
        'metadata.taskId': task._id.toString(),
        'metadata.overdueNotification': true,
        createdAt: {
          $gte: todayStart,
          $lt: todayEnd
        }
      });

      // Si des notifications ont déjà été envoyées aujourd'hui, passer cette tâche
      if (existingNotifications.length > 0) {
        continue;
      }

      // Créer des notifications pour tous les administrateurs
      const notifications = admins.map(admin => ({
        user: admin._id,
        type: 'other',
        titre: 'Tâche en retard',
        message: `La tâche "${taskTitle}" assignée à ${assignedNames} est en retard de ${daysOverdue} jour${daysOverdue > 1 ? 's' : ''} (échéance: ${deadlineDateFormatted}).`,
        lien: '/admin/taches',
        metadata: {
          taskId: task._id.toString(),
          assignedTo: assignedToArray.map((a) => (a?._id || a)?.toString()),
          daysOverdue: daysOverdue,
          deadlineDate: task.dateEcheance,
          overdueNotification: true
        }
      }));

      if (notifications.length > 0) {
        try {
          await Notification.insertMany(notifications);
          notificationsSent += notifications.length;
          console.log(`✅ ${notifications.length} notifications créées pour la tâche en retard: ${taskTitle}`);
        } catch (notifError) {
          console.error('❌ Erreur lors de la création des notifications:', notifError);
        }
      }

      // Envoyer des SMS à tous les administrateurs qui ont un numéro de téléphone
      for (const admin of admins) {
        if (admin.phone) {
          try {
            const formattedPhone = formatPhoneNumber(admin.phone);
            if (formattedPhone) {
              await sendNotificationSMS(
                formattedPhone,
                'task_overdue',
                {
                  taskTitle: taskTitle,
                  assignedTo: assignedNames,
                  daysOverdue: daysOverdue.toString(),
                  deadlineDate: deadlineDateFormatted
                },
                {
                  userId: admin._id.toString(),
                  context: 'task',
                  contextId: task._id.toString(),
                  skipPreferences: true
                }
              );
              smsSent++;
              console.log(`✅ SMS envoyé à ${admin.email} (${formattedPhone}) pour la tâche en retard`);
            }
          } catch (smsError) {
            console.error(`⚠️ Erreur lors de l'envoi du SMS à ${admin.email}:`, smsError.message);
          }
        }
      }
    }

    console.log(`✅ Vérification des tâches en retard terminée. ${notificationsSent} notification(s) et ${smsSent} SMS envoyé(s).`);
    return { success: true, count: overdueTasks.length, notificationsSent, smsSent };
  } catch (error) {
    console.error('❌ Erreur lors de la vérification des tâches en retard:', error);
    return { success: false, error: error.message };
  }
}

module.exports = { checkTaskDeadlines, checkOverdueTasks };

