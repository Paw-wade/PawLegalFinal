const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');
const path = require('path');
const { getFrontendOriginsList } = require('./utils/frontendOrigins');
const { getKnowledgeDir, getKnowledgeStats } = require('./services/lexiaInternal');
const { isMultiTenantEnabled, connectMaster } = require('./lib/db/master');
const { preloadDefaultModels } = require('./lib/models/registerTenantModels');
const { tenantMiddleware } = require('./middleware/tenant');

// Charger les variables d'environnement
dotenv.config();

const app = express();
let isDatabaseConnected = false;

/* =========================
   MIDDLEWARE
========================= */

const allowedOrigins = getFrontendOriginsList();
console.log('✅ CORS — origines autorisées:', allowedOrigins.join(', ') || '(aucune)');

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
      'x-tenant-slug',
      'X-Tenant-Slug',
    ],
    maxAge: 86400,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.use(tenantMiddleware);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* =========================
   MONGODB
========================= */

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;

    if (!mongoURI) {
      console.warn('⚠️ MONGODB_URI manquant — démarrage en mode dégradé (sans base de données)');
      isDatabaseConnected = false;
      return;
    }

    if (isMultiTenantEnabled()) {
      await connectMaster();
      const mtFlag = (process.env.MULTI_TENANT || '').trim();
      console.log(
        `🏢 Mode multi-tenant activé${mtFlag ? ` (MULTI_TENANT=${mtFlag})` : ' (détecté via MASTER_MONGODB_URI)'}`
      );
      if (!mtFlag && process.env.NODE_ENV !== 'production') {
        console.warn(
          '⚠️  Ajoutez MULTI_TENANT=true dans .env pour éviter toute ambiguïté au déploiement.'
        );
      }
    } else {
      console.log('📦 Mode single-tenant (connexion legacy MONGODB_URI uniquement)');
    }

    const conn = await mongoose.connect(mongoURI);

    preloadDefaultModels();

    console.log(`✅ MongoDB connecté : ${conn.connection.host}${isMultiTenantEnabled() ? ' (connexion legacy / migration)' : ''}`);
    isDatabaseConnected = true;
  } catch (error) {
    console.warn(`⚠️ MongoDB indisponible (${error.message}) — démarrage en mode dégradé`);
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
    version: '1.0.0',
    multiTenant: isMultiTenantEnabled(),
    tenant: req.tenant ? { slug: req.tenant.slug, orgId: req.tenant.orgId } : null,
  });
});

try {
  app.use('/api/tenant', require('./routes/tenant'));
  console.log('✅ Route /api/tenant enregistrée (config, health)');
} catch (e) {
  console.error('❌ Impossible d\'enregistrer /api/tenant:', e.message);
}

app.use('/api/auth', require('./routes/auth'));
// Termine tout /api/auth non géré ci-dessus (NextAuth vit côté Next en dev avec proxy granulaire).
// Sans cela, Express continue la chaîne jusqu’aux routers montés sur /api/* qui font `protect` → 401 sur /session, /providers…
app.use('/api/auth', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route API Express /api/auth inexistante: ${req.originalUrl}`,
  });
});

// ✅ Légifrance — ajoute ces lignes
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
  app.use('/api/otp', require('./routes/otp'));
} catch (e) {}

try {
  app.use('/api/permissions', require('./routes/permissions'));
} catch (e) {}

try {
  app.use('/api/user/dossiers', require('./routes/dossiers'));
} catch (e) {}

try {
  app.use('/api/user/documents', require('./routes/documents'));
} catch (e) {}

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
    database: isDatabaseConnected ? "connectée" : "indisponible",
    multiTenant: isMultiTenantEnabled(),
    tenant: req.tenant ? { slug: req.tenant.slug, orgId: req.tenant.orgId } : null,
  });
});

app.get('/api/health', (req, res) => {
  const { getTenantConnectionsCount } = require('./lib/db/tenants');
  res.json({
    success: true,
    database: isDatabaseConnected ? 'connectée' : 'indisponible',
    multiTenant: isMultiTenantEnabled(),
    tenant: req.tenant
      ? { orgId: req.tenant.orgId, slug: req.tenant.slug, status: req.tenant.status }
      : null,
    tenantConnectionsPooled: isMultiTenantEnabled() ? getTenantConnectionsCount() : 0,
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
      console.log(`🧠 Paw AI (interne) — dossier indexé: ${lexiaKnowledgeDir}`);
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
            `🧠 Paw AI (interne) — fichiers détectés sur disque: total=${s.total}${breakdown ? ` (${breakdown})` : ''}${capInfo}`
          );
        })
        .catch((e) => {
          console.warn(`⚠️ Paw AI (interne) — impossible de compter les fichiers: ${e.message}`);
        });

      if (isDatabaseConnected) {
        const { checkTarificationInstallmentReminders } = require('./utils/tarificationInstallmentNotifications');
        const { runForEachActiveTenant } = require('./lib/tenant/runForEachActiveTenant');
        const runTarificationInstallmentReminders = () => {
          void runForEachActiveTenant(async () => {
            await checkTarificationInstallmentReminders();
          }).catch((err) => {
            console.error('❌ Rappels tarification (multi-tenant):', err.message || err);
          });
        };
        setTimeout(runTarificationInstallmentReminders, 60_000);
        setInterval(runTarificationInstallmentReminders, 24 * 60 * 60 * 1000);
      }
    });

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