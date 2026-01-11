'use client';

import React, { useRef } from 'react';
import { getStatutLabel, getStatutColor, getPrioriteColor, getPrioriteLabel } from '@/lib/dossierUtils';

// Mapping des catégories pour l'affichage
const categories = {
  sejour_titres: {
    label: 'Séjour et titres de séjour',
  },
  contentieux_administratif: {
    label: 'Contentieux administratif',
  },
  asile: {
    label: 'Asile',
  },
  regroupement_familial: {
    label: 'Regroupement familial',
  },
  nationalite_francaise: {
    label: 'Nationalité française',
  },
  eloignement_urgence: {
    label: 'Éloignement et urgence',
  },
  autre: {
    label: 'Autre',
  }
};

const getCategorieLabel = (categorie: string) => {
  return categories[categorie as keyof typeof categories]?.label || categorie.replace(/_/g, ' ');
};

interface DossierDetailViewProps {
  dossier: any;
  variant?: 'client' | 'admin';
  onDownloadPDF?: () => void;
  onPrint?: () => void;
}

export function DossierDetailView({ dossier, variant = 'client' }: DossierDetailViewProps) {
  const componentRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    // Ouvrir la page PDF dédiée dans un nouvel onglet pour l'impression
    const dossierId = dossier._id || dossier.id;
    if (!dossierId) return;
    
    const pdfUrl = `/dossiers/${dossierId}/pdf`;
    window.open(pdfUrl, '_blank');
  };

  const handleDownloadPDF = () => {
    // Ouvrir la page PDF dédiée pour le téléchargement
    const dossierId = dossier._id || dossier.id;
    if (!dossierId) return;
    
    const pdfUrl = `/dossiers/${dossierId}/pdf`;
    // Ouvrir dans un nouvel onglet
    const newWindow = window.open(pdfUrl, '_blank');
    if (newWindow) {
      // Attendre que la page soit chargée puis déclencher l'impression (qui permet de sauvegarder en PDF)
      newWindow.onload = () => {
        setTimeout(() => {
          newWindow.print();
        }, 1000);
      };
    }
  };

  const formatDate = (date: string | Date | null | undefined) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Parser la description pour extraire les informations spécifiques
  const parseDescription = (description: string) => {
    if (!description) return { mainDescription: '', specificFields: [] };
    
    const parts = description.split('--- Informations spécifiques ---');
    const mainDescription = parts[0]?.trim() || '';
    const specificSection = parts[1]?.trim() || '';
    
    const specificFields: Array<{ label: string; value: string }> = [];
    if (specificSection) {
      const lines = specificSection.split('\n');
      lines.forEach(line => {
        const match = line.match(/^(.+?):\s*(.+)$/);
        if (match) {
          specificFields.push({ label: match[1].trim(), value: match[2].trim() });
        }
      });
    }
    
    return { mainDescription, specificFields };
  };

  const { mainDescription, specificFields } = parseDescription(dossier.description || '');

  return (
    <div className="space-y-6">
      {/* Icône PDF avec actions - visible sur la page */}
      <div className="bg-white rounded-lg shadow-md p-6 border-2 border-dashed border-primary/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-red-100 rounded-lg flex items-center justify-center">
              <span className="text-4xl">📄</span>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">
                Récapitulatif du dossier
              </h3>
              <p className="text-sm text-muted-foreground">
                Téléchargez ou imprimez le récapitulatif complet de votre dossier
              </p>
              {dossier.numero && (
                <p className="text-xs text-muted-foreground mt-1">
                  Numéro: <span className="font-semibold">{dossier.numero}</span>
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors shadow-sm"
              title="Imprimer le récapitulatif"
            >
              <span>🖨️</span>
              Imprimer
            </button>
            <button
              onClick={handleDownloadPDF}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-sm"
              title="Télécharger le récapitulatif en PDF"
            >
              <span>📥</span>
              Télécharger PDF
            </button>
          </div>
        </div>
      </div>

      {/* Contenu du dossier - CACHÉ mais présent dans le DOM pour impression/PDF */}
      <div
        ref={componentRef}
        className="hidden"
        style={{ maxWidth: '210mm', margin: '0 auto' }}
      >
        {/* En-tête */}
        <div className="mb-8 pb-6 border-b-2 border-primary">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-primary mb-2">
                {dossier.titre}
              </h1>
              {dossier.numero && (
                <p className="text-sm text-muted-foreground">
                  Numéro de dossier: <span className="font-semibold">{dossier.numero}</span>
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">
                Généré le {new Date().toLocaleDateString('fr-FR')}
              </p>
            </div>
          </div>

          {/* Badges de statut */}
          <div className="flex flex-wrap gap-2 mt-4">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatutColor(dossier.statut)}`}>
              Statut: {getStatutLabel(dossier.statut)}
            </span>
            {dossier.priorite && (
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPrioriteColor(dossier.priorite)}`}>
                Priorité: {getPrioriteLabel(dossier.priorite)}
              </span>
            )}
            {dossier.categorie && (
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                Catégorie: {dossier.categorie.replace(/_/g, ' ')}
              </span>
            )}
          </div>
        </div>

        {/* Informations générales */}
        <div className="section mb-6">
          <h2 className="text-xl font-bold mb-4 text-foreground border-b pb-2">
            Informations Générales
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="info-item">
              <p className="info-label">Numéro de dossier</p>
              <p className="info-value font-semibold">{dossier.numero || dossier._id || 'N/A'}</p>
            </div>
            <div className="info-item">
              <p className="info-label">Titre</p>
              <p className="info-value font-semibold">{dossier.titre || 'Sans titre'}</p>
            </div>
            <div className="info-item">
              <p className="info-label">Catégorie</p>
              <p className="info-value">{getCategorieLabel(dossier.categorie || 'autre')}</p>
            </div>
            <div className="info-item">
              <p className="info-label">Type de demande</p>
              <p className="info-value">{dossier.type || 'Non spécifié'}</p>
            </div>
            <div className="info-item">
              <p className="info-label">Statut</p>
              <p className="info-value">
                <span className={`px-2 py-1 rounded text-xs font-medium ${getStatutColor(dossier.statut)}`}>
                  {getStatutLabel(dossier.statut)}
                </span>
              </p>
            </div>
            <div className="info-item">
              <p className="info-label">Priorité</p>
              <p className="info-value">
                {dossier.priorite ? (
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getPrioriteColor(dossier.priorite)}`}>
                    {getPrioriteLabel(dossier.priorite)}
                  </span>
                ) : 'Non spécifiée'}
              </p>
            </div>
            <div className="info-item">
              <p className="info-label">Date de création</p>
              <p className="info-value">{formatDate(dossier.createdAt)}</p>
            </div>
            <div className="info-item">
              <p className="info-label">Dernière mise à jour</p>
              <p className="info-value">{formatDate(dossier.updatedAt || dossier.createdAt)}</p>
            </div>
            {dossier.dateEcheance && (
              <div className="info-item">
                <p className="info-label">Date d'échéance</p>
                <p className="info-value font-semibold text-orange-600">
                  {formatDate(dossier.dateEcheance)}
                </p>
              </div>
            )}
            {dossier.createdBy && (
              <div className="info-item">
                <p className="info-label">Créé par</p>
                <p className="info-value">
                  {dossier.createdBy.firstName} {dossier.createdBy.lastName}
                  {dossier.createdBy.email && ` (${dossier.createdBy.email})`}
                </p>
              </div>
            )}
            {dossier.assignedTo && (
              <div className="info-item">
                <p className="info-label">Assigné à</p>
                <p className="info-value">
                  {dossier.assignedTo.firstName} {dossier.assignedTo.lastName}
                  {dossier.assignedTo.email && ` (${dossier.assignedTo.email})`}
                  {dossier.assignedTo.role && ` - ${dossier.assignedTo.role}`}
                </p>
              </div>
            )}
            {dossier.teamLeader && (
              <div className="info-item">
                <p className="info-label">Chef d'équipe</p>
                <p className="info-value">
                  {dossier.teamLeader.firstName} {dossier.teamLeader.lastName}
                  {dossier.teamLeader.email && ` (${dossier.teamLeader.email})`}
                </p>
              </div>
            )}
            {dossier.teamMembers && dossier.teamMembers.length > 0 && (
              <div className="info-item col-span-2">
                <p className="info-label">Membres de l'équipe</p>
                <p className="info-value">
                  {dossier.teamMembers.map((member: any, idx: number) => (
                    <span key={idx} className="inline-block mr-2 mb-1">
                      {member.firstName} {member.lastName}
                      {member.email && ` (${member.email})`}
                      {idx < dossier.teamMembers.length - 1 && ', '}
                    </span>
                  ))}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Informations client complètes */}
        <div className="section mb-6">
          <h2 className="text-xl font-bold mb-4 text-foreground border-b pb-2">
            Coordonnées Client
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {dossier.user ? (
              <>
                <div className="info-item">
                  <p className="info-label">Prénom</p>
                  <p className="info-value font-semibold">{dossier.user.firstName || 'N/A'}</p>
                </div>
                <div className="info-item">
                  <p className="info-label">Nom</p>
                  <p className="info-value font-semibold">{dossier.user.lastName || 'N/A'}</p>
                </div>
                <div className="info-item">
                  <p className="info-label">Email</p>
                  <p className="info-value">{dossier.user.email || 'N/A'}</p>
                </div>
                <div className="info-item">
                  <p className="info-label">Téléphone</p>
                  <p className="info-value">{dossier.user.phone || 'N/A'}</p>
                </div>
                {dossier.user.dateNaissance && (
                  <div className="info-item">
                    <p className="info-label">Date de naissance</p>
                    <p className="info-value">{formatDate(dossier.user.dateNaissance)}</p>
                  </div>
                )}
                {dossier.user.lieuNaissance && (
                  <div className="info-item">
                    <p className="info-label">Lieu de naissance</p>
                    <p className="info-value">{dossier.user.lieuNaissance}</p>
                  </div>
                )}
                {dossier.user.nationalite && (
                  <div className="info-item">
                    <p className="info-label">Nationalité</p>
                    <p className="info-value">{dossier.user.nationalite}</p>
                  </div>
                )}
                {dossier.user.sexe && (
                  <div className="info-item">
                    <p className="info-label">Sexe</p>
                    <p className="info-value">
                      {dossier.user.sexe === 'M' ? 'Masculin' : dossier.user.sexe === 'F' ? 'Féminin' : 'Autre'}
                    </p>
                  </div>
                )}
                {dossier.user.numeroEtranger && (
                  <div className="info-item">
                    <p className="info-label">Numéro d'étranger</p>
                    <p className="info-value font-semibold">{dossier.user.numeroEtranger}</p>
                  </div>
                )}
                {dossier.user.numeroTitre && (
                  <div className="info-item">
                    <p className="info-label">Numéro de titre</p>
                    <p className="info-value">{dossier.user.numeroTitre}</p>
                  </div>
                )}
                {dossier.user.typeTitre && (
                  <div className="info-item">
                    <p className="info-label">Type de titre</p>
                    <p className="info-value">{dossier.user.typeTitre}</p>
                  </div>
                )}
                {dossier.user.dateDelivrance && (
                  <div className="info-item">
                    <p className="info-label">Date de délivrance</p>
                    <p className="info-value">{formatDate(dossier.user.dateDelivrance)}</p>
                  </div>
                )}
                {dossier.user.dateExpiration && (
                  <div className="info-item">
                    <p className="info-label">Date d'expiration</p>
                    <p className="info-value">{formatDate(dossier.user.dateExpiration)}</p>
                  </div>
                )}
                {dossier.user.adressePostale && (
                  <div className="info-item col-span-2">
                    <p className="info-label">Adresse postale</p>
                    <p className="info-value">{dossier.user.adressePostale}</p>
                  </div>
                )}
                {dossier.user.ville && (
                  <div className="info-item">
                    <p className="info-label">Ville</p>
                    <p className="info-value">{dossier.user.ville}</p>
                  </div>
                )}
                {dossier.user.codePostal && (
                  <div className="info-item">
                    <p className="info-label">Code postal</p>
                    <p className="info-value">{dossier.user.codePostal}</p>
                  </div>
                )}
                {dossier.user.pays && (
                  <div className="info-item">
                    <p className="info-label">Pays</p>
                    <p className="info-value">{dossier.user.pays}</p>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="info-item">
                  <p className="info-label">Prénom</p>
                  <p className="info-value font-semibold">{dossier.clientPrenom || 'N/A'}</p>
                </div>
                <div className="info-item">
                  <p className="info-label">Nom</p>
                  <p className="info-value font-semibold">{dossier.clientNom || 'N/A'}</p>
                </div>
                <div className="info-item">
                  <p className="info-label">Email</p>
                  <p className="info-value">{dossier.clientEmail || 'N/A'}</p>
                </div>
                <div className="info-item">
                  <p className="info-label">Téléphone</p>
                  <p className="info-value">{dossier.clientTelephone || 'N/A'}</p>
                </div>
                <div className="info-item col-span-2">
                  <p className="info-label text-orange-600 font-semibold">⚠️ Client non inscrit</p>
                  <p className="info-value text-sm text-muted-foreground">
                    Les informations complètes ne sont disponibles que pour les clients inscrits
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Description principale */}
        {mainDescription && (
          <div className="section mb-6">
            <h2 className="text-xl font-bold mb-4 text-foreground border-b pb-2">
              Description
            </h2>
            <div className="description bg-gray-50 p-4 rounded-lg">
              <p className="whitespace-pre-wrap text-foreground">{mainDescription}</p>
            </div>
          </div>
        )}

        {/* Informations spécifiques */}
        {specificFields.length > 0 && (
          <div className="section mb-6">
            <h2 className="text-xl font-bold mb-4 text-foreground border-b pb-2">
              Informations Spécifiques à la Demande
            </h2>
            <div className="bg-gray-50 p-4 rounded-lg">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-left p-2">Champ</th>
                    <th className="text-left p-2">Valeur</th>
                  </tr>
                </thead>
                <tbody>
                  {specificFields.map((field, index) => (
                    <tr key={index} className="border-b">
                      <td className="p-2 font-semibold">{field.label}</td>
                      <td className="p-2">{field.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Documents associés */}
        {dossier.documents && dossier.documents.length > 0 && (
          <div className="section mb-6">
            <h2 className="text-xl font-bold mb-4 text-foreground border-b pb-2">
              Documents Associés ({dossier.documents.length})
            </h2>
            <div className="bg-gray-50 p-4 rounded-lg">
              <ul className="list-disc list-inside space-y-2">
                {dossier.documents.map((doc: any, index: number) => (
                  <li key={index} className="text-foreground">
                    {doc.nomFichier || doc.filename || `Document ${index + 1}`}
                    {doc.url && (
                      <span className="text-xs text-muted-foreground ml-2">
                        ({doc.url})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Messages */}
        {dossier.messages && dossier.messages.length > 0 && (
          <div className="section mb-6">
            <h2 className="text-xl font-bold mb-4 text-foreground border-b pb-2">
              Messages ({dossier.messages.length})
            </h2>
            <div className="space-y-4">
              {dossier.messages.map((msg: any, index: number) => (
                <div key={index} className="bg-gray-50 p-4 rounded-lg border-l-4 border-primary">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-foreground">{msg.sujet || `Message ${index + 1}`}</h3>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(msg.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{msg.message}</p>
                  {msg.expediteur && (
                    <p className="text-xs text-muted-foreground mt-2">
                      De: {msg.expediteur.email || 'N/A'}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes administratives */}
        {dossier.notes && (
          <div className="section mb-6">
            <h2 className="text-xl font-bold mb-4 text-foreground border-b pb-2">
              Notes Administratives
            </h2>
            <div className="bg-yellow-50 p-4 rounded-lg border-l-4 border-yellow-400">
              <p className="whitespace-pre-wrap text-foreground">{dossier.notes}</p>
            </div>
          </div>
        )}

        {/* Motif et catégorie du dossier */}
        <div className="section mb-6">
          <h2 className="text-xl font-bold mb-4 text-foreground border-b pb-2">
            Motif et Nature du Dossier
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="info-item">
              <p className="info-label">Catégorie principale</p>
              <p className="info-value font-semibold">{getCategorieLabel(dossier.categorie || 'autre')}</p>
            </div>
            <div className="info-item">
              <p className="info-label">Type de demande</p>
              <p className="info-value font-semibold">{dossier.type || 'Non spécifié'}</p>
            </div>
            {dossier.categorie && (
              <div className="info-item col-span-2">
                <p className="info-label">Code catégorie</p>
                <p className="info-value text-sm text-muted-foreground">{dossier.categorie}</p>
              </div>
            )}
          </div>
        </div>

        {/* Rendez-vous associés */}
        {dossier.rendezVous && dossier.rendezVous.length > 0 && (
          <div className="section mb-6">
            <h2 className="text-xl font-bold mb-4 text-foreground border-b pb-2">
              Rendez-vous Associés ({dossier.rendezVous.length})
            </h2>
            <div className="space-y-3">
              {dossier.rendezVous.map((rdv: any, index: number) => (
                <div key={index} className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="info-item">
                      <p className="info-label">Date</p>
                      <p className="info-value font-semibold">{formatDate(rdv.date)}</p>
                    </div>
                    {rdv.heure && (
                      <div className="info-item">
                        <p className="info-label">Heure</p>
                        <p className="info-value">{rdv.heure}</p>
                      </div>
                    )}
                    {rdv.motif && (
                      <div className="info-item col-span-2">
                        <p className="info-label">Motif</p>
                        <p className="info-value">{rdv.motif}</p>
                      </div>
                    )}
                    {rdv.statut && (
                      <div className="info-item">
                        <p className="info-label">Statut</p>
                        <p className="info-value">{rdv.statut}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Motif de refus */}
        {dossier.motifRefus && (
          <div className="section mb-6">
            <h2 className="text-xl font-bold mb-4 text-red-600 border-b border-red-200 pb-2">
              Motif de Refus
            </h2>
            <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-400">
              <p className="whitespace-pre-wrap text-foreground">{dossier.motifRefus}</p>
            </div>
          </div>
        )}

        {/* Informations de gestion (Admin uniquement) */}
        {variant === 'admin' && (
          <>
            {dossier.createdFromContactMessage && (
              <div className="section mb-6">
                <h2 className="text-xl font-bold mb-4 text-foreground border-b pb-2">
                  Origine du Dossier
                </h2>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="info-label">Créé depuis un message de contact</p>
                  <p className="info-value text-sm text-muted-foreground">
                    Message ID: {dossier.createdFromContactMessage._id || dossier.createdFromContactMessage}
                  </p>
                </div>
              </div>
            )}
            {dossier.activeCollaborators && dossier.activeCollaborators.length > 0 && (
              <div className="section mb-6">
                <h2 className="text-xl font-bold mb-4 text-foreground border-b pb-2">
                  Collaborateurs Actifs
                </h2>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <ul className="space-y-2">
                    {dossier.activeCollaborators.map((collab: any, index: number) => (
                      <li key={index} className="flex items-center justify-between">
                        <span className="info-value">
                          {collab.user?.firstName} {collab.user?.lastName}
                          {collab.user?.email && ` (${collab.user.email})`}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Rejoint le {formatDate(collab.joinedAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </>
        )}

        {/* Pied de page */}
        <div className="mt-8 pt-6 border-t text-center text-xs text-muted-foreground">
          <p>Document généré automatiquement par Paw Legal</p>
          <p>Ce document est confidentiel et destiné uniquement au client concerné</p>
        </div>
      </div>
    </div>
  );
}

