const express = require('express');
const mongoose = require('mongoose');
const { protect, authorize } = require('../middleware/auth');
const { userHasPermission, getAssignedDossierIds } = require('../utils/accessScope');
const RendezVous = require('../models/RendezVous');
const Dossier = require('../models/Dossier');
const Task = require('../models/Task');
const User = require('../models/User');
const CalendarEvent = require('../models/CalendarEvent');

const router = express.Router();
router.use(protect);

const STAFF_ROLES = ['admin', 'superadmin', 'assistant', 'secretaire', 'juriste', 'comptable'];
const VALID_COULEURS = ['blue', 'green', 'purple', 'orange', 'red', 'amber', 'indigo', 'pink'];
const VALID_VISIBILITES = ['prive', 'equipe', 'tous'];

function urgencyColor(daysLeft) {
  if (daysLeft <= 3) return 'red';
  if (daysLeft <= 7) return 'orange';
  if (daysLeft <= 30) return 'amber';
  return 'green';
}

function daysUntil(date) {
  return Math.ceil((new Date(date) - new Date()) / (1000 * 60 * 60 * 24));
}

// @route   GET /api/calendar/members
// @desc    Liste du personnel pour la selection de participants
// @access  Private staff
router.get('/members', async (req, res) => {
  try {
    const members = await User.find({
      role: { $in: STAFF_ROLES },
      isActive: { $ne: false },
    }).select('firstName lastName email role').lean();
    return res.json({ success: true, members });
  } catch (error) {
    console.error('Erreur GET /calendar/members:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// @route   GET /api/calendar/events?start=&end=
// @desc    Agrege RDV + echeances dossiers + expirations titres + taches + evenements personnalises
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
    const uid = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null;

    let dossierFilter = {};
    let allowedDossierIds = null;

    if (isPartenaire) {
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
      const rdvs = await RendezVous.find({ date: { $gte: startDate, $lte: endDate } })
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
          lien: '/admin/appointments',
          statut: rdv.statut,
          urgence: false,
        });
      }
    }

    // ── 2. Echeances dossiers ─────────────────────────────────────────────────
    const dossiersEch = await Dossier.find({
      ...dossierFilter,
      dateEcheance: { $gte: startDate, $lte: endDate },
    }).select('titre numero dateEcheance statut priorite').lean();

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

    // ── 3. Expirations titres de sejour ───────────────────────────────────────
    if (!isPartenaire) {
      const clients = await User.find({
        dateExpiration: { $gte: startDate, $lte: endDate },
        role: 'client',
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
          lien: `/admin/utilisateurs/${u._id}`,
          statut: null,
          urgence: dl <= 7,
        });
      }
    } else {
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

    // ── 5. Dossiers crees ─────────────────────────────────────────────────────
    const dossiersNouveaux = await Dossier.find({
      ...dossierFilter,
      createdAt: { $gte: startDate, $lte: endDate },
    }).select('titre numero createdAt categorie').limit(50).lean();

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

    // ── 6. Evenements personnalises ───────────────────────────────────────────
    if (!isPartenaire && uid) {
      const customFilter = {
        date: { $gte: startDate, $lte: endDate },
        $or: [
          { visibilite: { $in: ['equipe', 'tous'] } },
          { createdBy: uid },
          { participants: uid },
        ],
      };

      const customEvents = await CalendarEvent.find(customFilter)
        .populate('createdBy', 'firstName lastName')
        .populate('participants', 'firstName lastName')
        .lean();

      for (const ev of customEvents) {
        const creatorName = ev.createdBy
          ? `${ev.createdBy.firstName || ''} ${ev.createdBy.lastName || ''}`.trim()
          : '';
        const participantNames = (ev.participants || []).map((p) =>
          `${p.firstName || ''} ${p.lastName || ''}`.trim()
        );
        const isCreator = ev.createdBy && ev.createdBy._id.toString() === userId;
        const isAdmin = ['admin', 'superadmin'].includes(role);

        events.push({
          id: `custom_${ev._id}`,
          type: ev.type,
          date: ev.date,
          heure: ev.heureDebut || null,
          heureFin: ev.heureFin || null,
          titre: ev.titre,
          details: ev.type === 'email_programme'
            ? `A: ${ev.emailTo}${ev.emailEnvoye ? ' (envoye)' : ''}`
            : ev.description || '',
          couleur: ev.couleur,
          lien: ev.dossierId ? `/admin/dossiers/${ev.dossierId}` : null,
          statut: ev.type === 'email_programme' ? (ev.emailEnvoye ? 'Envoye' : 'En attente') : null,
          urgence: false,
          customId: ev._id.toString(),
          deletable: isCreator || isAdmin,
          visibilite: ev.visibilite,
          participants: participantNames,
          createdByName: creatorName,
          emailTo: ev.type === 'email_programme' ? ev.emailTo : undefined,
          emailEnvoye: ev.type === 'email_programme' ? ev.emailEnvoye : undefined,
        });
      }
    }

    return res.json({ success: true, events });
  } catch (error) {
    console.error('Erreur GET /calendar/events:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// @route   POST /api/calendar/custom-events
// @desc    Creer un evenement ou email programme
// @access  Private staff
router.post('/custom-events', async (req, res) => {
  try {
    const {
      type, titre, description, date, heureDebut, heureFin,
      couleur, visibilite, participants, rappelVeille, dossierId,
      emailTo, emailSujet, emailCorps,
    } = req.body;

    if (!type || !['evenement', 'email_programme'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Type invalide' });
    }
    if (!titre || !String(titre).trim()) {
      return res.status(400).json({ success: false, message: 'Le titre est requis' });
    }
    if (!date) {
      return res.status(400).json({ success: false, message: 'La date est requise' });
    }
    if (type === 'email_programme') {
      if (!emailTo || !String(emailTo).trim()) {
        return res.status(400).json({ success: false, message: 'Le destinataire est requis' });
      }
      if (!emailSujet || !String(emailSujet).trim()) {
        return res.status(400).json({ success: false, message: "L'objet est requis" });
      }
      if (!emailCorps || !String(emailCorps).trim()) {
        return res.status(400).json({ success: false, message: 'Le corps du message est requis' });
      }
    }

    const ev = await CalendarEvent.create({
      type,
      titre: String(titre).trim(),
      description: String(description || '').trim(),
      date: new Date(date),
      heureDebut: String(heureDebut || '').trim(),
      heureFin: String(heureFin || '').trim(),
      couleur: VALID_COULEURS.includes(couleur) ? couleur : 'blue',
      visibilite: VALID_VISIBILITES.includes(visibilite) ? visibilite : 'equipe',
      createdBy: req.user.id,
      participants: Array.isArray(participants)
        ? participants.filter((id) => mongoose.Types.ObjectId.isValid(id))
        : [],
      rappelVeille: rappelVeille !== false,
      dossierId: dossierId && mongoose.Types.ObjectId.isValid(dossierId) ? dossierId : null,
      emailTo: type === 'email_programme' ? String(emailTo || '').trim() : '',
      emailSujet: type === 'email_programme' ? String(emailSujet || '').trim() : '',
      emailCorps: type === 'email_programme' ? String(emailCorps || '').trim() : '',
    });

    return res.status(201).json({
      success: true,
      event: { id: ev._id, titre: ev.titre, type: ev.type },
    });
  } catch (error) {
    console.error('Erreur POST /calendar/custom-events:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// @route   DELETE /api/calendar/custom-events/:id
// @desc    Supprimer un evenement personnalise (createur ou admin)
// @access  Private staff
router.delete('/custom-events/:id', async (req, res) => {
  try {
    const ev = await CalendarEvent.findById(req.params.id);
    if (!ev) return res.status(404).json({ success: false, message: 'Evenement introuvable' });

    const isCreator = ev.createdBy.toString() === req.user.id;
    const isAdmin = ['admin', 'superadmin'].includes(req.user.role);
    if (!isCreator && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Vous ne pouvez pas supprimer cet evenement' });
    }

    await CalendarEvent.deleteOne({ _id: ev._id });
    return res.json({ success: true });
  } catch (error) {
    console.error('Erreur DELETE /calendar/custom-events/:id:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

module.exports = router;
