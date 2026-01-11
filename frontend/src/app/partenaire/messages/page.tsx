'use client';

import { useEffect, useState } from 'react';
import { messagesAPI } from '@/lib/api';
import Link from 'next/link';
import { MessageSquare } from 'lucide-react';

export default function PartenaireMessagesPage() {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Fonction pour convertir en string de manière sécurisée
  const safeString = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return String(value);
    // Si c'est un objet, ne pas le convertir, retourner une chaîne vide
    if (typeof value === 'object') {
      console.warn('Tentative de convertir un objet en string:', value);
      return '';
    }
    return '';
  };
  
  useEffect(() => {
    loadMessages();
  }, []);
  
  const loadMessages = async () => {
    try {
      setLoading(true);
      const response = await messagesAPI.getMessages({ type: 'received' });
      if (response.data.success) {
        setMessages(response.data.threads || response.data.messages || []);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des messages:', error);
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Messages</h1>
      
      {messages.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <MessageSquare className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">Aucun message pour le moment</p>
        </div>
      ) : (
        <div className="space-y-4">
          {messages.map((thread: any) => {
            // Extraire toutes les valeurs de manière sécurisée AVANT le rendu
            const threadId = safeString(thread.threadId) || safeString(thread._id) || '';
            const threadHref = threadId ? `/partenaire/messages/${threadId}` : '#';
            
            // Pour le sujet, vérifier root et thread directement
            let threadSujet = 'Sans sujet';
            if (thread.root && typeof thread.root === 'object') {
              threadSujet = safeString(thread.root.sujet) || threadSujet;
            }
            if (threadSujet === 'Sans sujet' && thread.sujet) {
              threadSujet = safeString(thread.sujet) || threadSujet;
            }
            
            // Pour le contenu, vérifier lastMessage et thread directement
            let threadContenu = '';
            if (thread.lastMessage && typeof thread.lastMessage === 'object') {
              threadContenu = safeString(thread.lastMessage.contenu) || '';
            }
            if (!threadContenu && thread.contenu) {
              threadContenu = safeString(thread.contenu) || '';
            }
            
            const hasUnread = thread.hasUnread === true;
            
            // Extraire les informations du dossier de manière sécurisée si présent
            // Vérifier plusieurs emplacements possibles dans l'ordre de priorité
            let dossierInfo = '';
            
            // Fonction helper pour extraire l'info d'un dossier (objet ou ID)
            const extractDossierInfo = (dossierValue: any): string => {
              if (!dossierValue) return '';
              if (typeof dossierValue === 'string') return dossierValue;
              if (typeof dossierValue === 'object' && !Array.isArray(dossierValue)) {
                // C'est un objet dossier populé
                const titre = safeString(dossierValue.titre);
                const numero = safeString(dossierValue.numero);
                const id = safeString(dossierValue._id);
                return titre || numero || id || '';
              }
              return safeString(dossierValue);
            };
            
            // Vérifier thread.dossier (priorité 1 - alias direct du backend)
            if (!dossierInfo) {
              dossierInfo = extractDossierInfo(thread.dossier);
            }
            
            // Vérifier thread.dossierId (priorité 2)
            if (!dossierInfo) {
              dossierInfo = extractDossierInfo(thread.dossierId);
            }
            
            // Vérifier thread.root?.dossierId (priorité 3)
            if (!dossierInfo && thread.root && typeof thread.root === 'object') {
              dossierInfo = extractDossierInfo(thread.root.dossierId);
            }
            
            // Vérifier thread.lastMessage?.dossierId (priorité 4)
            if (!dossierInfo && thread.lastMessage && typeof thread.lastMessage === 'object') {
              dossierInfo = extractDossierInfo(thread.lastMessage.dossierId);
            }
            
            return (
              <Link
                key={threadId || `thread-${Math.random()}`}
                href={threadHref}
                className="block bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
              >
                <h3 className="font-semibold text-lg mb-2">{threadSujet}</h3>
                {threadContenu && (
                  <p className="text-gray-600 text-sm line-clamp-2">{threadContenu}</p>
                )}
                {dossierInfo && (
                  <p className="text-xs text-gray-500 mt-1">Dossier: {dossierInfo}</p>
                )}
                {hasUnread && (
                  <span className="inline-block mt-2 px-2 py-1 bg-primary text-white text-xs rounded-full">
                    Non lu
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

