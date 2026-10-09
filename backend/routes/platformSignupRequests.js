const express = require('express');
const { protect } = require('../middleware/auth');
const { requirePlatformAdmin } = require('../middleware/platformAdmin');
const { getCabinetSignupRequestModel, STATUS_VALUES } = require('../models/CabinetSignupRequest');
const { toSignupRequestDto } = require('../lib/platform/cabinetSignupLabels');
const { logPlatformAudit, auditActor } = require('../lib/platform/platformAudit');

const router = express.Router();

router.use(protect);
router.use(requirePlatformAdmin);

router.get('/', async (req, res) => {
  try {
    const CabinetSignupRequest = getCabinetSignupRequestModel();
    const status = String(req.query.status || '').trim();
    const filter = status && STATUS_VALUES.includes(status) ? { status } : {};
    const items = await CabinetSignupRequest.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(req.query.limit) || 100, 200))
      .lean();
    res.json({
      success: true,
      requests: items.map(toSignupRequestDto),
    });
  } catch (err) {
    console.error('platform GET signup-requests:', err);
    res.status(500).json({ success: false, message: err.message || 'Erreur serveur' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const CabinetSignupRequest = getCabinetSignupRequestModel();
    const doc = await CabinetSignupRequest.findById(req.params.id).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Demande introuvable' });
    }
    res.json({ success: true, request: toSignupRequestDto(doc) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Erreur serveur' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const CabinetSignupRequest = getCabinetSignupRequestModel();
    const doc = await CabinetSignupRequest.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Demande introuvable' });
    }

    const body = req.body || {};
    const actor = auditActor(req);

    if (body.status && STATUS_VALUES.includes(body.status)) {
      doc.status = body.status;
      doc.reviewedBy = actor.email;
      doc.reviewedAt = new Date();
    }
    if (body.rejectReason !== undefined) {
      doc.rejectReason = String(body.rejectReason || '').trim();
    }
    if (body.internalNotes !== undefined) {
      doc.internalNotes = String(body.internalNotes || '').trim();
    }
    if (body.organizationSlug !== undefined) {
      doc.organizationSlug = String(body.organizationSlug || '').trim().toLowerCase();
    }

    await doc.save();

    await logPlatformAudit({
      action: 'signup_request_update',
      orgSlug: doc.organizationSlug || doc.desiredSlug || '',
      actorEmail: actor.email,
      actorId: actor.id,
      details: { requestId: String(doc._id), status: doc.status },
    });

    res.json({ success: true, request: toSignupRequestDto(doc.toObject()) });
  } catch (err) {
    console.error('platform PATCH signup-requests:', err);
    res.status(400).json({ success: false, message: err.message || 'Mise à jour impossible' });
  }
});

module.exports = router;
