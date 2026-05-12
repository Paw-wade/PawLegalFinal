const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');

const ForumThread = require('../models/ForumThread');
const ForumPost = require('../models/ForumPost');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { sendTransactionalEmailDetailed } = require('../utils/emailNotifications');
const { getPrimaryFrontendUrl } = require('../utils/frontendOrigins');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

const optionalProtect = (req, res, next) => {
  try {
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      const token = req.headers.authorization.split(' ')[1];
      if (!token) return next();

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-here');
        if (decoded?.id) {
          return User.findById(decoded.id)
            .select('-password')
            .lean()
            .then((dbUser) => {
              if (dbUser && dbUser.isActive) {
                req.user = { ...dbUser, id: String(dbUser._id) };
              }
              return next();
            })
            .catch(() => next());
        }
      } catch {
        // Token invalide/expiré: on continue en mode invité pour les routes publiques forum.
        return next();
      }
    }
    return next();
  } catch {
    return next();
  }
};

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

const getForumLikeKey = (req) => {
  if (req.user?.id) {
    return `user:${req.user.id.toString()}`;
  }
  const rawVisitorId = req.headers['x-forum-visitor-id'];
  const visitorId = Array.isArray(rawVisitorId) ? rawVisitorId[0] : rawVisitorId;
  const normalized = typeof visitorId === 'string' ? visitorId.trim() : '';
  if (/^v_[A-Za-z0-9_-]{8,120}$/.test(normalized)) {
    return `guest:${normalized}`;
  }
  return null;
};

const decorateThreadWithLikeState = (threadDoc, actorKey) => {
  const data = threadDoc?.toObject ? threadDoc.toObject() : threadDoc;
  const likedByKeys = Array.isArray(data?.likedByKeys) ? data.likedByKeys : [];
  return {
    ...data,
    likesCount: likedByKeys.length,
    liked: !!actorKey && likedByKeys.includes(actorKey),
  };
};

const decoratePostWithLikeState = (postDoc, actorKey) => {
  const data = postDoc?.toObject ? postDoc.toObject() : postDoc;
  const likedByKeys = Array.isArray(data?.likedByKeys) ? data.likedByKeys : [];
  const legacyLikes = Array.isArray(data?.likes) ? data.likes : [];
  const actorUserId = actorKey && actorKey.startsWith('user:') ? actorKey.slice(5) : '';
  const hasLegacyLike = !!actorUserId && legacyLikes.some((id) => id?.toString?.() === actorUserId);
  return {
    ...data,
    likesCount: likedByKeys.length + legacyLikes.length,
    liked: (!!actorKey && likedByKeys.includes(actorKey)) || hasLegacyLike,
  };
};

const getUserDisplayName = (user) => {
  if (!user) return '';
  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  return fullName || user.email || '';
};

const sendForumEmailsSafely = async (recipients, { subject, htmlContent, textContent }) => {
  if (!Array.isArray(recipients) || recipients.length === 0) return;
  const settled = await Promise.allSettled(
    recipients.map((r) =>
      sendTransactionalEmailDetailed({
        to: r.email,
        toName: r.name || '',
        subject,
        htmlContent,
        textContent,
      })
    )
  );
  for (const result of settled) {
    if (result.status === 'rejected') {
      console.error('Erreur envoi email forum:', result.reason?.message || result.reason);
      continue;
    }
    if (!result.value?.ok) {
      console.error('Erreur envoi email forum:', result.value?.error || 'unknown_error');
    }
  }
};

