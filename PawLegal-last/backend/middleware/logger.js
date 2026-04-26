const Log = require('../models/Log');

// Middleware pour logger les actions
const logAction = async (req, action, description, metadata = {}) => {
  try {
    if (!req.user) {
      return; // Pas de log si l'utilisateur n'est pas authentifié
    }

    await Log.create({
      action,
      user: req.user.id,
      userEmail: req.user.email,
      description,
      ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
      userAgent: req.get('user-agent'),
      metadata: {
        method: req.method,
        path: req.path,
        ...metadata
      }
    });
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement du log:', error);
    // Ne pas bloquer la requête si le log échoue
  }
};

// Middleware pour logger automatiquement certaines actions
const autoLogger = (action, getDescription, getMetadata) => {
  return async (req, res, next) => {
    // Exécuter la route d'abord
    const originalSend = res.json;
    res.json = function(data) {
      // Si la requête a réussi (status 200-299)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const description = typeof getDescription === 'function' 
          ? getDescription(req, data) 
          : getDescription || `${req.method} ${req.path}`;
        
        const metadata = typeof getMetadata === 'function'
          ? getMetadata(req, data)
          : getMetadata || {};

        logAction(req, action, description, metadata);
      }
      return originalSend.call(this, data);
    };
    next();
  };
};

module.exports = { logAction, autoLogger };


