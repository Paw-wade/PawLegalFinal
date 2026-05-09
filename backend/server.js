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
      'x-forum-visitor-id',
    ],
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
      console.warn('⚠️ MONGODB_URI manquant — démarrage en mode dégradé (sans base de données)');
      isDatabaseConnected = false;
      return;
    }

    const conn = await mongoose.connect(mongoURI);

    console.log(`✅ MongoDB connecté : ${conn.connection.host}`);
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
    message: 'API Cabinet Juridique est en ligne',
    version: '1.0.0'
  });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/auth', require('./routes/auth'));

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
  console.log('✅ Route /api/lexia enregistrée');
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
      console.log(`🧠 Paw AI (interne) — dossier indexé: ${lexiaKnowledgeDir}`);
      getKnowledgeStats()
        .then((s) => {
          const breakdown = Object.entries(s.byExt || {})
            .filter(([, v]) => v > 0)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ');
          const capInfo =
            s.indexTruncated != null && s.indexedFilesCap != null
              ? ` | indexRAM≤${s.indexedFilesCap} fichier(s)${s.indexTruncated ? ' (tronqué)' : ''}`
              : '';
          console.log(
            `🧠 Paw AI (interne) — fichiers détectés sur disque: total=${s.total}${breakdown ? ` (${breakdown})` : ''}${capInfo}`
          );
        })
        .catch((e) => {
          console.warn(`⚠️ Paw AI (interne) — impossible de compter les fichiers: ${e.message}`);
        });
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