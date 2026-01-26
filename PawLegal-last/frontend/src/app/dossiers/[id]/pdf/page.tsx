'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { dossiersAPI } from '@/lib/api';
import { getStatutLabel, getPrioriteLabel } from '@/lib/dossierUtils';

// Mapping des catégories
const categories = {
  sejour_titres: { label: 'Séjour et titres de séjour' },
  contentieux_administratif: { label: 'Contentieux administratif' },
  asile: { label: 'Asile' },
  regroupement_familial: { label: 'Regroupement familial' },
  nationalite_francaise: { label: 'Nationalité française' },
  eloignement_urgence: { label: 'Éloignement et urgence' },
  autre: { label: 'Autre' }
};

const getCategorieLabel = (categorie: string) => {
  return categories[categorie as keyof typeof categories]?.label || categorie.replace(/_/g, ' ');
};

export default function DossierPDFPage() {
  const params = useParams();
  const router = useRouter();
  const dossierId = params?.id as string;
  const [dossier, setDossier] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dossierId) return;

    const loadDossier = async () => {
      try {
        const response = await dossiersAPI.getDossierById(dossierId);
        if (response.data.success) {
          setDossier(response.data.dossier);
        } else {
          setError('Erreur lors du chargement du dossier');
        }
      } catch (err: any) {
        console.error('Erreur lors du chargement du dossier:', err);
        setError(err.response?.data?.message || 'Erreur lors du chargement du dossier');
      } finally {
        setIsLoading(false);
      }
    };

    loadDossier();
  }, [dossierId]);

  // Fonction pour télécharger le PDF directement
  const handleDownloadPDF = () => {
    window.print();
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Chargement du dossier...</p>
      </div>
    );
  }

  if (error || !dossier) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Dossier non trouvé'}</p>
          <button onClick={() => router.back()} className="px-4 py-2 bg-primary text-white rounded">
            Retour
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style jsx global>{`
        @media print {
          @page {
            margin: 20mm 25mm;
            size: A4;
          }
          
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
            background: white !important;
            font-size: 12px !important;
            overflow: visible !important;
          }
          
          .no-print {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
          }
          
          .pdf-container {
            margin: 0 !important;
            padding: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          
          .page-break {
            page-break-before: always;
            break-before: page;
          }
          
          .avoid-break {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          
          .pdf-section {
            margin-bottom: 18px !important;
          }
          
          h1, h2, h3 {
            page-break-after: avoid;
            break-after: avoid;
            margin-top: 0 !important;
          }
          
          .pdf-header {
            page-break-after: avoid;
            break-after: avoid;
          }
          
          .pdf-footer {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
        
        @media screen {
          html, body {
            margin: 0;
            padding: 0;
            background: white;
          }
          
          .pdf-container {
            max-width: 210mm;
            margin: 0 auto;
            padding: 20mm;
            box-sizing: border-box;
          }
        }
      `}</style>
      
      <div className="pdf-container" style={{ fontFamily: 'Arial, sans-serif', color: '#333', fontSize: '12px' }}>
        {/* En-tête du document */}
        <div className="pdf-header avoid-break" style={{ marginBottom: '25px', borderBottom: '2px solid #f97316', paddingBottom: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#f97316', margin: '0 0 6px 0', lineHeight: '1.2' }}>
                Paw Legal
              </h1>
              <p style={{ fontSize: '11px', color: '#666', margin: '0', lineHeight: '1.4' }}>
                Service d&apos;accompagnement juridique
              </p>
            </div>
            <div style={{ textAlign: 'right', fontSize: '10px', color: '#666', lineHeight: '1.5' }}>
              <p style={{ margin: '2px 0', fontWeight: 'bold' }}>Document généré le</p>
              <p style={{ margin: '2px 0' }}>{new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
              <p style={{ margin: '2px 0' }}>{new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          </div>
          
          <div style={{ marginTop: '18px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#333', margin: '0 0 10px 0', lineHeight: '1.2' }}>
              Dossier n°{dossier.numero || dossier._id}
            </h2>
            <p style={{ fontSize: '13px', color: '#666', margin: 0, lineHeight: '1.4' }}>
              {dossier.titre || 'Sans titre'}
            </p>
          </div>
          
          {/* Coordonnées de l'entreprise */}
          <div style={{ marginTop: '15px', fontSize: '9px', color: '#666', lineHeight: '1.6', padding: '8px', backgroundColor: '#f9fafb', borderRadius: '4px' }}>
            <p style={{ margin: '2px 0', fontWeight: 'bold' }}>Paw Legal</p>
            <p style={{ margin: '2px 0' }}>Service d&apos;accompagnement juridique</p>
            <p style={{ margin: '2px 0' }}>Email: contact@pawlegal.fr</p>
            <p style={{ margin: '2px 0' }}>Téléphone: +33 (0)1 XX XX XX XX</p>
          </div>
        </div>

        {/* Informations du dossier */}
        <div className="pdf-section avoid-break" style={{ marginBottom: '18px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#333', marginBottom: '12px', borderBottom: '1px solid #ddd', paddingBottom: '6px' }}>
            Informations du Dossier
          </h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '11px' }}>
            <div>
              <p style={{ fontWeight: 'bold', color: '#666', fontSize: '11px', margin: '0 0 5px 0', textTransform: 'uppercase' }}>Numéro de dossier</p>
              <p style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: '#f97316' }}>{dossier.numero || dossier._id}</p>
            </div>
            <div>
              <p style={{ fontWeight: 'bold', color: '#666', fontSize: '11px', margin: '0 0 5px 0', textTransform: 'uppercase' }}>Statut actuel</p>
              <p style={{ margin: 0 }}>{getStatutLabel(dossier.statut)}</p>
            </div>
            <div>
              <p style={{ fontWeight: 'bold', color: '#666', fontSize: '11px', margin: '0 0 5px 0', textTransform: 'uppercase' }}>Catégorie</p>
              <p style={{ margin: 0 }}>{getCategorieLabel(dossier.categorie || 'autre')}</p>
            </div>
            <div>
              <p style={{ fontWeight: 'bold', color: '#666', fontSize: '11px', margin: '0 0 5px 0', textTransform: 'uppercase' }}>Type de demande</p>
              <p style={{ margin: 0 }}>{dossier.type || 'Non spécifié'}</p>
            </div>
            <div>
              <p style={{ fontWeight: 'bold', color: '#666', fontSize: '11px', margin: '0 0 5px 0', textTransform: 'uppercase' }}>Priorité</p>
              <p style={{ margin: 0 }}>{getPrioriteLabel(dossier.priorite || 'normale')}</p>
            </div>
            <div>
              <p style={{ fontWeight: 'bold', color: '#666', fontSize: '11px', margin: '0 0 5px 0', textTransform: 'uppercase' }}>Date de création</p>
              <p style={{ margin: 0 }}>{formatDate(dossier.createdAt)}</p>
            </div>
            {dossier.dateEcheance && (
              <div>
                <p style={{ fontWeight: 'bold', color: '#666', fontSize: '11px', margin: '0 0 5px 0', textTransform: 'uppercase' }}>Date d&apos;échéance</p>
                <p style={{ margin: 0, color: '#f97316', fontWeight: 'bold' }}>{formatDate(dossier.dateEcheance)}</p>
              </div>
            )}
            {dossier.updatedAt && (
              <div>
                <p style={{ fontWeight: 'bold', color: '#666', fontSize: '11px', margin: '0 0 5px 0', textTransform: 'uppercase' }}>Dernière mise à jour</p>
                <p style={{ margin: 0 }}>{formatDate(dossier.updatedAt)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Informations du client */}
        <div className="pdf-section avoid-break" style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: '#333', marginBottom: '12px', borderBottom: '1px solid #ddd', paddingBottom: '6px' }}>
            Coordonnées Client
          </h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', fontSize: '11px', lineHeight: '1.5' }}>
            {dossier.user ? (
              <>
                <div>
                  <p style={{ fontWeight: 'bold', color: '#666', fontSize: '10px', margin: '0 0 4px 0', textTransform: 'uppercase' }}>Prénom</p>
                  <p style={{ margin: 0, fontSize: '11px' }}>{dossier.user.firstName || 'N/A'}</p>
                </div>
                <div>
                  <p style={{ fontWeight: 'bold', color: '#666', fontSize: '10px', margin: '0 0 4px 0', textTransform: 'uppercase' }}>Nom</p>
                  <p style={{ margin: 0, fontSize: '11px' }}>{dossier.user.lastName || 'N/A'}</p>
                </div>
                <div>
                  <p style={{ fontWeight: 'bold', color: '#666', fontSize: '10px', margin: '0 0 4px 0', textTransform: 'uppercase' }}>Email</p>
                  <p style={{ margin: 0, fontSize: '11px' }}>{dossier.user.email || 'N/A'}</p>
                </div>
                <div>
                  <p style={{ fontWeight: 'bold', color: '#666', fontSize: '10px', margin: '0 0 4px 0', textTransform: 'uppercase' }}>Téléphone</p>
                  <p style={{ margin: 0, fontSize: '11px' }}>{dossier.user.phone || 'N/A'}</p>
                </div>
                {dossier.user.dateNaissance && (
                  <div>
                    <p style={{ fontWeight: 'bold', color: '#666', fontSize: '10px', margin: '0 0 4px 0', textTransform: 'uppercase' }}>Date de naissance</p>
                    <p style={{ margin: 0, fontSize: '11px' }}>{formatDate(dossier.user.dateNaissance)}</p>
                  </div>
                )}
                {dossier.user.nationalite && (
                  <div>
                    <p style={{ fontWeight: 'bold', color: '#666', fontSize: '10px', margin: '0 0 4px 0', textTransform: 'uppercase' }}>Nationalité</p>
                    <p style={{ margin: 0, fontSize: '11px' }}>{dossier.user.nationalite}</p>
                  </div>
                )}
                {dossier.user.adressePostale && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <p style={{ fontWeight: 'bold', color: '#666', fontSize: '10px', margin: '0 0 4px 0', textTransform: 'uppercase' }}>Adresse</p>
                    <p style={{ margin: 0, fontSize: '11px' }}>
                      {dossier.user.adressePostale}
                      {dossier.user.ville && `, ${dossier.user.ville}`}
                      {dossier.user.codePostal && ` ${dossier.user.codePostal}`}
                      {dossier.user.pays && `, ${dossier.user.pays}`}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <div>
                  <p style={{ fontWeight: 'bold', color: '#666', fontSize: '10px', margin: '0 0 4px 0', textTransform: 'uppercase' }}>Prénom</p>
                  <p style={{ margin: 0, fontSize: '11px' }}>{dossier.clientPrenom || 'N/A'}</p>
                </div>
                <div>
                  <p style={{ fontWeight: 'bold', color: '#666', fontSize: '10px', margin: '0 0 4px 0', textTransform: 'uppercase' }}>Nom</p>
                  <p style={{ margin: 0, fontSize: '11px' }}>{dossier.clientNom || 'N/A'}</p>
                </div>
                <div>
                  <p style={{ fontWeight: 'bold', color: '#666', fontSize: '10px', margin: '0 0 4px 0', textTransform: 'uppercase' }}>Email</p>
                  <p style={{ margin: 0, fontSize: '11px' }}>{dossier.clientEmail || 'N/A'}</p>
                </div>
                <div>
                  <p style={{ fontWeight: 'bold', color: '#666', fontSize: '10px', margin: '0 0 4px 0', textTransform: 'uppercase' }}>Téléphone</p>
                  <p style={{ margin: 0, fontSize: '11px' }}>{dossier.clientTelephone || 'N/A'}</p>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <p style={{ color: '#f97316', fontWeight: 'bold', fontSize: '10px', margin: '8px 0 0 0' }}>
                    ⚠️ Client non inscrit
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Description */}
        {dossier.description && (
          <div className="pdf-section avoid-break" style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: '#333', marginBottom: '12px', borderBottom: '1px solid #ddd', paddingBottom: '6px' }}>
              Description du Dossier
            </h3>
            <div style={{ backgroundColor: '#f9fafb', padding: '12px', borderRadius: '3px', fontSize: '11px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
              {dossier.description}
            </div>
          </div>
        )}

        {/* Documents associés */}
        {dossier.documents && dossier.documents.length > 0 && (
          <div className="pdf-section avoid-break" style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: '#333', marginBottom: '12px', borderBottom: '1px solid #ddd', paddingBottom: '6px' }}>
              Documents Associés ({dossier.documents.length})
            </h3>
            <div style={{ fontSize: '11px' }}>
              <ul style={{ listStyle: 'disc', paddingLeft: '18px', lineHeight: '1.6', margin: 0 }}>
                {dossier.documents.map((doc: any, index: number) => (
                  <li key={index} style={{ marginBottom: '4px' }}>
                    {doc.nom || doc.nomFichier || doc.filename || `Document ${index + 1}`}
                    {doc.typeMime && (
                      <span style={{ color: '#666', fontSize: '10px', marginLeft: '6px' }}>
                        ({doc.typeMime})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Notes administratives */}
        {dossier.notes && (
          <div className="pdf-section avoid-break" style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: '#333', marginBottom: '12px', borderBottom: '1px solid #ddd', paddingBottom: '6px' }}>
              Notes Administratives
            </h3>
            <div style={{ backgroundColor: '#fff7ed', borderLeft: '3px solid #f97316', padding: '12px', fontSize: '11px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
              {dossier.notes}
            </div>
          </div>
        )}

        {/* Motif de refus */}
        {dossier.motifRefus && (
          <div className="pdf-section avoid-break" style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: '#dc2626', marginBottom: '12px', borderBottom: '1px solid #dc2626', paddingBottom: '6px' }}>
              Motif de Refus
            </h3>
            <div style={{ backgroundColor: '#fef2f2', borderLeft: '3px solid #dc2626', padding: '12px', fontSize: '11px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
              {dossier.motifRefus}
            </div>
          </div>
        )}

        {/* Pied de page */}
        <div className="pdf-footer avoid-break" style={{ marginTop: '35px', paddingTop: '18px', borderTop: '2px solid #ddd', textAlign: 'center', fontSize: '9px', color: '#666', lineHeight: '1.6', backgroundColor: '#f9fafb', padding: '15px 10px', borderRadius: '4px' }}>
          <p style={{ margin: '5px 0', fontWeight: 'bold' }}>Paw Legal - Service d&apos;accompagnement juridique</p>
          <p style={{ margin: '5px 0' }}>Email: contact@pawlegal.fr | Téléphone: +33 (0)1 XX XX XX XX</p>
          <p style={{ margin: '12px 0 6px 0', fontStyle: 'italic', fontSize: '8px', color: '#888' }}>
            Ce document est confidentiel et destiné uniquement au client concerné.
          </p>
          <p style={{ margin: '6px 0', fontSize: '8px', color: '#888' }}>
            Document généré le {new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })} à {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>

      {/* Boutons d'action (visible uniquement à l'écran, pas à l'impression) */}
      <div className="no-print" style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 1000, display: 'flex', gap: '10px' }}>
        <button
          onClick={handleDownloadPDF}
          style={{
            padding: '10px 20px',
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          📥 Télécharger PDF
        </button>
        <button
          onClick={() => router.back()}
          style={{
            padding: '10px 20px',
            backgroundColor: '#f97316',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          ← Retour
        </button>
      </div>
    </>
  );
}

