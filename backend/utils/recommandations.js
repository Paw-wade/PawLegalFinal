/**
 * Logique partagée d'application d'une recommandation acceptée sur un dossier
 * (utilisée côté client authentifié et côté lien de suivi public).
 *
 * À l'acceptation :
 *  - on conserve la description d'origine (rec.descriptionAvant) ;
 *  - on complète la description avec un bloc daté « Ajustement validé le … » ;
 *  - on met à jour la forme juridique dans les champs structurés (champsFormulaire).
 *
 * Mute `dossier` en place. Ne sauvegarde pas (l'appelant fait dossier.save()).
 */
function applyAcceptedRecommendation(dossier, rec) {
  const dateLabel = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  // Traçabilité : mémoriser la description avant modification (une seule fois).
  if (!rec.descriptionAvant) {
    rec.descriptionAvant = dossier.description || '';
  }

  const parts = [];
  if (rec.formeJuridiqueRecommandee) {
    parts.push(`forme juridique recommandée « ${rec.formeJuridiqueRecommandee} »`);
  }
  if (rec.demarcheRecommandee) {
    parts.push(`démarche : ${rec.demarcheRecommandee}`);
  }
  if (parts.length > 0) {
    const bloc = `- Ajustement validé le ${dateLabel} : ${parts.join(' ; ')}.`;
    const base = (dossier.description || '').trim();
    dossier.description = base ? `${base}\n\n${bloc}` : bloc;
  }

  // Mise à jour de la forme juridique structurée (champsFormulaire).
  if (rec.formeJuridiqueRecommandee) {
    if (!Array.isArray(dossier.champsFormulaire)) dossier.champsFormulaire = [];
    const champ = dossier.champsFormulaire.find((c) =>
      /forme_juridique/i.test(String((c && c.nom) || ''))
    );
    if (champ) {
      champ.valeur = rec.formeJuridiqueRecommandee;
    } else {
      dossier.champsFormulaire.push({
        nom: 'forme_juridique_recommandee',
        libelle: 'Forme juridique (recommandée, validée)',
        valeur: rec.formeJuridiqueRecommandee,
      });
    }
    // Mongoose ne détecte pas toujours la mutation d'un sous-tableau d'objets.
    if (typeof dossier.markModified === 'function') dossier.markModified('champsFormulaire');
  }
}

module.exports = { applyAcceptedRecommendation };