// GET /api/forum/threads - Liste des discussions (publique)
// Options :
// - ?theme=xxx
// - ?statusFilter=pinned|resolved|archived
// - ?q=mot-clé (recherche dans titre, corps et réponses)
router.get('/threads', optionalProtect, async (req, res) => {
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

    const actorKey = getForumLikeKey(req);
    const threadsWithLikes = threads.map((thread) => decorateThreadWithLikeState(thread, actorKey));

    res.json({
      success: true,
      data: threadsWithLikes,
      page,
      totalPages: Math.ceil(total / limit),
      total,
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des discussions:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// POST /api/forum/threads - Créer une nouvelle discussion (publique, avec ou sans connexion)
router.post(
  '/threads',
  optionalProtect,
  [
    body('title').isString().isLength({ min: 5, max: 200 }).withMessage('Le titre doit contenir entre 5 et 200 caractères'),
    body('body').isString().isLength({ min: 10 }).withMessage('Le contenu doit contenir au moins 10 caractères'),
    body('theme').optional().isIn(THEMES).withMessage('Thème invalide'),
    body('guestName').optional().isString().isLength({ max: 120 }).withMessage('Nom invité invalide'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { title, body: content, tags } = req.body;
      const themeRaw = req.body.theme != null ? String(req.body.theme).trim() : '';
      const theme = themeRaw && THEMES.includes(themeRaw) ? themeRaw : 'autres';
      const guestName = (req.body.guestName || '').toString().trim();
      const authorId = req.user?.id || null;

      const thread = await ForumThread.create({
        title,
        body: content,
        createdBy: authorId,
        guestName: authorId ? '' : (guestName || 'Visiteur'),
        theme,
        tags: Array.isArray(tags) ? tags : [],
        lastReplyAt: new Date(),
        lastReplyBy: authorId || null,
      });

      // Notifier les admins d'une nouvelle question forum
      try {
        const admins = await User.find({ role: { $in: ['admin', 'superadmin'] }, isActive: true }).select('_id');
        const adminIds = admins
          .map((a) => a._id?.toString())
          .filter((id) => id && id !== (authorId ? authorId.toString() : ''));
        if (adminIds.length > 0) {
          const authorLabel = authorId ? 'Un utilisateur' : `Un visiteur${guestName ? ` (${guestName})` : ''}`;
          await Notification.insertManyWithPush(
            adminIds.map((userId) => ({
              user: userId,
              type: 'forum_thread_created',
              titre: '🆕 Nouvelle question sur le forum',
              message: `${authorLabel} a publié: "${title}".`,
              lien: `/forum/${thread._id}`,
              metadata: {
                threadId: thread._id.toString(),
                theme,
              },
            }))
          );
        }
      } catch (notifError) {
        console.error('Erreur notification forum_thread_created:', notifError);
      }

      // Envoyer un email aux admins + au créateur (si connecté)
      try {
        const [adminsWithEmail, authorUser] = await Promise.all([
          User.find({
            role: { $in: ['admin', 'superadmin'] },
            isActive: true,
            email: { $exists: true, $ne: '' },
          }).select('email firstName lastName'),
          authorId
            ? User.findOne({
                _id: authorId,
                isActive: true,
                email: { $exists: true, $ne: '' },
              }).select('email firstName lastName')
            : Promise.resolve(null),
        ]);

        const byEmail = new Map();
        for (const admin of adminsWithEmail) {
          if (!admin?.email) continue;
          byEmail.set(admin.email.toLowerCase(), {
            email: admin.email,
            name: getUserDisplayName(admin),
          });
        }
        if (authorUser?.email) {
          byEmail.set(authorUser.email.toLowerCase(), {
            email: authorUser.email,
            name: getUserDisplayName(authorUser),
          });
        }

        const recipients = Array.from(byEmail.values());
        const threadUrl = `${getPrimaryFrontendUrl()}/forum/${thread._id}`;
        await sendForumEmailsSafely(recipients, {
          subject: `Forum - Nouvelle discussion: ${title}`,
          htmlContent: `<p>Une nouvelle discussion a été publiée sur le forum.</p><p><strong>Titre :</strong> ${title}</p><p><a href="${threadUrl}">Voir la discussion</a></p>`,
          textContent: `Une nouvelle discussion a été publiée sur le forum.\nTitre : ${title}\nVoir la discussion : ${threadUrl}`,
        });
      } catch (emailError) {
        console.error('Erreur email forum_thread_created:', emailError);
      }

      res.status(201).json({ success: true, data: thread });
    } catch (error) {
      console.error('Erreur lors de la création de la discussion:', error);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// GET /api/forum/threads/:id - Détails d'une discussion + premiers posts (public)
router.get('/threads/:id', optionalProtect, async (req, res) => {
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
      .populate('createdBy', 'prenom nom role')
      .populate('verifiedBy', 'prenom nom role')
      .populate('rejectedBy', 'prenom nom role');

    const actorKey = getForumLikeKey(req);
    const threadWithLikes = decorateThreadWithLikeState(thread, actorKey);
    const postsWithLikes = posts.map((post) => decoratePostWithLikeState(post, actorKey));

    res.json({
      success: true,
      data: {
        thread: threadWithLikes,
        posts: postsWithLikes,
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
  optionalProtect,
  [
    body('body').isString().isLength({ min: 2 }).withMessage('Le contenu doit contenir au moins 2 caractères'),
    body('guestName').optional().isString().isLength({ max: 120 }).withMessage('Nom invité invalide'),
    body('parentPostId').optional().isMongoId().withMessage('parentPostId invalide'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const threadId = req.params.id;
      const { body: content } = req.body;
      const guestName = (req.body.guestName || '').toString().trim();
      const authorId = req.user?.id || null;
      const parentPostIdRaw = req.body.parentPostId;
      const parentPostId = typeof parentPostIdRaw === 'string' && parentPostIdRaw.trim() ? parentPostIdRaw.trim() : null;

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

      let parentPost = null;
      if (parentPostId) {
        parentPost = await ForumPost.findOne({
          _id: parentPostId,
          thread: threadId,
          isDeleted: false,
        }).select('_id');
        if (!parentPost) {
          return res.status(400).json({
            success: false,
            message: 'La réponse parente est introuvable.',
          });
        }
      }

      const post = await ForumPost.create({
        thread: threadId,
        parentPost: parentPost ? parentPost._id : null,
        body: content,
        createdBy: authorId,
        guestName: authorId ? '' : (guestName || 'Visiteur'),
      });

      thread.repliesCount += 1;
      thread.lastReplyAt = new Date();
      thread.lastReplyBy = authorId || null;
      await thread.save();

      // Notifier le créateur du thread + participants (hors auteur de la réponse)
      try {
        const recipientIds = new Set();
        const replyAuthorId = authorId ? authorId.toString() : null;
        const threadCreatorId = thread.createdBy?.toString();
        if (threadCreatorId && threadCreatorId !== replyAuthorId) {
          recipientIds.add(threadCreatorId);
        }

        const participantIds = await ForumPost.distinct('createdBy', {
          thread: threadId,
          isDeleted: false,
        });
        for (const pid of participantIds) {
          const id = pid?.toString();
          if (id && id !== replyAuthorId) {
            recipientIds.add(id);
          }
        }

        if (recipientIds.size > 0) {
          await Notification.insertManyWithPush(
            Array.from(recipientIds).map((userId) => ({
              user: userId,
              type: 'forum_reply_created',
              titre: '💬 Nouvelle réponse sur le forum',
              message: `Nouvelle réponse dans "${thread.title}".`,
              lien: `/forum/${thread._id}`,
              metadata: {
                threadId: thread._id.toString(),
                postId: post._id.toString(),
              },
            }))
          );
        }
      } catch (notifError) {
        console.error('Erreur notification forum_reply_created:', notifError);
      }

      // Envoyer un email de notification pour toute nouvelle réponse
      try {
        const replyAuthorId = authorId ? authorId.toString() : null;
        const emailRecipientIds = new Set();

        // Créateur du thread
        const threadCreatorId = thread.createdBy?.toString();
        if (threadCreatorId && threadCreatorId !== replyAuthorId) {
          emailRecipientIds.add(threadCreatorId);
        }

        // Participants de la discussion
        const participantIds = await ForumPost.distinct('createdBy', {
          thread: threadId,
          isDeleted: false,
        });
        for (const pid of participantIds) {
          const id = pid?.toString();
          if (id && id !== replyAuthorId) {
            emailRecipientIds.add(id);
          }
        }

        // Admins
        const admins = await User.find({
          role: { $in: ['admin', 'superadmin'] },
          isActive: true,
        }).select('_id');
        for (const admin of admins) {
          const id = admin?._id?.toString?.();
          if (id && id !== replyAuthorId) {
            emailRecipientIds.add(id);
          }
        }

        if (emailRecipientIds.size > 0) {
          const users = await User.find({
            _id: { $in: Array.from(emailRecipientIds) },
            isActive: true,
            email: { $exists: true, $ne: '' },
          }).select('email firstName lastName');

          const recipients = users
            .filter((u) => !!u?.email)
            .map((u) => ({ email: u.email, name: getUserDisplayName(u) }));
          const threadUrl = `${getPrimaryFrontendUrl()}/forum/${thread._id}`;

          await sendForumEmailsSafely(recipients, {
            subject: `Forum - Nouvelle réponse: ${thread.title}`,
            htmlContent: `<p>Une nouvelle réponse a été publiée dans la discussion :</p><p><strong>${thread.title}</strong></p><p><a href="${threadUrl}">Voir la discussion</a></p>`,
            textContent: `Une nouvelle réponse a été publiée dans la discussion "${thread.title}".\nVoir la discussion : ${threadUrl}`,
          });
        }
      } catch (emailError) {
        console.error('Erreur email forum_reply_created:', emailError);
      }

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

// PATCH /api/forum/posts/:id - Modifier le texte d'une réponse (admin, sans notification)
router.patch(
  '/posts/:id',
  protect,
  [
    body('body')
      .isString()
      .isLength({ min: 2 })
      .withMessage('Le contenu doit contenir au moins 2 caractères'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const postId = req.params.id;
      const content = req.body.body.trim();
      const currentUserId = req.user?.id?.toString?.() || req.user?._id?.toString?.() || '';
      const currentUserRole = req.user?.role || '';

      const post = await ForumPost.findById(postId);
      if (!post || post.isDeleted) {
        return res.status(404).json({ success: false, message: 'Réponse introuvable' });
      }

      const isAdmin = currentUserRole === 'admin' || currentUserRole === 'superadmin';
      const isOwner = !!post.createdBy && post.createdBy.toString() === currentUserId;
      if (!isAdmin && !isOwner) {
        return res.status(403).json({
          success: false,
          message: "Vous n'êtes pas autorisé à modifier cette réponse.",
        });
      }

      post.body = content;
      post.updatedAt = new Date();
      await post.save();
      await post.populate('createdBy', 'prenom nom role');
      await post.populate('verifiedBy', 'prenom nom role');
      await post.populate('rejectedBy', 'prenom nom role');

      // Intentionnellement aucune notification utilisateur pour les corrections admin.
      return res.json({ success: true, data: post });
    } catch (error) {
      console.error('Erreur lors de la modification de la réponse (admin):', error);
      return res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// PATCH /api/forum/posts/:id/verify - Valider / invalider une réponse (admin)
router.patch(
  '/posts/:id/verify',
  protect,
  authorize('admin', 'superadmin'),
  [
    body('isVerified')
      .optional()
      .isBoolean()
      .withMessage("Le champ isVerified doit être un booléen"),
    body('isRejected')
      .optional()
      .isBoolean()
      .withMessage("Le champ isRejected doit être un booléen"),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const postId = req.params.id;
      const hasIsVerified = typeof req.body.isVerified === 'boolean';
      const hasIsRejected = typeof req.body.isRejected === 'boolean';
      const { isVerified, isRejected } = req.body;

      if (!hasIsVerified && !hasIsRejected) {
        return res.status(400).json({
          success: false,
          message: "Veuillez fournir isVerified ou isRejected.",
        });
      }
      if (hasIsVerified && hasIsRejected && isVerified && isRejected) {
        return res.status(400).json({
          success: false,
          message: "Une réponse ne peut pas être approuvée et désapprouvée en même temps.",
        });
      }

      const post = await ForumPost.findById(postId);
      if (!post || post.isDeleted) {
        return res.status(404).json({ success: false, message: 'Réponse introuvable' });
      }

      if (hasIsVerified) {
        post.isVerified = isVerified;
      }
      if (hasIsRejected) {
        post.isRejected = isRejected;
      }

      if (post.isVerified) {
        post.verifiedAt = new Date();
        post.verifiedBy = req.user._id;
      } else {
        post.verifiedAt = null;
        post.verifiedBy = null;
      }
      if (post.isRejected) {
        post.rejectedAt = new Date();
        post.rejectedBy = req.user._id;
      } else {
        post.rejectedAt = null;
        post.rejectedBy = null;
      }

      // Un seul état de modération actif à la fois.
      if (post.isVerified && post.isRejected) {
        if (hasIsVerified && !hasIsRejected) {
          post.isRejected = false;
          post.rejectedAt = null;
          post.rejectedBy = null;
        } else {
          post.isVerified = false;
          post.verifiedAt = null;
          post.verifiedBy = null;
        }
      }

      await post.save();
      await post.populate('verifiedBy', 'prenom nom role');
      await post.populate('rejectedBy', 'prenom nom role');

      return res.json({
        success: true,
        data: {
          _id: post._id,
          isVerified: !!post.isVerified,
          isRejected: !!post.isRejected,
          verifiedAt: post.verifiedAt || null,
          verifiedBy: post.verifiedBy || null,
          rejectedAt: post.rejectedAt || null,
          rejectedBy: post.rejectedBy || null,
        },
      });
    } catch (error) {
      console.error('Erreur lors de la validation d’une réponse forum:', error);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// POST /api/forum/posts/:id/like - Aimer / retirer son like sur une réponse
router.post('/posts/:id/like', optionalProtect, async (req, res) => {
  try {
    const postId = req.params.id;
    const actorKey = getForumLikeKey(req);
    if (!actorKey) {
      return res.status(400).json({
        success: false,
        message: 'Identifiant de visiteur manquant. Rechargez la page.',
      });
    }

    const post = await ForumPost.findById(postId);
    if (!post || post.isDeleted) {
      return res.status(404).json({ success: false, message: 'Réponse introuvable' });
    }

    const likedByKeys = Array.isArray(post.likedByKeys) ? post.likedByKeys : [];
    const legacyLikes = Array.isArray(post.likes) ? post.likes : [];
    const actorUserId = actorKey.startsWith('user:') ? actorKey.slice(5) : '';
    const hasLegacyLike = !!actorUserId && legacyLikes.some((id) => id?.toString?.() === actorUserId);
    const hasLiked = likedByKeys.includes(actorKey) || hasLegacyLike;

    if (hasLiked) {
      post.likedByKeys = likedByKeys.filter((key) => key !== actorKey);
      if (hasLegacyLike) {
        post.likes = legacyLikes.filter((id) => id?.toString?.() !== actorUserId);
      }
    } else {
      post.likedByKeys = [...likedByKeys, actorKey];
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
        likesCount: (post.likedByKeys || []).length + (post.likes || []).length,
        liked: !hasLiked,
      },
    });
  } catch (error) {
    console.error('Erreur lors du like de la réponse:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// POST /api/forum/threads/:id/like - Aimer / retirer son like sur une discussion (public)
router.post('/threads/:id/like', optionalProtect, async (req, res) => {
  try {
    const threadId = req.params.id;
    const actorKey = getForumLikeKey(req);
    if (!actorKey) {
      return res.status(400).json({
        success: false,
        message: 'Identifiant de visiteur manquant. Rechargez la page.',
      });
    }

    const thread = await ForumThread.findById(threadId);
    if (!thread) {
      return res.status(404).json({ success: false, message: 'Discussion introuvable' });
    }

    const likedByKeys = Array.isArray(thread.likedByKeys) ? thread.likedByKeys : [];
    const hasLiked = likedByKeys.includes(actorKey);
    thread.likedByKeys = hasLiked
      ? likedByKeys.filter((key) => key !== actorKey)
      : [...likedByKeys, actorKey];
    await thread.save();

    return res.json({
      success: true,
      data: {
        _id: thread._id,
        likesCount: (thread.likedByKeys || []).length,
        liked: !hasLiked,
      },
    });
  } catch (error) {
    console.error('Erreur lors du like de la discussion:', error);
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

