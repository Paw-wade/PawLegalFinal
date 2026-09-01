/**
 * Registre des schémas de fiches de constitution.
 * Ajouter une forme = ajouter un schéma ici (source de vérité unique).
 */
const sarl = require('./schemas/sarl');
const suarl = require('./schemas/suarl');
const sas = require('./schemas/sas');
const sasu = require('./schemas/sasu');
const sa_ag = require('./schemas/sa_ag');
const sa_ca = require('./schemas/sa_ca');
const sci = require('./schemas/sci');

const SCHEMAS = {
  sarl,
  suarl,
  sas,
  sasu,
  sa_ag,
  sa_ca,
  sci,
};

function getSchema(type) {
  return SCHEMAS[String(type || '').toLowerCase()] || null;
}

function listTypes() {
  return Object.values(SCHEMAS).map((s) => ({ type: s.type, titre: s.titre, sousTitre: s.sousTitre || '' }));
}

module.exports = { getSchema, listTypes, SCHEMAS };
