const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');
const path = require('path');
const { getFrontendOriginsList } = require('./utils/frontendOrigins');
const { getKnowledgeDir, getKnowledgeStats } = require('./services/lexiaInternal');

// Charger les variables d'environnement
dotenv.config();

const app = express();
let isDatabaseConnected = false;

/* =========================
   MIDDLEWARE
========================= */

const allowedOrigins = getFrontendOriginsList();
console.log('✅ CORS - origines autorisées:', allowedOrigins.join(', ') || '(aucune)');

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      console.warn('🚫 CORS bloqué pour:', origin);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Cache-Control',
      'cache-control',
      'Pragma',
      'pragma',
      'x-forum-visitor-id',
    ],
    exposedHeaders: ['Content-Disposition', 'Content-Type', 'Content-Length'],
    maxAge: 86400,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* =========================
   MONGODB
========================= */

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;

    if (!mongoURI) {
      console.warn('⚠️ MONGODB_URI manquant - démarrage en mode dégradé (sans base de données)');
      isDatabaseConnected = false;
      return;
    }

    const conn = await mongoose.connect(mongoURI);

    console.log(`✅ MongoDB connecté : ${conn.connection.host}`);
    isDatabaseConnected = true;

    try {
      const { ensureDefaultCabinet } = require('./utils/cabinetResolver');
      await ensureDefaultCabinet();
    } catch (cabinetErr) {
      console.warn('⚠️ Cabinet par défaut non initialisé:', cabinetErr.message);
    }
  } catch (error) {
    console.warn(`⚠️ MongoDB indisponible (${error.message}) - démarrage en mode dégradé`);
    isDatabaseConnected = false;
  }
};

/* =========================
   ROUTES
========================= */

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'API Ada Papers est en ligne',
    version: '1.0.0'
  });
});

