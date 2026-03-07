const express = require('express');
const { body, validationResult } = require('express-validator');

const ForumThread = require('../models/ForumThread');
const ForumPost = require('../models/ForumPost');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Helpers
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// GET /api/forum/threads - Liste des discussions (publique)
router.get('/threads', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const [threads, total] = await Promise.all([
      ForumThread.find({})
        .sort({ isPinned: -1, lastReplyAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('createdBy', 'prenom nom role'),
      ForumThread.countDocuments({}),
    ]);

    res.json({
      success: true,
      data: threads,
      page,
      totalPages: Math.ceil(total / limit),
      total,
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des discussions:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// POST /api/forum/threads - Créer une nouvelle discussion (connecté uniquement)
router.post(
  '/threads',
  protect,
  [
    body('title').isString().isLength({ min: 5, max: 200 }).withMessage('Le titre doit contenir entre 5 et 200 caractères'),
    body('body').isString().isLength({ min: 10 }).withMessage('Le contenu doit contenir au moins 10 caractères'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { title, body: content, tags } = req.body;

      const thread = await ForumThread.create({
        title,
        body: content,
        createdBy: req.user.id,
        tags: Array.isArray(tags) ? tags : [],
        lastReplyAt: new Date(),
        lastReplyBy: req.user.id,
      });

      res.status(201).json({ success: true, data: thread });
    } catch (error) {
      console.error('Erreur lors de la création de la discussion:', error);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// GET /api/forum/threads/:id - Détails d'une discussion + premiers posts (public)
router.get('/threads/:id', async (req, res) => {
  try {
    const threadId = req.params.id;

    const thread = await ForumThread.findByIdAndUpdate(
      threadId,
      { $inc: { viewsCount: 1 } },
      { new: true }
    ).populate('createdBy', 'prenom nom role');

    if (!thread) {
      return res.status(404).json({ success: false, message: 'Discussion introuvable' });
    }

    const posts = await ForumPost.find({ thread: threadId, isDeleted: false })
      .sort({ createdAt: 1 })
      .limit(50)
      .populate('createdBy', 'prenom nom role');

    res.json({
      success: true,
      data: {
        thread,
        posts,
      },
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de la discussion:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// POST /api/forum/threads/:id/posts - Répondre à une discussion
router.post(
  '/threads/:id/posts',
  protect,
  [
    body('body').isString().isLength({ min: 2 }).withMessage('Le contenu doit contenir au moins 2 caractères'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const threadId = req.params.id;
      const { body: content } = req.body;

      const thread = await ForumThread.findById(threadId);
      if (!thread) {
        return res.status(404).json({ success: false, message: 'Discussion introuvable' });
      }

      // Empêcher les réponses si la discussion n'est pas ouverte
      if (thread.status === 'closed' || thread.status === 'archived' || thread.status === 'resolved') {
        return res.status(400).json({
          success: false,
          message: 'Cette discussion n\'accepte plus de nouvelles réponses.',
        });
      }

      const post = await ForumPost.create({
        thread: threadId,
        body: content,
        createdBy: req.user.id,
      });

      thread.repliesCount += 1;
      thread.lastReplyAt = new Date();
      thread.lastReplyBy = req.user.id;
      await thread.save();

      res.status(201).json({ success: true, data: post });
    } catch (error) {
      console.error('Erreur lors de la création de la réponse:', error);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// PATCH /api/forum/threads/:id - Mise à jour par un administrateur (statut, épinglage)
router.patch(
  '/threads/:id',
  protect,
  authorize('admin', 'superadmin'),
  [
    body('status')
      .optional()
      .isIn(['open', 'closed', 'archived', 'resolved'])
      .withMessage("Le statut doit être 'open', 'closed', 'archived' ou 'resolved'"),
    body('isPinned')
      .optional()
      .isBoolean()
      .withMessage("Le champ isPinned doit être un booléen"),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const threadId = req.params.id;
      const updates = {};

      if (typeof req.body.status === 'string') {
        updates.status = req.body.status;
      }
      if (typeof req.body.isPinned === 'boolean') {
        updates.isPinned = req.body.isPinned;
      }

      const thread = await ForumThread.findByIdAndUpdate(
        threadId,
        { $set: updates },
        { new: true }
      );

      if (!thread) {
        return res.status(404).json({ success: false, message: 'Discussion introuvable' });
      }

      res.json({ success: true, data: thread });
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la discussion (admin):', error);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// DELETE /api/forum/posts/:id - Suppression douce d'une réponse par un administrateur
router.delete(
  '/posts/:id',
  protect,
  authorize('admin', 'superadmin'),
  async (req, res) => {
    try {
      const postId = req.params.id;

      const post = await ForumPost.findById(postId);
      if (!post) {
        return res.status(404).json({ success: false, message: 'Réponse introuvable' });
      }

      if (post.isDeleted) {
        return res.json({ success: true, message: 'Réponse déjà supprimée' });
      }

      post.isDeleted = true;
      post.deletedAt = new Date();
      post.deletedBy = req.user._id;
      await post.save();

      // Décrémenter le compteur de réponses du thread associé
      await ForumThread.findByIdAndUpdate(post.thread, {
        $inc: { repliesCount: -1 },
      });

      res.json({ success: true, message: 'Réponse supprimée' });
    } catch (error) {
      console.error('Erreur lors de la suppression de la réponse (admin):', error);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

module.exports = router;

