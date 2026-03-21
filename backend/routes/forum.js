const express = require('express');
const { body, validationResult } = require('express-validator');

const ForumThread = require('../models/ForumThread');
const ForumPost = require('../models/ForumPost');
const User = require('../models/User');
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

// Thèmes autorisés pour le filtre
const THEMES = ['titre-sejour-etudiant', 'titre-sejour-salarie', 'regroupement-familial', 'demande-visa', 'autres'];

// Filtres statut autorisés
const STATUS_FILTERS = ['pinned', 'resolved', 'archived'];

// GET /api/forum/threads - Liste des discussions (publique)
// Options :
// - ?theme=xxx
// - ?statusFilter=pinned|resolved|archived
// - ?q=mot-clé (recherche dans titre, corps et réponses)
router.get('/threads', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;
    const themeParam = typeof req.query.theme === 'string' ? req.query.theme.trim() : null;
    const theme = themeParam && THEMES.includes(themeParam) ? themeParam : null;
    const statusParam = typeof req.query.statusFilter === 'string' ? req.query.statusFilter.trim() : null;
    const statusFilter = statusParam && STATUS_FILTERS.includes(statusParam) ? statusParam : null;
    const qRaw = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const hasSearch = qRaw.length >= 2;

    // Filtre thème : "autres" inclut aussi les documents sans thème (anciennes discussions)
    let filter = theme === null
      ? {}
      : theme === 'autres'
        ? { $or: [ { theme: 'autres' }, { theme: null }, { theme: { $exists: false } } ] }
        : { theme };

    // Filtre statut : épinglées, résolues, archivées
    if (statusFilter === 'pinned') {
      filter = { ...filter, isPinned: true };
    } else if (statusFilter === 'resolved') {
      filter = { ...filter, status: 'resolved' };
    } else if (statusFilter === 'archived') {
      filter = { ...filter, status: 'archived' };
    }

    // Recherche plein texte simple sur les titres, corps et réponses
    if (hasSearch) {
      // Découper en mots-clés et rechercher si AU MOINS un des mots est présent
      const terms = qRaw
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2);

      if (terms.length > 0) {
        const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const regex = new RegExp(escaped.join('|'), 'i');

        // D'abord, trouver les discussions qui ont au moins une réponse contenant un des mots-clés
        let threadIdsFromPosts = [];
        try {
          threadIdsFromPosts = await ForumPost.distinct('thread', {
            isDeleted: false,
            body: regex,
          });
        } catch (postSearchError) {
          console.error('Erreur lors de la recherche dans les réponses du forum:', postSearchError);
        }

        const searchFilter = {
          $or: [
            { title: regex },
            { body: regex },
            { _id: { $in: threadIdsFromPosts } },
          ],
        };

        filter = { $and: [filter, searchFilter] };
      }
    }

    const [threads, total] = await Promise.all([
      ForumThread.find(filter)
        .sort({ isPinned: -1, lastReplyAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('createdBy', 'prenom nom role'),
      ForumThread.countDocuments(filter),
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
    body('theme').optional().isIn(THEMES).withMessage('Thème invalide'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { title, body: content, tags } = req.body;
      const themeRaw = req.body.theme != null ? String(req.body.theme).trim() : '';
      const theme = themeRaw && THEMES.includes(themeRaw) ? themeRaw : 'autres';

      const thread = await ForumThread.create({
        title,
        body: content,
        createdBy: req.user.id,
        theme,
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

// POST /api/forum/posts/:id/like - Aimer / retirer son like sur une réponse
router.post('/posts/:id/like', protect, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;

    const post = await ForumPost.findById(postId);
    if (!post || post.isDeleted) {
      return res.status(404).json({ success: false, message: 'Réponse introuvable' });
    }

    const hasLiked = post.likes?.some((id) => id.toString() === userId.toString());

    if (hasLiked) {
      // Retirer le like
      post.likes = post.likes.filter((id) => id.toString() !== userId.toString());
    } else {
      // Ajouter le like
      post.likes = [...(post.likes || []), userId];
    }

    await post.save();

    return res.json({
      success: true,
      data: {
        _id: post._id,
        thread: post.thread,
        body: post.body,
        createdBy: post.createdBy,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        likesCount: (post.likes || []).length,
        liked: !hasLiked,
      },
    });
  } catch (error) {
    console.error('Erreur lors du like de la réponse:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// POST /api/forum/threads/:id/bookmark - Mettre en signet / retirer un signet sur une discussion
router.post('/threads/:id/bookmark', protect, async (req, res) => {
  try {
    const threadId = req.params.id;
    const userId = req.user.id;

    const thread = await ForumThread.findById(threadId);
    if (!thread) {
      return res.status(404).json({ success: false, message: 'Discussion introuvable' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    if (!Array.isArray(user.forumBookmarks)) {
      user.forumBookmarks = [];
    }

    const existingIndex = user.forumBookmarks.findIndex(
      (b) => b.thread.toString() === threadId.toString()
    );

    let bookmarked;
    if (existingIndex >= 0) {
      // Retirer des signets
      user.forumBookmarks.splice(existingIndex, 1);
      bookmarked = false;
    } else {
      // Ajouter aux signets
      user.forumBookmarks.push({ thread: threadId, addedAt: new Date() });
      bookmarked = true;
    }

    await user.save();

    return res.json({
      success: true,
      bookmarked,
    });
  } catch (error) {
    console.error('Erreur lors du signet de la discussion:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// GET /api/forum/bookmarks - Récupérer les discussions mises en signet par l'utilisateur courant
router.get('/bookmarks', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate({
      path: 'forumBookmarks.thread',
      select: 'title theme status isPinned lastReplyAt repliesCount',
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    const rawBookmarks = (user.forumBookmarks || []).filter((b) => !!b.thread);

    // Calculer le nombre de nouvelles réponses depuis l'ajout au signet
    const bookmarks = await Promise.all(
      rawBookmarks.map(async (b) => {
        let newRepliesCount = 0;
        try {
          // Compter les posts non supprimés créés après la date d'ajout du signet
          newRepliesCount = await ForumPost.countDocuments({
            thread: b.thread._id,
            isDeleted: false,
            createdAt: { $gt: b.addedAt || new Date(0) },
          });
        } catch (err) {
          console.error('Erreur lors du calcul des nouvelles réponses pour un signet:', err);
        }

        return {
          thread: b.thread,
          addedAt: b.addedAt,
          newRepliesCount,
        };
      })
    );

    return res.json({
      success: true,
      bookmarks,
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des signets du forum:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// POST /api/forum/threads/:id/mark-read - Enregistrer que l'utilisateur a consulté le fil (efface le badge)
router.post('/threads/:id/mark-read', protect, async (req, res) => {
  try {
    const threadId = req.params.id;
    const thread = await ForumThread.findById(threadId).select('_id');
    if (!thread) {
      return res.status(404).json({ success: false, message: 'Discussion introuvable' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    if (!Array.isArray(user.forumThreadReads)) {
      user.forumThreadReads = [];
    }

    const now = new Date();
    const idx = user.forumThreadReads.findIndex((r) => r.thread.toString() === threadId.toString());
    if (idx >= 0) {
      user.forumThreadReads[idx].readAt = now;
    } else {
      user.forumThreadReads.push({ thread: threadId, readAt: now });
    }

    await user.save();
    return res.json({ success: true });
  } catch (error) {
    console.error('Erreur mark-read forum:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// GET /api/forum/unread-count - Mes discussions avec nouvelles réponses non lues + signets avec activité
router.get('/unread-count', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select('forumThreadReads forumBookmarks');
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    const readsMap = new Map(
      (user.forumThreadReads || []).map((r) => [r.thread.toString(), r.readAt])
    );

    // Orange : fils que j'ai créés, avec au moins une réponse, et activité après ma dernière lecture
    const myThreads = await ForumThread.find({
      createdBy: userId,
      repliesCount: { $gt: 0 },
    })
      .select('_id createdAt lastReplyAt')
      .lean();

    let count = 0;
    for (const t of myThreads) {
      const tid = t._id.toString();
      const readAt = readsMap.get(tid) || new Date(t.createdAt || 0);
      if (t.lastReplyAt && new Date(t.lastReplyAt) > new Date(readAt)) {
        count += 1;
      }
    }

    // Vert : discussions en signet avec une réponse d’un tiers après max(signet, dernière lecture)
    let newRepliesCount = 0;
    const bookmarks = user.forumBookmarks || [];
    for (const b of bookmarks) {
      const raw = b.thread;
      const tid =
        raw && typeof raw === 'object' && raw._id
          ? raw._id.toString()
          : raw
            ? raw.toString()
            : '';
      if (!tid) continue;
      const thread = await ForumThread.findById(tid).select('lastReplyAt lastReplyBy').lean();
      if (!thread || !thread.lastReplyAt) continue;
      const readAt = readsMap.get(tid) || new Date(0);
      const baseline = new Date(
        Math.max(new Date(readAt).getTime(), new Date(b.addedAt || 0).getTime())
      );
      if (new Date(thread.lastReplyAt) <= baseline) continue;
      const lastBy = thread.lastReplyBy ? thread.lastReplyBy.toString() : '';
      if (lastBy && lastBy !== userId.toString()) {
        newRepliesCount += 1;
      }
    }

    return res.json({ success: true, count, newRepliesCount });
  } catch (error) {
    console.error('Erreur lors de la récupération du nombre de nouvelles discussions:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

module.exports = router;

