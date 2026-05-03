const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');
const path = require('path');
const { getFrontendOriginsList } = require('./utils/frontendOrigins');

// Charger les variables d'environnement
dotenv.config();

const app = express();

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
      console.error('❌ MONGODB_URI manquant');
      process.exit(1);
    }

    const conn = await mongoose.connect(mongoURI);

    console.log(`✅ MongoDB connecté : ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ Erreur MongoDB:', error.message);
    process.exit(1);
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

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route non trouvée',
  });
});

/* =========================
   START SERVER (FIXÉ)
========================= */

const startServer = async () => {
  try {
    await connectDB();

    const PORT = process.env.PORT || 3005;

    app.listen(PORT, () => {
      console.log(`🚀 Serveur démarré sur le port ${PORT}`);
      console.log(`📡 API: /api`);
    });

  } catch (error) {
    console.error('❌ Erreur serveur:', error);
    process.exit(1);
  }
};

startServer();

/* =========================
   HEALTHCHECK
========================= */

app.get("/api-status", (req, res) => {
  res.json({
    success: true,
    message: "API active",
    database: "connectée"
  });
});