app.use('/api/auth', require('./routes/auth'));
// Termine tout /api/auth non géré ci-dessus (NextAuth vit côté Next en dev avec proxy granulaire).
// Sans cela, Express continue la chaîne jusqu’aux routers montés sur /api/* qui font `protect` → 401 sur /session, /providers…
app.use('/api/auth', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route API Express /api/auth inexistante: ${req.originalUrl}`,
  });
});

try {
  app.use('/api', require('./routes/guides'));
  console.log('Route /api/guides enregistree');
} catch (e) {
  console.error("Impossible d'enregistrer /api/guides:", e.message);
}

// ✅ Légifrance - ajoute ces lignes
try {
  app.use('/api/legal', require('./routes/legal'));
  console.log('✅ Route /api/legal enregistrée');
} catch (e) {
  console.error('❌ Impossible d\'enregistrer /api/legal:', e.message);
}

try {
  app.use('/api/judilibre', require('./routes/judilibre'));
  console.log('✅ Route /api/judilibre enregistrée');
} catch (e) {
  console.error('❌ Impossible d\'enregistrer /api/judilibre:', e.message);
}

app.use('/api/contact', require('./routes/contact'));

try {
  app.use('/api/webhook/whatsapp', require('./routes/whatsapp'));
  console.log('✅ Route /api/webhook/whatsapp enregistrée');
} catch (e) { console.error('whatsapp webhook:', e.message); }

try {
  app.use('/api/whatsapp-admin', require('./routes/whatsapp-admin'));
  console.log('✅ Route /api/whatsapp-admin enregistrée');
} catch (e) { console.error('whatsapp-admin:', e.message); }

try {
  app.use('/api/otp', require('./routes/otp'));
} catch (e) {}

try {
  app.use('/api/permissions', require('./routes/permissions'));
} catch (e) {}

try {
  app.use('/api/cabinets', require('./routes/cabinets'));
  console.log('✅ Route /api/cabinets enregistrée');
} catch (e) {
  console.error('❌ Impossible d\'enregistrer /api/cabinets:', e.message);
}

try { app.use('/api/user/dossiers/:id/lettre-mission', require('./routes/lettreMission')); console.log('Route lettre-mission enregistree'); } catch (e) { console.error('lettre-mission:', e.message); }
try {
  app.use('/api/user/dossiers', require('./routes/dossiers'));
} catch (e) {}
try { app.use('/api/fiches', require('./routes/fiches')); } catch (e) {}
try { app.use('/api/fiche-invitations', require('./routes/ficheInvitations')); } catch (e) {}

try {
  app.use('/api/user/documents', require('./routes/documents'));
} catch (e) {
  console.error('FATAL: impossible de charger /api/user/documents:', e.message);
}

try {
  app.use('/api/document-requests', require('./routes/document-requests'));
} catch (e) {}

try {
  app.use('/api/dossier-guest-upload', require('./routes/dossierGuestUpload'));
  console.log('✅ Route /api/dossier-guest-upload enregistrée');
} catch (e) {
  console.error('❌ Impossible d\'enregistrer /api/dossier-guest-upload:', e.message);
}

try {
  app.use('/api/document-download-share', require('./routes/documentDownloadShare'));
  console.log('✅ Route /api/document-download-share enregistrée');
} catch (e) {
  console.error('❌ Impossible d\'enregistrer /api/document-download-share:', e.message);
}

app.use('/api/user', require('./routes/user'));

try {
  app.use('/api/tasks', require('./routes/tasks'));
} catch (e) {}
try {
  app.use('/api/assistant', require('./routes/assistant'));
  console.log('Route /api/assistant enregistree');
} catch (e) { console.error('assistant:', e.message); }

try {
  app.use('/api/messages', require('./routes/messages'));
} catch (e) {}

try {
  app.use('/api/content', require('./routes/content'));
} catch (e) {}

try {
  app.use('/api/media', require('./routes/media'));
} catch (e) {}

try {
  app.use('/api/appointments', require('./routes/appointments'));
} catch (e) {}

try { app.use('/api/dahira', require('./routes/dahira')); } catch (e) { console.error('dahira:', e.message); }

try {
  app.use('/api/calendar', require('./routes/calendar'));
} catch (e) {}

try {
  app.use('/api/forum', require('./routes/forum'));
} catch (e) {}

try {
  app.use('/api/logs', require('./routes/logs'));
} catch (e) {}

try {
  app.use('/api/notifications', require('./routes/notifications'));
} catch (e) {}

try {
  app.use('/api/push', require('./routes/push'));
} catch (e) {}

try {
  app.use('/api/trash', require('./routes/trash'));
} catch (e) {}

try {
  app.use('/api/sms', require('./routes/sms'));
} catch (e) {}

try {
  app.use('/api/email', require('./routes/email'));
  console.log('✅ Route /api/email enregistrée');
} catch (e) {
  console.error('❌ Impossible d\'enregistrer /api/email:', e.message);
}

try {
  app.use('/api/creneaux', require('./routes/creneaux'));
  console.log('✅ Route /api/creneaux enregistrée');
} catch (e) {
  console.error('❌ Impossible d\'enregistrer /api/creneaux:', e.message);
}

try {
  app.use('/api/lexia', require('./routes/lexia'));
  console.log('✅ Route /api/lexia enregistrée (incl. partage public /public-share)');
} catch (e) {
  console.error('❌ Impossible d\'enregistrer /api/lexia:', e.message);
}

try {
  app.use('/api/paw-search', require('./routes/paw-search'));
  console.log('✅ Route /api/paw-search enregistrée');
} catch (e) {
  console.error('❌ Impossible d\'enregistrer /api/paw-search:', e.message);
}

try {
  app.use('/api/sms-templates', require('./routes/sms-templates'));
} catch (e) {}

try {
  app.use('/api/sms-history', require('./routes/sms-history'));
} catch (e) {}

try {
  app.use('/api', require('./routes/calculators'));
} catch (e) {}

try {
  app.use('/api/temoignages', require('./routes/temoignages'));
} catch (e) {}

try {
  app.use('/api/questionnaires', require('./routes/questionnaires'));
  console.log('Route /api/questionnaires enregistree');
} catch (e) {
  console.error('Impossible d\'enregistrer /api/questionnaires:', e.message);
}

try {
  app.use('/api/automations', require('./routes/automations'));
  console.log('Route /api/automations enregistree');
} catch (e) {
  console.error('Impossible d\'enregistrer /api/automations:', e.message);
}

try {
  app.use('/api', require('./routes/collaborativeDrafts'));
} catch (e) {}

try {
  app.use('/api', require('./routes/dossierDocumentDrafts'));
} catch (e) {}

try {
  app.use('/api', require('./routes/recours'));
} catch (e) {}

/* =========================
   ERREURS
========================= */

app.use(require('./middleware/errorHandler'));

/* =========================
   HEALTHCHECK
========================= */

app.get("/api-status", (req, res) => {
  res.json({
    success: true,
    message: "API active",
    database: isDatabaseConnected ? "connectée" : "indisponible"
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route non trouvée',
  });
});

/* =========================
   START SERVER
========================= */

const startServer = async () => {
  try {
    await connectDB();

    const PORT = process.env.PORT || 3005;

    const server = app.listen(PORT, () => {
      console.log(`🚀 Serveur démarré sur le port ${PORT}`);
      console.log(`📡 API: /api`);
      const lexiaKnowledgeDir = getKnowledgeDir();
      console.log(`🧠 Paw AI (interne) - dossier indexé: ${lexiaKnowledgeDir}`);
      getKnowledgeStats()
        .then((s) => {
          const breakdown = Object.entries(s.byExt || {})
            .filter(([, v]) => v > 0)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ');
          const capInfo =
            s.indexedFilesCap != null
              ? ` | indexRAM≤${s.indexedFilesCap} fichier(s)${s.indexTruncated ? ' (tronqué)' : ''}`
              : ' | indexRAM: tous les fichiers (LEXIA_INDEX_MAX_FILES sans plafond)';
          console.log(
            `🧠 Paw AI (interne) - fichiers détectés sur disque: total=${s.total}${breakdown ? ` (${breakdown})` : ''}${capInfo}`
          );
        })
        .catch((e) => {
          console.warn(`⚠️ Paw AI (interne) - impossible de compter les fichiers: ${e.message}`);
        });

      if (isDatabaseConnected) {
        const { checkTarificationInstallmentReminders } = require('./utils/tarificationInstallmentNotifications');
        const runTarificationInstallmentReminders = () => {
          void checkTarificationInstallmentReminders();
        };
        setTimeout(runTarificationInstallmentReminders, 60_000);
        setInterval(runTarificationInstallmentReminders, 24 * 60 * 60 * 1000);

        const { checkAppelPlanifieNotifications } = require('./utils/appelPlanifieNotifications');
        setInterval(() => { void checkAppelPlanifieNotifications(); }, 60_000);
        console.log('📞 Scheduler appels planifies actif (toutes les 60s)');

        // Retour automatique en mode bot apres 24h d'inactivite en mode conseiller
        const resetExpiredHumanMode = async () => {
          try {
            const WhatsappConversation = require('./models/WhatsappConversation');
            const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const result = await WhatsappConversation.updateMany(
              { humanMode: true, lastActivity: { $lt: cutoff } },
              { $set: { humanMode: false, state: 'menu', rdv: {}, docContext: {} } }
            );
            if (result.modifiedCount > 0) {
              console.log(`🤖 ${result.modifiedCount} conversation(s) repassee(s) en mode bot (inactivite 24h)`);
            }
          } catch (e) {
            console.warn('⚠️ Reset humanMode expire:', e.message);
          }
        };
        setTimeout(resetExpiredHumanMode, 5 * 60 * 1000);
        setInterval(resetExpiredHumanMode, 60 * 60 * 1000);
        console.log('🤖 Scheduler reset humanMode actif (toutes les heures, seuil 24h)');

        // Rappel WhatsApp 2h avant le rendez-vous
        const checkRdvReminders2h = async () => {
          try {
            const RendezVous = require('./models/RendezVous');
            const User = require('./models/User');
            const WhatsappConversation = require('./models/WhatsappConversation');
            const { sendWhatsAppTemplate } = require('./services/whatsappService');
            const now = new Date();
            const debut = new Date(now.getTime() + 1 * 60 * 60 * 1000 + 45 * 60 * 1000);
            const fin = new Date(now.getTime() + 2 * 60 * 60 * 1000 + 15 * 60 * 1000);
            const rdvs = await RendezVous.find({
              statut: { $in: ['en_attente', 'confirme'] },
              whatsappReminderSent: { $ne: true },
              date: { $gte: debut, $lte: fin },
            }).lean();
            for (const rdv of rdvs) {
              try {
                let phone = rdv.telephone || '';
                if (rdv.user) {
                  const u = await User.findById(rdv.user).select('phone whatsappPhone').lean();
                  phone = u?.whatsappPhone || u?.phone || phone;
                }
                if (!phone) continue;
                const phoneAlt = phone.startsWith('+') ? phone.slice(1) : '+' + phone;
                const waConv = await WhatsappConversation.findOne({ phone: { $in: [phone, phoneAlt] } });
                if (!waConv) continue;
                const prenom = rdv.prenom || rdv.nom || 'Madame/Monsieur';
                const dateLabel = new Date(rdv.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
                await sendWhatsAppTemplate(phone, 'rdv_rappel_2h', [prenom, dateLabel, rdv.heure]);
                await RendezVous.findByIdAndUpdate(rdv._id, { whatsappReminderSent: true });
                console.log(`📲 Rappel RDV 2h envoye a ${phone} pour ${dateLabel} ${rdv.heure}`);
              } catch (e) {
                console.warn(`⚠️ Rappel RDV 2h echoue pour ${rdv._id}:`, e.message);
              }
            }
          } catch (e) {
            console.warn('⚠️ Scheduler rappel RDV 2h:', e.message);
          }
        };
        setTimeout(checkRdvReminders2h, 2 * 60 * 1000);
        setInterval(checkRdvReminders2h, 15 * 60 * 1000);
        console.log('📲 Scheduler rappel RDV 2h actif (toutes les 15 min)');

        // Relance documents manquants (quotidien, dossiers avec demandes > 3 jours sans reponse)
        const checkDocumentsManquants = async () => {
          try {
            const DocumentRequest = require('./models/DocumentRequest');
            const User = require('./models/User');
            const WhatsappConversation = require('./models/WhatsappConversation');
            const { sendWhatsAppTemplate } = require('./services/whatsappService');
            const cutoff3j = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
            const pendingReqs = await DocumentRequest.find({
              status: 'pending',
              createdAt: { $lt: cutoff3j },
            })
              .populate({ path: 'dossier', select: 'user numero titre' })
              .lean();
            const treated = new Set();
            for (const req of pendingReqs) {
              try {
                const userId = req.dossier?.user;
                if (!userId) continue;
                const userKey = userId.toString();
                if (treated.has(userKey)) continue;
                const u = await User.findById(userId).select('firstName phone whatsappPhone').lean();
                if (!u) continue;
                const phone = u.whatsappPhone || u.phone || '';
                if (!phone) continue;
                const phoneAlt = phone.startsWith('+') ? phone.slice(1) : '+' + phone;
                const waConv = await WhatsappConversation.findOne({ phone: { $in: [phone, phoneAlt] } });
                if (!waConv) continue;
                const prenom = u.firstName || 'Madame/Monsieur';
                const dossierRef = req.dossier?.numero ? `N° ${req.dossier.numero}` : (req.dossier?.titre || 'votre dossier');
                const docLabel = req.documentTypeLabel || 'document';
                await sendWhatsAppTemplate(phone, 'document_manquant_relance', [prenom, docLabel, dossierRef]);
                treated.add(userKey);
                console.log(`📋 Relance document manquant envoyee a ${phone}`);
              } catch (e) {
                console.warn('⚠️ Relance document manquant individuelle:', e.message);
              }
            }
          } catch (e) {
            console.warn('⚠️ Scheduler relance documents:', e.message);
          }
        };
        setTimeout(checkDocumentsManquants, 30 * 1000);
        setInterval(checkDocumentsManquants, 24 * 60 * 60 * 1000);
        console.log('📋 Scheduler relance documents manquants actif (quotidien)');

        // Notification liste d'attente : verifie les nouveaux creneaux et previent les inscrits
        const checkWaitlistNotifications = async () => {
          try {
            const WhatsappConversation = require('./models/WhatsappConversation');
            const { sendWhatsAppTemplate } = require('./services/whatsappService');
            const Creneau = require('./models/Creneau');
            const RendezVous = require('./models/RendezVous');
            const waitlisted = await WhatsappConversation.find({ waitlisted: true }).lean();
            if (!waitlisted.length) return;
            // Verifier si un creneau est disponible
            const maintenant = new Date();
            const finRecherche = new Date(maintenant.getTime() + 21 * 24 * 60 * 60 * 1000);
            const nbFermes = await Creneau.countDocuments({ date: { $gte: maintenant, $lte: finRecherche }, ferme: true });
            const nbPris = await RendezVous.countDocuments({ date: { $gte: maintenant, $lte: finRecherche }, statut: { $in: ['en_attente', 'confirme'] } });
            const totalOccupes = nbFermes + nbPris;
            // Estimation simple : si moins de 100 slots occupes, il y a probablement des creneaux libres
            if (totalOccupes > 100) return;
            for (const conv of waitlisted) {
              try {
                await sendWhatsAppTemplate(conv.phone, 'creneau_disponible', [conv.contactName || 'Client']);
                await WhatsappConversation.findByIdAndUpdate(conv._id, { waitlisted: false, state: 'menu' });
                console.log(`📅 Notification creneau disponible envoyee a ${conv.phone}`);
              } catch (e) {
                console.warn('⚠️ Notification liste attente:', e.message);
              }
            }
          } catch (e) {
            console.warn('⚠️ Scheduler liste attente:', e.message);
          }
        };
        setInterval(checkWaitlistNotifications, 60 * 60 * 1000);
        console.log('📅 Scheduler liste d\'attente RDV actif (toutes les heures)');

        if (String(process.env.DOCUMENTS_INTEGRITY_AUDIT_ENABLED || '').toLowerCase() === 'true') {
          const { runDocumentsIntegrityAudit } = require('./utils/documentsIntegrityAudit');
          const runAudit = () => {
            void runDocumentsIntegrityAudit({ quiet: true }).catch((e) => {
              console.warn('⚠️ Audit documents échoué:', e.message);
            });
          };
          setTimeout(runAudit, 5 * 60 * 1000);
          setInterval(runAudit, 24 * 60 * 60 * 1000);
          console.log('📋 Audit intégrité documents activé (quotidien)');
        }
      }
    });

    server.timeout = 120_000;
    server.headersTimeout = 125_000;
    if (typeof server.requestTimeout === 'number') {
      server.requestTimeout = 120_000;
    }

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(
          `❌ Port ${PORT} déjà utilisé (EADDRINUSE). Arrêtez l'autre instance ou changez PORT dans .env.`
        );
        console.error('   Windows: netstat -ano | findstr :' + PORT);
        process.exit(1);
      }
      throw err;
    });

  } catch (error) {
    console.error('❌ Erreur serveur:', error);
    process.exit(1);
  }
};

startServer();