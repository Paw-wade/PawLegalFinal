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

module.exports = { resolveMongoUriWithDatabase };
