/**
 * Registre des schémas de fiches de constitution.
 * Ajouter une forme = ajouter un schéma ici (source de vérité unique).
 */
const sarl = require('./schemas/sarl');
const suarl = require('./schemas/suarl');
const sas = require('./schemas/sas');
const sasu = require('./schemas/sasu');

const SCHEMAS = {
  sarl,
  suarl,
  sas,
  sasu,
};

function getSchema(type) {
  return SCHEMAS[String(type || '').toLowerCase()] || null;
}

function listTypes() {
  return Object.values(SCHEMAS).map((s) => ({ type: s.type, titre: s.titre, sousTitre: s.sousTitre || '' }));
}

module.exports = { getSchema, listTypes, SCHEMAS };
