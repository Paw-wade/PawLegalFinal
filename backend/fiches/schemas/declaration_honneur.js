/** Déclaration sur l'honneur (document en prose - mode « document »). */
module.exports = {
  type: 'declaration_honneur',
  titre: "Déclaration sur l'honneur",
  sousTitre: '',
  // Champs saisis dans le formulaire :
  sections: [
    {
      id: 'declarant', titre: 'Déclarant',
      fields: [
        { name: 'nom_prenom', label: 'Prénom et nom', type: 'text', required: true },
        { name: 'adresse', label: 'Adresse (domicile)', type: 'text', required: true, fullWidth: true },
        { name: 'telephone', label: 'Téléphone', type: 'text' },
        { name: 'date', label: 'Fait à Dakar, le', type: 'text', placeholder: 'Ex. 1er septembre 2026', autoToday: true },
      ],
    },
  ],
  signature: false,
  // Rendu du PDF (le formulaire ci-dessus alimente {{...}}) :
  document(data, h) {
    const nom = h.esc(data.nom_prenom || '');
    const adr = h.esc(data.adresse || '');
    const tel = h.esc(data.telephone || '');
    const date = h.esc(data.date || '');
    return `
      <p>${nom}<br>${adr}${tel ? `<br>${tel}` : ''}</p>
      <p class="right">Dakar, le ${date || '……………………'}</p>
      <p>À Madame le Greffier en chef chargé du Registre du Commerce et du Crédit Mobilier,</p>
      <p class="center">Déclaration sur l'honneur</p>
      <p>Je soussigné(e), <strong>${nom || '……………………'}</strong>, domicilié(e) à ${adr || '……………………'}, atteste sur l'honneur n'être frappé(e) d'aucune des interdictions ci-après :</p>
      <ul>
        <li>Interdiction générale, définitive ou temporaire, prononcée par une juridiction de l'un des États parties, que cette interdiction ait été prononcée comme peine principale ou comme peine complémentaire ;</li>
        <li>Interdiction prononcée par une juridiction professionnelle ;</li>
        <li>Interdiction par l'effet d'une condamnation définitive à une peine privative de liberté pour un crime de droit commun, ou à une peine d'au moins trois mois d'emprisonnement non assortie de sursis pour un délit contre les biens ou une infraction en matière économique ou financière.</li>
      </ul>
      <p>Je sais que cette déclaration pourra être produite en justice et que toute fausse déclaration de ma part m'exposera à des sanctions pénales.</p>
      <p>Fait pour servir et valoir ce que de droit.</p>
      <p class="right">Dakar, le ${date || '……………………'}</p>
      <p class="right">Signature :</p>
      <div style="height:70px;border:1px dashed #bbb;border-radius:4px;max-width:240px;margin-left:auto;"></div>
    `;
  },
};
