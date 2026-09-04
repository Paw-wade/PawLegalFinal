/** Procuration spéciale pour constituer une société (document en prose - mode « document »). */
const personFields = (prefix, roleLabel) => [
  { name: `${prefix}_nom`, label: `${roleLabel} - Nom et prénom`, type: 'text', required: true },
  { name: `${prefix}_profession`, label: `${roleLabel} - Profession`, type: 'text' },
  { name: `${prefix}_domicile`, label: `${roleLabel} - Demeurant et domicilié(e) à (ville, pays, adresse)`, type: 'text', fullWidth: true },
  { name: `${prefix}_lieu_naissance`, label: `${roleLabel} - Lieu de naissance (ville, pays)`, type: 'text' },
  { name: `${prefix}_date_naissance`, label: `${roleLabel} - Date de naissance (en lettres)`, type: 'text' },
  { name: `${prefix}_nationalite`, label: `${roleLabel} - Nationalité`, type: 'text' },
  { name: `${prefix}_piece_type`, label: `${roleLabel} - Type de pièce`, type: 'radio', options: [{ value: 'passeport', label: 'Passeport' }, { value: 'cni', label: "Carte nationale d'identité" }] },
  { name: `${prefix}_piece_num`, label: `${roleLabel} - Numéro de la pièce`, type: 'text' },
  { name: `${prefix}_piece_delivrance`, label: `${roleLabel} - Délivré(e) le (en lettres)`, type: 'text' },
  { name: `${prefix}_matrimonial`, label: `${roleLabel} - Statut et régime matrimonial`, type: 'text', fullWidth: true },
];

const personParagraph = (data, prefix, h) => {
  const g = (k) => h.esc(data[`${prefix}_${k}`] || '');
  const pieceLabel = data[`${prefix}_piece_type`] === 'cni' ? "carte nationale d'identité" : 'passeport';
  return `<p>${g('nom') || '……'}, ${g('profession') || '……'}, demeurant et domicilié(e) à ${g('domicile') || '……'}, né(e) à ${g('lieu_naissance') || '……'}, le ${g('date_naissance') || '……'}, de nationalité ${g('nationalite') || '……'}, titulaire du ${pieceLabel} n° ${g('piece_num') || '……'}, délivré(e) le ${g('piece_delivrance') || '……'}. ${g('matrimonial') ? g('matrimonial') + ', ' : ''}tel qu'il/elle le déclare.</p>`;
};

module.exports = {
  type: 'procuration',
  titre: 'Procuration spéciale pour constituer société',
  sousTitre: '',
  sections: [
    { id: 'annee', titre: 'Acte', fields: [{ name: 'annee', label: "L'AN (en lettres)", type: 'text', placeholder: 'Ex. DEUX MILLE VINGT-SIX' }] },
    { id: 'mandant', titre: 'Mandant (soussigné)', fields: personFields('m', 'Mandant') },
    { id: 'mandataire', titre: 'Mandataire spécial', fields: personFields('ma', 'Mandataire') },
    {
      id: 'societe', titre: 'Société à constituer',
      fields: [
        { name: 's_denomination', label: 'Dénomination sociale', type: 'text', required: true },
        { name: 's_forme', label: 'Forme de la société', type: 'text', placeholder: 'Ex. SARL, SUARL, SA…' },
        { name: 's_capital', label: 'Capital', type: 'montant' },
        { name: 's_siege', label: 'Siège social à Dakar (adresse)', type: 'text', fullWidth: true },
        { name: 'pourcentage', label: 'Souscription au capital (%)', type: 'percent' },
        { name: 'gerant_nom', label: 'Gérant(e) dont la nomination est acceptée', type: 'text' },
      ],
    },
  ],
  signature: false,
  document(data, h) {
    const s = (k) => h.esc(data[k] || '');
    return `
      <p class="center">Procuration spéciale pour constituer société</p>
      <p><strong>Monsieur/Madame</strong> ${s('m_nom') || '……'}<br><strong>Au profit de Monsieur/Madame</strong> ${s('ma_nom') || '……'}</p>
      <p><strong>L'AN ${s('annee') || '……………………'}</strong></p>
      <p><strong>LE/LA SOUSSIGNÉ(E) :</strong></p>
      ${personParagraph(data, 'm', h)}
      <p>A, par la présente, constitué pour mandataire spécial :</p>
      ${personParagraph(data, 'ma', h)}
      <p>À qui il/elle donne pouvoir de, pour lui/elle et en son nom, à l'effet de :</p>
      <ul>
        <li>Signer les statuts authentiques et tous autres documents de la société en formation devant avoir pour dénomination sociale <strong>${s('s_denomination') || '……'}</strong>, ${s('s_forme') || '……'}, au capital de ${h.fmtMontant(data.s_capital) || '……'}, et devant avoir son siège social à Dakar (Sénégal), ${s('s_siege') || '……'} ;</li>
        <li>Souscrire à ${s('pourcentage') || '……'} % du capital social ;</li>
        <li>Accepter la nomination de ${s('gerant_nom') || '……'} en qualité de gérant(e) de la société, pour une durée indéterminée et jusqu'à décision contraire des associés ;</li>
        <li>Passer et signer tous actes et toutes pièces, élire domicile, et généralement faire tout ce qu'un mandataire jugera utile et nécessaire dans le cadre strict de la constitution de la société.</li>
      </ul>
      <p style="margin-top:24px">Monsieur / Madame</p>
      <p><strong>Bon pour pouvoirs</strong></p>
      <p>Signature :</p>
      <div style="height:70px;border:1px dashed #bbb;border-radius:4px;max-width:240px;"></div>
    `;
  },
};
