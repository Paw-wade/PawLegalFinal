const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const Task = require('../models/Task');
const Dossier = require('../models/Dossier');
const RendezVous = require('../models/RendezVous');
const MessageInterne = require('../models/MessageInterne');

const ADMIN_ROLES = ['admin', 'superadmin'];

async function buildCabinetContext(userId) {
  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);
  const tomorrow = new Date(startOfDay); tomorrow.setDate(tomorrow.getDate() + 1);
  const endOfTomorrow = new Date(tomorrow); endOfTomorrow.setHours(23, 59, 59, 999);
  const sevenDaysAgo = new Date(now - 7 * 86400000);
  const twoDaysAgo = new Date(now - 2 * 86400000);

  const [tasks, dossiers, rdvAujourdhui, rdvDemain, rdvEnAttente, messagesNonLus] = await Promise.all([
    Task.find({ archived: { $ne: true } })
      .populate('assignedTo', 'firstName lastName')
      .populate('dossier', 'clientNom clientPrenom numero titre')
      .select('titre priorite statut dateEcheance updatedAt assignedTo dossier')
      .lean(),
    Dossier.find({})
      .select('clientNom clientPrenom titre statut updatedAt numero dateEcheance')
      .lean(),
    RendezVous.find({ date: { $gte: startOfDay, $lte: endOfDay } })
      .populate('user', 'firstName lastName')
      .select('date type statut user clientNom')
      .sort({ date: 1 })
      .lean(),
    RendezVous.find({ date: { $gte: tomorrow, $lte: endOfTomorrow } })
      .populate('user', 'firstName lastName')
      .select('date type statut user clientNom')
      .sort({ date: 1 })
      .lean(),
    RendezVous.find({ statut: 'en_attente' })
      .populate('user', 'firstName lastName')
      .select('date type statut user clientNom')
      .sort({ date: 1 })
      .limit(10)
      .lean(),
    MessageInterne.countDocuments({
      $or: [{ destinataires: userId }, { copie: userId }],
      lu: { $not: { $elemMatch: { user: userId } } },
      archive: { $not: { $elemMatch: { user: userId } } },
    }),
  ]);

  const isActive = (t) => t.statut !== 'termine' && t.statut !== 'annule';

  const tachesUrgentes = tasks
    .filter((t) => t.priorite === 'urgente' && isActive(t));

  const tachesEnRetard = tasks
    .filter((t) => isActive(t) && t.dateEcheance && new Date(t.dateEcheance) < startOfDay)
    .sort((a, b) => new Date(a.dateEcheance) - new Date(b.dateEcheance));

  const tachesAujourdhui = tasks
    .filter((t) => isActive(t) && t.dateEcheance &&
      new Date(t.dateEcheance) >= startOfDay && new Date(t.dateEcheance) <= endOfDay);

  const tachesEnCoursSansMaj = tasks
    .filter((t) => t.statut === 'en_cours' && t.updatedAt && new Date(t.updatedAt) < twoDaysAgo)
    .sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));

  const tachesTermineesAujourdhui = tasks
    .filter((t) => t.statut === 'termine' && t.updatedAt && new Date(t.updatedAt) >= startOfDay);

  const dossiersActifs = dossiers.filter((d) => d.statut !== 'archive' && d.statut !== 'ferme');
  const dossiersInactifs = dossiersActifs
    .filter((d) => d.updatedAt && new Date(d.updatedAt) < sevenDaysAgo)
    .sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));

  return {
    stats: {
      tachesEnRetard: tachesEnRetard.length,
      tachesAujourdhui: tachesAujourdhui.length,
      tachesUrgentes: tachesUrgentes.length,
      tachesEnCours: tasks.filter((t) => t.statut === 'en_cours').length,
      dossiersActifs: dossiersActifs.length,
      dossiersInactifs: dossiersInactifs.length,
      rdvAujourdhui: rdvAujourdhui.length,
      rdvEnAttente: rdvEnAttente.length,
      messagesNonLus,
    },
    data: {
      tachesUrgentes,
      tachesEnRetard: tachesEnRetard.slice(0, 20),
      tachesAujourdhui,
      tachesEnCoursSansMaj: tachesEnCoursSansMaj.slice(0, 15),
      tachesTermineesAujourdhui: tachesTermineesAujourdhui.slice(0, 10),
      rdvAujourdhui,
      rdvDemain,
      rdvEnAttente,
      dossiersInactifs: dossiersInactifs.slice(0, 20),
      dossiersActifsCount: dossiersActifs.length,
      messagesNonLus,
    },
  };
}

router.get('/context', protect, authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { stats, data } = await buildCabinetContext(userId);
    res.json({ success: true, stats, data });
  } catch (err) {
    console.error('[assistant] context error:', err.message);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

module.exports = router;
