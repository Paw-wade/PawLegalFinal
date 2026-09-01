'use client';

import React, { useRef, useEffect } from 'react';
import { UserAvatarDisplay } from '@/components/UserAvatarDisplay';
import Link from 'next/link';
import { getStatutLabelWithEtapes, getStatutColor, getPrioriteColor, getPrioriteLabel } from '@/lib/dossierUtils';
import { ValiderDemandeButton } from '@/components/demande/ValiderDemandeButton';
import { TelechargerDossierPdfButton } from '@/components/demande/TelechargerDossierPdfButton';
import { LienSuivi } from '@/components/demande/LienSuivi';
import { RecommandationsPanel } from '@/components/demande/RecommandationsPanel';
import { FichesPanel } from '@/components/fiches/FichesPanel';

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
  constitution_societe: {
    label: 'Constitution de société',
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
  variant?: 'client' | 'admin' | 'partenaire';
  /** Pièces du dossier (toutes origines) — prioritaire sur dossier.documents si fourni */
  dossierFiles?: any[];
}

export function DossierDetailView({ dossier, variant = 'client', dossierFiles }: DossierDetailViewProps) {
  const componentRef = useRef<HTMLDivElement>(null);

  /** Depuis la liste dossiers : lien avec #fiche-client pour cibler la section contact */
  useEffect(() => {
    if (typeof window === 'undefined' || !dossier) return;
    if (window.location.hash !== '#fiche-client') return;
    const t = window.setTimeout(() => {
      document.getElementById('fiche-client')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
    return () => window.clearTimeout(t);
  }, [dossier?._id, dossier?.id]);

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

  // Nouveaux dossiers : les rubriques sont structurées (champsFormulaire) et la description est pure.
  // Anciens dossiers : on retombe sur le parsing de l'ancien bloc « Informations spécifiques ».
  const hasStructuredFields = Array.isArray(dossier.champsFormulaire) && dossier.champsFormulaire.length > 0;
  const parsedDescription = parseDescription(dossier.description || '');
  const mainDescription = hasStructuredFields ? (dossier.description || '').trim() : parsedDescription.mainDescription;
  const specificFields = hasStructuredFields
    ? dossier.champsFormulaire.map((c: any) => ({ label: c.libelle || c.nom || '', value: c.valeur || '' }))
    : parsedDescription.specificFields;

  return (
    <div className="min-w-0 space-y-6">
      {/* Icône PDF avec actions — responsive: stack sur mobile */}
      <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 border-2 border-dashed border-primary/30">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-2xl sm:text-4xl">📄</span>
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-semibold text-foreground mb-0.5 sm:mb-1">
                Récapitulatif du dossier
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Téléchargez ou imprimez le récapitulatif complet
              </p>
              {dossier.numero && (
                <p className="text-xs text-muted-foreground mt-1">
                  Numéro: <span className="font-semibold">{dossier.numero}</span>
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-shrink-0">
            {(() => {
              const dossierId = dossier._id || dossier.id;
              const basePath = variant === 'admin' ? '/admin' : variant === 'partenaire' ? '/partenaire' : '/client';
              return (
                <>
                  {variant === 'admin' && dossier.statut === 'en_attente_validation' && dossierId ? (
                    <ValiderDemandeButton dossierId={dossierId} />
                  ) : null}
                  <TelechargerDossierPdfButton dossierId={dossierId} numero={dossier.numero} className="w-full sm:w-auto" />
                  <Link
                    href={`${basePath}/dossiers/${dossierId}/recap`}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] w-full sm:w-auto bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors shadow-sm text-sm font-medium"
                    title="Voir le récit récapitulatif complet"
                  >
                    <span>📋</span>
                    Récit récapitulatif
                  </Link>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Informations de la demande (visible) : description + rubriques du formulaire */}
      {(mainDescription || specificFields.length > 0) && (
        <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Informations de la demande
          </h3>
          {mainDescription && (
            <div className="mb-4">
              <p className="mb-1 text-xs text-gray-500">Description</p>
              <p className="whitespace-pre-wrap break-words text-sm text-foreground">{mainDescription}</p>
            </div>
          )}
          {specificFields.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-gray-500">Informations du formulaire</p>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {specificFields.map((f, i) => (
                  <div key={i} className="min-w-0">
                    <dt className="text-xs text-gray-500">{f.label}</dt>
                    <dd className="whitespace-pre-wrap break-words text-sm font-medium text-foreground">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      )}

      {/* Recommandations (création d'entreprise) — création admin, décision client */}
      {(variant === 'admin' || variant === 'client') && dossier.categorie === 'constitution_societe' && (
        <RecommandationsPanel
          dossierId={String(dossier._id || dossier.id || '')}
          categorie={dossier.categorie}
          variant={variant}
          recommandations={dossier.recommandations}
        />
      )}

      {/* Fiches de constitution (création d'entreprise) — demande admin, remplissage client */}
      {(variant === 'admin' || variant === 'client') && dossier.categorie === 'constitution_societe' && (
        <FichesPanel
          dossierId={String(dossier._id || dossier.id || '')}
          categorie={dossier.categorie}
          variant={variant}
        />
      )}

      {/* Lien de suivi public — visible côté admin et client (à partager / suivi sans connexion) */}
      {(variant === 'admin' || variant === 'client') && dossier.suiviToken && (
        <LienSuivi token={dossier.suiviToken} />
      )}

      {/* Messages du demandeur (envoyés depuis le lien de suivi) — visible côté admin */}
      {variant === 'admin' && Array.isArray(dossier.messages) && (() => {
        const msgs = (dossier.messages as any[])
          .filter((m) => m && typeof m === 'object' && typeof m.message === 'string')
          .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        if (msgs.length === 0) return null;
        return (
          <div className="min-w-0 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 sm:p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-indigo-900">
              💬 Messages du demandeur
            </h3>
            <ul className="space-y-3">
              {msgs.map((m, i) => (
                <li key={m._id || m.id || i} className="rounded-lg border border-indigo-100 bg-white p-3">
                  <p className="whitespace-pre-wrap break-words text-sm text-foreground">{m.message}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {m.name && <span className="font-medium text-indigo-900">{m.name}</span>}
                    {m.email && m.email !== 'non-renseigne@adapapers.fr' && (
                      <a href={`mailto:${m.email}`} className="text-indigo-700 hover:underline">{m.email}</a>
                    )}
                    {m.phone && <span>{m.phone}</span>}
                    {m.createdAt && (
                      <span>
                        {new Date(m.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      {/* Formule tarifaire — visible uniquement côté admin (masquée pour client et partenaire) */}
      {variant === 'admin' && (
        <div className="min-w-0 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50/80 p-4 sm:p-5 shadow-sm">
          <h3 className="text-sm font-bold text-amber-900 uppercase tracking-wide mb-2 break-words">
            Tarification (interne)
          </h3>
          {dossier.formuleTarifaire ? (
            <div className="min-w-0 space-y-1">
              <p className="text-base font-semibold text-gray-900 break-words">
                Formule choisie par le client :{' '}
                <span className="text-orange-700">
                  {dossier.formuleTarifaire === 'premium' ? 'Premium' : 'Standard'}
                </span>
              </p>
              {dossier.formuleTarifaireChoisieAt && (
                <p className="text-xs text-muted-foreground">
                  Enregistrée le {formatDate(dossier.formuleTarifaireChoisieAt)}
                </p>
              )}
            </div>
          ) : (
            <p className="break-words text-sm text-amber-900/90">
              Aucune formule sélectionnée par le client pour l’instant. Une relance peut être envoyée lorsque le dossier passe en « En cours ».
            </p>
          )}
        </div>
      )}

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
              Statut: {getStatutLabelWithEtapes(dossier.statut, dossier.etapesSupplementaires)}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="info-item min-w-0">
              <p className="info-label">Numéro de dossier</p>
              <p className="info-value font-semibold break-words">{dossier.numero || dossier._id || 'N/A'}</p>
            </div>
            <div className="info-item min-w-0">
              <p className="info-label">Titre</p>
              <p className="info-value font-semibold break-words">{dossier.titre || 'Sans titre'}</p>
            </div>
            <div className="info-item min-w-0">
              <p className="info-label">Catégorie</p>
              <p className="info-value break-words">{getCategorieLabel(dossier.categorie || 'autre')}</p>
            </div>
            <div className="info-item min-w-0">
              <p className="info-label">Type de demande</p>
              <p className="info-value break-words">{dossier.type || 'Non spécifié'}</p>
            </div>
            <div className="info-item">
              <p className="info-label">Statut</p>
              <p className="info-value">
                <span className={`px-2 py-1 rounded text-xs font-medium ${getStatutColor(dossier.statut)}`}>
                  {getStatutLabelWithEtapes(dossier.statut, dossier.etapesSupplementaires)}
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
              <div className="info-item col-span-1 sm:col-span-2 min-w-0">
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

        {/* Informations client complètes — ancre #fiche-client (liste dossiers → fiche contact) */}
        <div id="fiche-client" className="section mb-6 scroll-mt-20">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4 text-foreground border-b pb-4">
            {dossier.user ? (
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden bg-primary/10 border-2 border-primary/20">
                  <UserAvatarDisplay
                    user={dossier.user}
                    alt={`${dossier.user.firstName || ''} ${dossier.user.lastName || ''}`.trim() || 'Client'}
                    fallback={
                      <span className="text-lg font-bold text-primary">
                        {`${dossier.user.firstName?.[0] || ''}${dossier.user.lastName?.[0] || ''}`.trim() || '👤'}
                      </span>
                    }
                  />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold">Coordonnées Client</h2>
                  <p className="text-sm text-muted-foreground truncate">
                    {[dossier.user.firstName, dossier.user.lastName].filter(Boolean).join(' ') || dossier.user.email}
                  </p>
                </div>
              </div>
            ) : (
              <h2 className="text-xl font-bold">Coordonnées Client</h2>
            )}
          </div>
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
            <div className="bg-gray-50 p-4 rounded-lg overflow-x-auto">
              <table className="w-full min-w-0 text-sm">
                <thead>
                  <tr>
                    <th className="text-left p-2 align-top w-[35%] max-w-[40%]">Champ</th>
                    <th className="text-left p-2 align-top">Valeur</th>
                  </tr>
                </thead>
                <tbody>
                  {specificFields.map((field, index) => (
                    <tr key={index} className="border-b">
                      <td className="p-2 font-semibold break-words align-top">{field.label}</td>
                      <td className="p-2 break-words align-top">{field.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Documents associés (références dossier ou liste complète via dossierFiles) */}
        {(() => {
          const fromProp = Array.isArray(dossierFiles) && dossierFiles.length > 0 ? dossierFiles : null;
          const fromDossier =
            Array.isArray(dossier.documents) && dossier.documents.length > 0 ? dossier.documents : null;
          const list = fromProp || fromDossier;
          if (!list?.length) return null;
          return (
            <div className="section mb-6">
              <h2 className="text-xl font-bold mb-4 text-foreground border-b pb-2">
                Documents associés ({list.length})
              </h2>
              <div className="bg-gray-50 p-4 rounded-lg">
                <ul className="list-disc list-inside space-y-2">
                  {list.map((doc: any, index: number) => (
                    <li key={doc._id || doc.id || index} className="text-foreground">
                      {doc.nom || doc.nomFichier || doc.filename || `Document ${index + 1}`}
                      {doc.user && (doc.user.firstName || doc.user.email) && (
                        <span className="text-xs text-muted-foreground ml-2">
                          — {doc.user.firstName || ''} {doc.user.lastName || ''}{' '}
                          {doc.user.email ? `(${doc.user.email})` : ''}
                        </span>
                      )}
                      {doc.url && (
                        <span className="text-xs text-muted-foreground ml-2">({doc.url})</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })()}

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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="info-item min-w-0">
              <p className="info-label">Catégorie principale</p>
              <p className="info-value font-semibold break-words hyphens-auto">{getCategorieLabel(dossier.categorie || 'autre')}</p>
            </div>
            <div className="info-item min-w-0">
              <p className="info-label">Type de demande</p>
              <p className="info-value font-semibold break-words hyphens-auto">{dossier.type || 'Non spécifié'}</p>
            </div>
            {dossier.categorie && (
              <div className="info-item col-span-1 sm:col-span-2 min-w-0">
                <p className="info-label">Code catégorie</p>
                <p className="info-value text-sm text-muted-foreground break-all">{dossier.categorie}</p>
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
          <p>Document généré automatiquement par Ada Papers</p>
          <p>Ce document est confidentiel et destiné uniquement au client concerné</p>
        </div>
      </div>
    </div>
  );
}

