/**
 * Construit une URI MongoDB avec un nom de base explicite (même cluster Atlas).
 * @param {string} baseUri
 * @param {string} databaseName
 * @returns {string|null}
 */
function resolveMongoUriWithDatabase(baseUri, databaseName) {
  if (!baseUri || !databaseName) return null;
  const uri = baseUri.trim();
  const qIndex = uri.indexOf('?');
  const query = qIndex >= 0 ? uri.slice(qIndex) : '';
  const pathUri = qIndex >= 0 ? uri.slice(0, qIndex) : uri;

  // mongodb[+srv]://credentials@host[/optionalDb]
  const match = pathUri.match(/^(mongodb(?:\+srv)?:\/\/[^/]+)(?:\/[^/]*)?$/i);
  if (match) {
    return `${match[1]}/${databaseName}${query}`;
  }

  const base = pathUri.replace(/\/+$/, '');
  return `${base}/${databaseName}${query}`;
}

/**
 * Indique si l’URI contient un nom de base (évite la connexion implicite à `test`).
 */
function mongoUriHasDatabase(uri) {
  if (!uri) return false;
  const trimmed = String(uri).trim();
  const qIndex = trimmed.indexOf('?');
  const pathPart = qIndex >= 0 ? trimmed.slice(0, qIndex) : trimmed;
  return /^(mongodb(?:\+srv)?:\/\/[^/]+)\/[^/]+/i.test(pathPart);
}

/**
 * Ajoute /{databaseName} avant les query params si absent.
 */
function ensureMongoUriDatabase(uri, databaseName) {
  if (!uri || !databaseName) return uri;
  if (mongoUriHasDatabase(uri)) return String(uri).trim();
  return resolveMongoUriWithDatabase(uri, databaseName);
}

module.exports = {
  resolveMongoUriWithDatabase,
  mongoUriHasDatabase,
  ensureMongoUriDatabase,
};
