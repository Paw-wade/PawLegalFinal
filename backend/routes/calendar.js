const express = require('express');
const mongoose = require('mongoose');
const { protect, authorize } = require('../middleware/auth');
const { userHasPermission, getAssignedDossierIds } = require('../utils/accessScope');
const RendezVous = require('../models/RendezVous');
const Dossier = require('../models/Dossier');
const Task = require('../models/Task');
const User = require('../models/User');

const router = express.Router();
router.use(protect);

// Couleur selon nombre de jours restants
function urgencyColor(daysLeft) {
  if (daysLeft <= 3) return 'red';
  if (daysLeft <= 7) return 'orange';
  if (daysLeft <= 30) return 'amber';
  return 'green';
}

function daysUntil(date) {
  return Math.ceil((new Date(date) - new Date()) / (1000 * 60 * 60 * 24));
}

// @route   GET /api/calendar/events?start=&end=
// @desc    Agrege RDV + echeances dossiers + expirations titres + taches
// @access  Private (staff + partenaire)
router.get('/events', async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ success: false, message: 'start et end requis (ISO 8601)' });
    }

    const startDate = new Date(start);
    const endDate = new Date(end);
    if (isNaN(startDate) || isNaN(endDate)) {
      return res.status(400).json({ success: false, message: 'Dates invalides' });
    }

    const userId = req.user.id;
    const role = req.user.role;
    const isPartenaire = role === 'partenaire';
    const isSuperAdmin = role === 'superadmin';

    // Filtre dossier selon le role
    let dossierFilter = {};
    let allowedDossierIds = null;

    if (isPartenaire) {
      const uid = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
      const transmitted = await Dossier.find({ 'transmittedTo.partenaire': uid }).select('_id').lean();
      allowedDossierIds = transmitted.map((d) => d._id);
      if (allowedDossierIds.length === 0) {
        return res.json({ success: true, events: [] });
      }
      dossierFilter = { _id: { $in: allowedDossierIds } };
    } else if (!isSuperAdmin) {
      const canViewAll = await userHasPermission(req.user, 'dossiers', 'consulter');
      if (!canViewAll) {
        const assignedIds = await getAssignedDossierIds(userId);
        allowedDossierIds = assignedIds;
        dossierFilter = { _id: { $in: assignedIds } };
      }
    }

    const events = [];

    // ── 1. Rendez-vous ────────────────────────────────────────────────────────
    if (!isPartenaire) {
      const rdvQuery = { date: { $gte: startDate, $lte: endDate } };
      const rdvs = await RendezVous.find(rdvQuery)
        .populate('user', 'firstName lastName')
        .lean();

      for (const rdv of rdvs) {
        events.push({
          id: `rdv_${rdv._id}`,
          type: 'rdv',
          date: rdv.date,
          heure: rdv.heure || null,
          titre: `RDV - ${rdv.prenom || ''} ${rdv.nom || ''}`.trim(),
          details: String(rdv.motif || '').slice(0, 80),
          couleur: 'blue',
          lien: `/admin/appointments`,
          statut: rdv.statut,
          urgence: false,
        });
      }
    }

    // ── 2. Echeances dossiers ─────────────────────────────────────────────────
    const dossierEcheanceFilter = {
      ...dossierFilter,
      dateEcheance: { $gte: startDate, $lte: endDate },
    };
    const dossiersEch = await Dossier.find(dossierEcheanceFilter)
      .select('titre numero dateEcheance statut priorite')
      .lean();

    for (const d of dossiersEch) {
      const dl = daysUntil(d.dateEcheance);
      events.push({
        id: `ech_${d._id}`,
        type: 'echeance_dossier',
        date: d.dateEcheance,
        heure: null,
        titre: `Echeance - ${d.titre || d.numero || 'Dossier'}`,
        details: d.statut || '',
        couleur: urgencyColor(dl),
        lien: `/admin/dossiers/${d._id}`,
        statut: d.statut,
        urgence: dl <= 3,
      });
    }

    // ── 3. Expirations titres de sejour (clients des dossiers) ────────────────
    if (!isPartenaire) {
      const titreFilter = { dateExpiration: { $gte: startDate, $lte: endDate }, role: 'client' };
      const clients = await User.find(titreFilter)
        .select('firstName lastName dateExpiration typeTitre _id')
        .lean();

      for (const u of clients) {
        const dl = daysUntil(u.dateExpiration);
        events.push({
          id: `titre_${u._id}`,
          type: 'expiration_titre',
          date: u.dateExpiration,
          heure: null,
          titre: `Titre expirant - ${u.firstName || ''} ${u.lastName || ''}`.trim(),
          details: u.typeTitre || 'Titre de sejour',
          couleur: urgencyColor(dl),
          lien: `/admin/utilisateurs/${u._id}`,
          statut: null,
          urgence: dl <= 7,
        });
      }
    } else {
      // Partenaire : expirations des clients des dossiers transmis
      const dossiersWithUser = await Dossier.find(dossierFilter).select('user').lean();
      const clientIds = dossiersWithUser.map((d) => d.user).filter(Boolean);
      if (clientIds.length > 0) {
        const clients = await User.find({
          _id: { $in: clientIds },
          dateExpiration: { $gte: startDate, $lte: endDate },
        }).select('firstName lastName dateExpiration typeTitre _id').lean();

        for (const u of clients) {
          const dl = daysUntil(u.dateExpiration);
          events.push({
            id: `titre_${u._id}`,
            type: 'expiration_titre',
            date: u.dateExpiration,
            heure: null,
            titre: `Titre expirant - ${u.firstName || ''} ${u.lastName || ''}`.trim(),
            details: u.typeTitre || 'Titre de sejour',
            couleur: urgencyColor(dl),
            lien: null,
            statut: null,
            urgence: dl <= 7,
          });
        }
      }
    }

    // ── 4. Taches ─────────────────────────────────────────────────────────────
    const taskBaseFilter = { archived: { $ne: true } };
    if (allowedDossierIds !== null) {
      taskBaseFilter.$or = [
        { assignedTo: userId },
        { dossier: { $in: allowedDossierIds } },
      ];
    }

    const tasksEch = await Task.find({
      ...taskBaseFilter,
      dateEcheance: { $gte: startDate, $lte: endDate },
    }).populate('dossier', 'titre numero _id').lean();

    for (const t of tasksEch) {
      const dl = daysUntil(t.dateEcheance);
      const pColor = t.priorite === 'urgente' ? 'red' : t.priorite === 'haute' ? 'orange' : 'purple';
      events.push({
        id: `tache_${t._id}`,
        type: 'tache',
        date: t.dateEcheance,
        heure: null,
        titre: t.titre || 'Tache',
        details: t.dossier ? `${t.dossier.titre || t.dossier.numero || ''}` : (t.description || ''),
        couleur: pColor,
        lien: t.dossier ? `/admin/dossiers/${t.dossier._id}` : '/admin/taches',
        statut: t.statut,
        urgence: dl <= 3,
        priorite: t.priorite,
      });
    }

    // Dossiers crees dans la periode (optionnel - informationnel)
    const dossiersCreesFilter = {
      ...dossierFilter,
      createdAt: { $gte: startDate, $lte: endDate },
    };
    const dossiersNouveaux = await Dossier.find(dossiersCreesFilter)
      .select('titre numero createdAt categorie')
      .limit(50)
      .lean();

    for (const d of dossiersNouveaux) {
      events.push({
        id: `cree_${d._id}`,
        type: 'dossier_cree',
        date: d.createdAt,
        heure: null,
        titre: `Dossier ouvert - ${d.titre || d.numero || 'N/A'}`,
        details: d.categorie || '',
        couleur: 'green',
        lien: `/admin/dossiers/${d._id}`,
        statut: null,
        urgence: false,
      });
    }

    return res.json({ success: true, events });
  } catch (error) {
    console.error('Erreur GET /calendar/events:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

module.exports = router;
