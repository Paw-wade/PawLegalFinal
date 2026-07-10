'use client';

import { useState } from 'react';
import Link from 'next/link';
import { History, Clock } from 'lucide-react';
import { DossierDetailView } from '@/components/DossierDetailView';
import { documentsAPI } from '@/lib/api';
import { TaskListItem } from '@/components/tasks/TaskListItem';

type PartenaireDossierDetailSectionsProps = {
  dossier: any;
  dossierId: string;
  documents: any[];
  documentRequests: any[];
  messages: any[];
  notifications: any[];
  tasks: any[];
  history: any[];
  isLoadingDocuments: boolean;
  isLoadingRequests: boolean;
  isLoadingMessages: boolean;
  isLoadingTasks: boolean;
  loadingHistory: boolean;
  messagesError: string | null;
  showHistory: boolean;
  setShowHistory: (value: boolean) => void;
  onLoadHistory: () => void;
  onPreviewDocument: (doc: any) => void;
  getHistoryTypeIcon: (type: string) => string;
  getHistoryTypeLabel: (type: string) => string;
  highlightTaskId?: string | null;
};

function Button({ children, variant = 'default', className = '', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent',
    ghost: 'hover:bg-accent',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>{children}</button>;
}

export function PartenaireDossierDetailSections({
  dossier,
  dossierId,
  documents,
  documentRequests,
  messages,
  notifications,
  tasks,
  history,
  isLoadingDocuments,
  isLoadingRequests,
  isLoadingMessages,
  isLoadingTasks,
  loadingHistory,
  messagesError,
  showHistory,
  setShowHistory,
  onLoadHistory,
  onPreviewDocument,
  getHistoryTypeIcon,
  getHistoryTypeLabel,
  highlightTaskId = null,
}: PartenaireDossierDetailSectionsProps) {
  const [detailSection, setDetailSection] = useState<'synthese' | 'documents' | 'messages' | 'client'>('synthese');

  const detailTabs = [
    { id: 'synthese' as const, label: 'Synthèse' },
    { id: 'documents' as const, label: 'Documents', count: documents.length + documentRequests.length },
    { id: 'messages' as const, label: 'Messages', count: messages.length + notifications.filter((n) => !n.lu).length },
    { id: 'client' as const, label: 'Client' },
  ];

  return (
    <>
      <div className="sticky top-0 z-20 -mx-3 mb-6 border-b border-gray-200 bg-background/95 px-3 backdrop-blur sm:-mx-4 sm:px-4">
        <div
          className="-mb-px flex flex-nowrap items-stretch justify-between gap-0 sm:min-w-0 sm:justify-start sm:gap-1 sm:overflow-x-auto"
          role="tablist"
          aria-label="Sections du dossier"
        >
          {detailTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={detailSection === tab.id}
              onClick={() => setDetailSection(tab.id)}
              className={`inline-flex min-w-0 flex-1 items-center justify-center gap-0.5 whitespace-nowrap px-0.5 py-2.5 text-[11px] font-semibold transition-colors sm:flex-none sm:shrink-0 sm:px-4 sm:py-3 sm:text-sm ${
                detailSection === tab.id
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="truncate">{tab.label}</span>
              {typeof tab.count === 'number' && tab.count > 0 ? (
                <span className="shrink-0 rounded-full bg-gray-100 px-1 py-0.5 text-[10px] font-semibold text-foreground sm:px-1.5 sm:text-xs">
                  {tab.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {detailSection === 'synthese' && (
        <>
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 sm:p-8 mb-6 min-w-0">
            <h2 className="text-xl font-bold mb-4 break-words">Vue détaillée du dossier</h2>
            <DossierDetailView dossier={dossier} variant="partenaire" />
          </div>

          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 sm:p-6 mb-6 min-w-0">
            <h2 className="text-xl font-bold mb-4 break-words">📑 Motif et Nature du Dossier</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 min-w-0">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground font-semibold">Catégorie principale</p>
                <p className="font-medium text-base sm:text-lg break-words hyphens-auto">{dossier.categorie?.replace(/_/g, ' ') || 'Non spécifiée'}</p>
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground font-semibold">Type de demande</p>
                <p className="font-medium text-base sm:text-lg break-words hyphens-auto">{dossier.type || 'Non spécifié'}</p>
              </div>
            </div>
          </div>

          {dossier.rendezVous && dossier.rendezVous.length > 0 && (
            <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 sm:p-6 mb-6 min-w-0">
              <h2 className="text-xl font-bold mb-4 break-words">📅 Rendez-vous associés ({dossier.rendezVous.length})</h2>
              <div className="space-y-3">
                {dossier.rendezVous.map((rdv: any, index: number) => (
                  <div key={index} className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-lg">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground font-semibold">Date</p>
                        <p className="font-medium">
                          {new Date(rdv.date).toLocaleDateString('fr-FR', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                      {rdv.heure ? (
                        <div>
                          <p className="text-sm text-muted-foreground font-semibold">Heure</p>
                          <p className="font-medium">{rdv.heure}</p>
                        </div>
                      ) : null}
                      {rdv.motif ? (
                        <div className="col-span-1 sm:col-span-2 min-w-0">
                          <p className="text-sm text-muted-foreground font-semibold">Motif</p>
                          <p className="font-medium break-words">{rdv.motif}</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 sm:p-6 mb-6 min-w-0">
            <h2 className="text-xl font-bold mb-4">Tâches du dossier</h2>
            {isLoadingTasks ? (
              <p className="text-sm text-muted-foreground">Chargement des tâches...</p>
            ) : tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune tâche pour ce dossier</p>
            ) : (
              <div className="space-y-2">
                {tasks.map((task: any) => {
                  const tid = String(task._id || task.id || '');
                  return (
                  <TaskListItem
                    key={tid}
                    task={task}
                    mode="readonly"
                    variant="compact"
                    expanded={!!task.description || highlightTaskId === tid}
                    highlighted={highlightTaskId === tid}
                    dossierBasePath="/partenaire/dossiers"
                  />
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 sm:p-6 mb-6 min-w-0">
            <div className="flex items-center justify-between mb-4 gap-3">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <History className="w-6 h-6" />
                Historique du dossier
              </h2>
              <button
                type="button"
                onClick={() => {
                  const next = !showHistory;
                  setShowHistory(next);
                  if (next && history.length === 0) {
                    onLoadHistory();
                  }
                }}
                className="text-primary hover:text-primary/80 text-sm font-medium"
              >
                {showHistory ? 'Masquer' : 'Afficher'}
              </button>
            </div>
            {showHistory ? (
              loadingHistory ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : history.length === 0 ? (
                <p className="text-gray-500 text-center py-8">Aucun historique disponible</p>
              ) : (
                <div className="space-y-4">
                  {history.map((item: any, index: number) => (
                    <div key={index} className="border-l-4 border-primary pl-4 py-3 bg-gray-50/50 rounded-r-lg">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-2xl">{getHistoryTypeIcon(item.type)}</span>
                            <span className="font-semibold text-foreground">{getHistoryTypeLabel(item.type)}</span>
                          </div>
                          <p className="text-gray-700 mb-2 break-words">{item.description}</p>
                        </div>
                        <div className="text-right text-sm text-gray-500 shrink-0">
                          <div className="flex items-center gap-1 justify-end">
                            <Clock className="w-4 h-4" />
                            {new Date(item.date).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : null}
          </div>
        </>
      )}

      {detailSection === 'documents' && (
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 sm:p-6 min-w-0">
            <h2 className="text-xl font-bold mb-4 break-words">📄 Documents demandés</h2>
            {isLoadingRequests ? (
              <p className="text-sm text-muted-foreground">Chargement...</p>
            ) : documentRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune demande de document</p>
            ) : (
              <div className="space-y-3">
                {documentRequests.map((request: any) => (
                  <div
                    key={request._id || request.id}
                    className={`border-l-4 rounded-lg p-4 ${
                      request.isUrgent ? 'bg-red-50 border-red-500' : 'bg-blue-50 border-blue-500'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-lg">{request.isUrgent ? '🔴' : '📄'}</span>
                      <h3 className="font-semibold text-base break-words">{request.documentTypeLabel}</h3>
                      {request.isUrgent ? (
                        <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded-full text-xs font-semibold">URGENT</span>
                      ) : null}
                    </div>
                    {request.message ? <p className="text-sm text-muted-foreground mt-1 break-words">{request.message}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 sm:p-6 min-w-0">
            <h2 className="text-xl font-bold mb-4 break-words">📁 Documents du dossier</h2>
            {isLoadingDocuments ? (
              <p className="text-sm text-muted-foreground">Chargement...</p>
            ) : documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun document</p>
            ) : (
              <div className="space-y-2">
                {documents.map((doc: any) => (
                  <div
                    key={doc._id || doc.id}
                    className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 min-w-0"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-lg flex-shrink-0">📄</span>
                      <p className="font-medium text-sm break-words">{doc.nom}</p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0">
                      <Button
                        variant="outline"
                        className="text-xs h-8 w-full sm:w-auto"
                        onClick={() => onPreviewDocument(doc)}
                      >
                        👁️ Voir
                      </Button>
                      <Button
                        variant="outline"
                        className="text-xs h-8 w-full sm:w-auto"
                        onClick={async () => {
                          try {
                            await documentsAPI.downloadAndSave(doc._id || doc.id, doc.nom);
                          } catch (error) {
                            console.error('Erreur lors du téléchargement:', error);
                            alert('Erreur lors du téléchargement du document');
                          }
                        }}
                      >
                        ⬇️ Télécharger
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {detailSection === 'messages' && (
        <>
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 sm:p-6 mb-6 min-w-0">
            <h2 className="text-xl font-bold mb-4 break-words">💬 Messagerie du dossier</h2>
            {isLoadingMessages ? (
              <p className="text-sm text-muted-foreground">Chargement des messages...</p>
            ) : messagesError ? (
              <p className="text-sm text-red-600">{messagesError}</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun message pour ce dossier pour le moment.</p>
            ) : (
              <div className="space-y-3">
                {messages.slice(0, 5).map((msg: any) => (
                  <div key={msg._id || msg.id} className="border border-gray-100 rounded-lg px-4 py-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2 mb-1">
                      <p className="font-semibold text-sm break-words min-w-0">{msg.sujet}</p>
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {new Date(msg.createdAt).toLocaleDateString('fr-FR', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{msg.contenu}</p>
                  </div>
                ))}
                <Link href={`/partenaire/dossiers/${dossierId}/messages`}>
                  <Button variant="outline" className="w-full text-xs mt-2">Voir tous les messages</Button>
                </Link>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 sm:p-6 mb-6 min-w-0">
            <h2 className="text-xl font-bold mb-4 break-words">🔔 Notifications</h2>
            {notifications.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune notification pour ce dossier</p>
            ) : (
              <div className="space-y-2">
                {notifications.slice(0, 5).map((notif: any) => (
                  <div key={notif._id || notif.id} className="border border-gray-100 rounded-lg px-4 py-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2 mb-1">
                      <p className="font-semibold text-sm break-words min-w-0">{notif.titre || notif.title}</p>
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {new Date(notif.createdAt).toLocaleDateString('fr-FR', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground break-words">{notif.message || notif.content}</p>
                  </div>
                ))}
                <Link href="/partenaire/notifications">
                  <Button variant="outline" className="w-full text-xs mt-2">Voir toutes les notifications</Button>
                </Link>
              </div>
            )}
          </div>
        </>
      )}

      {detailSection === 'client' && (
        <>
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 sm:p-6 mb-6 min-w-0">
            <h2 className="text-xl font-bold mb-4 break-words">📋 Informations complètes du dossier</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
              <div>
                <p className="text-sm text-muted-foreground font-semibold">Numéro de dossier</p>
                <p className="font-bold text-lg text-primary break-all sm:break-normal">{dossier.numero || dossier._id}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-semibold">Titre</p>
                <p className="font-medium">{dossier.titre || 'Sans titre'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-semibold">Catégorie</p>
                <p className="font-medium">{dossier.categorie?.replace(/_/g, ' ') || 'Non spécifiée'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-semibold">Type de demande</p>
                <p className="font-medium">{dossier.type || 'Non spécifié'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-semibold">Date de création</p>
                <p className="font-medium">
                  {new Date(dossier.createdAt).toLocaleDateString('fr-FR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-semibold">Dernière mise à jour</p>
                <p className="font-medium">
                  {new Date(dossier.updatedAt || dossier.createdAt).toLocaleDateString('fr-FR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              {dossier.dateEcheance ? (
                <div>
                  <p className="text-sm text-muted-foreground font-semibold">Date d'échéance</p>
                  <p className="font-medium text-orange-600">
                    {new Date(dossier.dateEcheance).toLocaleDateString('fr-FR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
              ) : null}
              {dossier.createdBy ? (
                <div>
                  <p className="text-sm text-muted-foreground font-semibold">Créé par</p>
                  <p className="font-medium">
                    {dossier.createdBy.firstName} {dossier.createdBy.lastName}
                    {dossier.createdBy.email ? ` (${dossier.createdBy.email})` : ''}
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          {dossier.user && typeof dossier.user === 'object' ? (
            <div className="bg-white rounded-xl shadow-md border border-gray-100 p-4 sm:p-6 mb-6 min-w-0" id="fiche-client">
              <h2 className="text-xl font-bold mb-4 break-words">👤 Informations client</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <p className="text-sm text-muted-foreground font-semibold">Prénom</p>
                  <p className="font-medium">{dossier.user.firstName || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-semibold">Nom</p>
                  <p className="font-medium">{dossier.user.lastName || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-semibold">Email</p>
                  <p className="font-medium break-all">{dossier.user.email || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-semibold">Téléphone</p>
                  <p className="font-medium">{dossier.user.phone || 'N/A'}</p>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
