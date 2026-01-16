'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { dossiersAPI } from '@/lib/api';
import { ArrowLeft, FileText, Download, Calendar, User, FileCheck, MessageSquare, CheckCircle, Clock } from 'lucide-react';
import Link from 'next/link';

export default function PartenaireDossierRecapPage() {
  const params = useParams();
  const dossierId = params.id as string;
  
  const [recap, setRecap] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  
  useEffect(() => {
    if (dossierId) {
      loadRecap();
    }
  }, [dossierId]);
  
  const loadRecap = async () => {
    try {
      setLoading(true);
      const response = await dossiersAPI.getDossierRecap(dossierId);
      if (response.data.success) {
        setRecap(response.data.recap);
      }
    } catch (error) {
      console.error('Erreur lors du chargement du récit:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleDownloadPDF = async () => {
    try {
      setDownloadingPDF(true);
      const response = await dossiersAPI.downloadDossierRecapPDF(dossierId);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Recit_Dossier_${recap?.dossier?.numero || dossierId}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Erreur lors du téléchargement du PDF:', error);
      alert(error.response?.data?.message || 'Erreur lors du téléchargement du PDF');
    } finally {
      setDownloadingPDF(false);
    }
  };
  
  const formatDate = (date: any) => {
    if (!date) return 'N/A';
    try {
      return new Date(date).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return 'N/A';
    }
  };
  
  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  if (!recap) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <p className="text-gray-500 text-lg">Impossible de charger le récit récapitulatif</p>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* En-tête avec bouton retour et téléchargement */}
        <div className="flex items-center justify-between mb-6">
          <Link 
            href={`/partenaire/dossiers/${dossierId}`}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour au dossier
          </Link>
          <button
            onClick={handleDownloadPDF}
            disabled={downloadingPDF}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {downloadingPDF ? 'Génération...' : 'Télécharger en PDF'}
          </button>
        </div>
        
        {/* Récit récapitulatif */}
        <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
          {/* Titre principal */}
          <div className="mb-8 pb-6 border-b border-gray-200">
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Récit Récapitulatif du Dossier
            </h1>
            <p className="text-lg text-gray-600">
              {recap.dossier.numero || 'Sans numéro'} - {recap.dossier.titre || 'Sans titre'}
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Généré le {new Date().toLocaleDateString('fr-FR')} à {new Date().toLocaleTimeString('fr-FR')}
            </p>
          </div>
          
          {/* Informations du dossier */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center gap-2">
              <FileText className="w-6 h-6 text-primary" />
              Informations du Dossier
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 mb-1">Numéro</p>
                <p className="font-semibold">{recap.dossier.numero || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Statut</p>
                <p className="font-semibold">{recap.dossier.statut || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Catégorie</p>
                <p className="font-semibold">{recap.dossier.categorie || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Priorité</p>
                <p className="font-semibold">{recap.dossier.priorite || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Créé le</p>
                <p className="font-semibold">{formatDate(recap.dossier.createdAt)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Dernière mise à jour</p>
                <p className="font-semibold">{formatDate(recap.dossier.updatedAt)}</p>
              </div>
              {recap.dossier.dateEcheance && (
                <div>
                  <p className="text-sm text-gray-500 mb-1">Échéance</p>
                  <p className="font-semibold">{formatDate(recap.dossier.dateEcheance)}</p>
                </div>
              )}
            </div>
            {recap.dossier.description && (
              <div className="mt-4">
                <p className="text-sm text-gray-500 mb-1">Description</p>
                <p className="text-gray-700">{recap.dossier.description}</p>
              </div>
            )}
          </section>
          
          {/* Informations client */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center gap-2">
              <User className="w-6 h-6 text-primary" />
              Informations Client
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 mb-1">Nom</p>
                <p className="font-semibold">{recap.client.nom || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Email</p>
                <p className="font-semibold">{recap.client.email || 'N/A'}</p>
              </div>
              {recap.client.telephone && (
                <div>
                  <p className="text-sm text-gray-500 mb-1">Téléphone</p>
                  <p className="font-semibold">{recap.client.telephone}</p>
                </div>
              )}
            </div>
          </section>
          
          {/* Documents */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center gap-2">
              <FileCheck className="w-6 h-6 text-primary" />
              Documents ({recap.documents.total})
            </h2>
            {recap.documents.liste && recap.documents.liste.length > 0 ? (
              <div className="space-y-3">
                {recap.documents.liste.map((doc: any, idx: number) => (
                  <div key={idx} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold">{doc.nom}</p>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mt-2">
                          <span>Type: {doc.type}</span>
                          {doc.taille && <span>Taille: {formatFileSize(doc.taille)}</span>}
                          <span>Date: {formatDate(doc.dateUpload)}</span>
                        </div>
                        {doc.description && (
                          <p className="text-sm text-gray-500 mt-2">{doc.description}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">Aucun document</p>
            )}
          </section>
          
          {/* Tâches */}
          {recap.taches.total > 0 && (
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center gap-2">
                <CheckCircle className="w-6 h-6 text-primary" />
                Tâches ({recap.taches.total})
              </h2>
              <div className="mb-4 flex items-center gap-4">
                <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-lg text-sm">
                  En cours: {recap.taches.enCours}
                </span>
                <span className="px-3 py-1 bg-green-100 text-green-800 rounded-lg text-sm">
                  Terminées: {recap.taches.terminees}
                </span>
              </div>
              <div className="space-y-3">
                {recap.taches.liste.slice(0, 10).map((task: any, idx: number) => (
                  <div key={idx} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold">{task.titre}</p>
                        {task.description && (
                          <p className="text-sm text-gray-600 mt-1">{task.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mt-2">
                          <span>Statut: {task.statut}</span>
                          <span>Priorité: {task.priorite}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          
          {/* Messages */}
          {recap.messages.total > 0 && (
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center gap-2">
                <MessageSquare className="w-6 h-6 text-primary" />
                Communication ({recap.messages.total} messages)
              </h2>
              <div className="space-y-3">
                {recap.messages.liste.map((msg: any, idx: number) => (
                  <div key={idx} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="font-semibold">{msg.sujet || 'Sans sujet'}</p>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mt-2">
                      <span>De: {msg.expediteur}</span>
                      <span>Date: {formatDate(msg.date)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          
          {/* Transmissions */}
          {recap.transmissions && recap.transmissions.length > 0 && (
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-foreground mb-4">Transmissions</h2>
              <div className="space-y-3">
                {recap.transmissions.map((trans: any, idx: number) => (
                  trans.partenaire && (
                    <div key={idx} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="font-semibold">{trans.partenaire.nom}</p>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mt-2">
                        <span>Transmis le: {formatDate(trans.dateTransmission)}</span>
                        <span>Statut: {trans.statut}</span>
                        {trans.accepte && trans.dateAcceptation && (
                          <span>Accepté le: {formatDate(trans.dateAcceptation)}</span>
                        )}
                      </div>
                    </div>
                  )
                ))}
              </div>
            </section>
          )}
          
          {/* Historique */}
          {recap.historique && recap.historique.length > 0 && (
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center gap-2">
                <Clock className="w-6 h-6 text-primary" />
                Historique Récent
              </h2>
              <div className="space-y-3">
                {recap.historique.map((log: any, idx: number) => (
                  <div key={idx} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="font-semibold">{log.description}</p>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mt-2">
                      <span>Par: {log.utilisateur}</span>
                      <span>Date: {formatDate(log.date)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          
          {/* Statistiques */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-4">Statistiques</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-gray-500 mb-1">Durée de traitement</p>
                <p className="text-2xl font-bold text-blue-600">{recap.statistiques.dureeTraitement} jour(s)</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <p className="text-sm text-gray-500 mb-1">Modifications</p>
                <p className="text-2xl font-bold text-green-600">{recap.statistiques.nombreModifications}</p>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                <p className="text-sm text-gray-500 mb-1">Changements de statut</p>
                <p className="text-2xl font-bold text-purple-600">{recap.statistiques.nombreChangementsStatut}</p>
              </div>
              <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                <p className="text-sm text-gray-500 mb-1">Jours depuis dernière MAJ</p>
                <p className="text-2xl font-bold text-orange-600">{recap.statistiques.joursDepuisDerniereMAJ}</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
