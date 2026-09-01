/**
 * Registre des schémas de fiches de constitution.
 * Ajouter une forme = ajouter un schéma ici (source de vérité unique).
 */
const sarl = require('./schemas/sarl');

const SCHEMAS = {
  sarl,
};

function getSchema(type) {
  return SCHEMAS[String(type || '').toLowerCase()] || null;
}

function listTypes() {
  return Object.values(SCHEMAS).map((s) => ({ type: s.type, titre: s.titre, sousTitre: s.sousTitre || '' }));
}

module.exports = { getSchema, listTypes, SCHEMAS };
