'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { messagesAPI, dossiersAPI, userAPI } from '@/lib/api';
import { ArrowLeft, Send, Paperclip, MessageSquare, FileText, X } from 'lucide-react';
import Link from 'next/link';

function Button({ children, variant = 'default', className = '', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm';
  const variantClasses = {
    default: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow',
    outline: 'border border-gray-300 bg-white hover:bg-gray-50',
    ghost: 'hover:bg-gray-100',
  };
  return (
    <button 
      className={`${baseClasses} ${variantClasses[variant]} ${className}`} 
      {...props}
    >
      {children}
    </button>
  );
}

function Input({ className = '', ...props }: any) {
  return (
    <input
      className={`flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${className}`}
      {...props}
    />
  );
}

function Textarea({ className = '', ...props }: any) {
  return (
    <textarea
      className={`flex min-h-[120px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none ${className}`}
      {...props}
    />
  );
}

export default function PartenaireDossierMessagesPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const dossierId = params.id as string;
  
  const [dossier, setDossier] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [newMessage, setNewMessage] = useState({
    sujet: '',
    contenu: '',
    piecesJointes: [] as File[]
  });
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (dossierId) {
      loadDossier();
      loadMessages();
    }
  }, [dossierId]);
  
  const loadDossier = async () => {
    try {
      const response = await dossiersAPI.getDossierById(dossierId);
      if (response.data.success && response.data.dossier) {
        setDossier(response.data.dossier);
      }
    } catch (error: any) {
      console.error('Erreur lors du chargement du dossier:', error);
      if (error.response?.status === 403) {
        setError('Vous n\'avez pas accès à ce dossier');
      }
    }
  };
  
  const loadMessages = async () => {
    try {
      setLoading(true);
      const response = await messagesAPI.getMessages({ 
        type: 'all',
        dossierId: dossierId 
      });
      if (response.data.success) {
        // Les messages peuvent être dans messages ou threads selon la réponse
        const allMessages = response.data.messages || [];
        const threads = response.data.threads || [];
        
        // Si on a des threads, extraire tous les messages
        if (threads.length > 0) {
          const messagesFromThreads: any[] = [];
          threads.forEach((thread: any) => {
            if (thread.messages && Array.isArray(thread.messages)) {
              messagesFromThreads.push(...thread.messages);
            } else if (thread.root) {
              messagesFromThreads.push(thread.root);
            }
            if (thread.replies && Array.isArray(thread.replies)) {
              messagesFromThreads.push(...thread.replies);
            }
          });
          setMessages(messagesFromThreads.length > 0 ? messagesFromThreads : allMessages);
        } else {
          setMessages(allMessages);
        }
      }
    } catch (error: any) {
      console.error('Erreur lors du chargement des messages:', error);
      if (error.response?.status === 403) {
        setError('Vous n\'avez pas accès aux messages de ce dossier');
      }
    } finally {
      setLoading(false);
    }
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setNewMessage({
        ...newMessage,
        piecesJointes: [...newMessage.piecesJointes, ...files]
      });
    }
  };
  
  const removeAttachment = (index: number) => {
    setNewMessage({
      ...newMessage,
      piecesJointes: newMessage.piecesJointes.filter((_, i) => i !== index)
    });
  };
  
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.sujet.trim() || !newMessage.contenu.trim()) {
      alert('Veuillez remplir le sujet et le contenu');
      return;
    }
    
    try {
      setSending(true);
      setError(null);
      
      const formData = new FormData();
      formData.append('sujet', newMessage.sujet);
      formData.append('contenu', newMessage.contenu);
      formData.append('dossierId', dossierId);
      
      newMessage.piecesJointes.forEach((file) => {
        formData.append('piecesJointes', file);
      });
      
      await messagesAPI.sendMessage(formData);
      
      setNewMessage({ sujet: '', contenu: '', piecesJointes: [] });
      setShowCompose(false);
      await loadMessages(); // Recharger les messages
    } catch (error: any) {
      console.error('Erreur lors de l\'envoi du message:', error);
      setError(error.response?.data?.message || 'Erreur lors de l\'envoi du message');
    } finally {
      setSending(false);
    }
  };
  
  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  if (loading && !dossier) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  if (error && !dossier) {
    return (
      <div className="p-6">
        <Link href="/partenaire/dossiers" className="inline-flex items-center text-blue-600 hover:text-blue-700 mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour aux dossiers
        </Link>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      </div>
    );
  }
  
  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* En-tête */}
      <div className="mb-6">
        <Link 
          href={`/partenaire/dossiers/${dossierId}`}
          className="inline-flex items-center text-blue-600 hover:text-blue-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour au dossier
        </Link>
        
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Messages du dossier
            </h1>
            {dossier && (
              <p className="text-sm text-gray-600 mt-1">
                {dossier.titre || dossier.numero || 'Dossier'}
              </p>
            )}
          </div>
          
          <Button onClick={() => setShowCompose(!showCompose)}>
            <MessageSquare className="w-4 h-4 mr-2" />
            {showCompose ? 'Annuler' : 'Nouveau message'}
          </Button>
        </div>
      </div>
      
      {/* Formulaire de nouveau message */}
      {showCompose && (
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Nouveau message aux administrateurs</h2>
          
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm">
              {error}
            </div>
          )}
          
          <form onSubmit={handleSendMessage} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sujet <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                value={newMessage.sujet}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewMessage({ ...newMessage, sujet: e.target.value })
                }
                placeholder="Sujet du message"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Message <span className="text-red-500">*</span>
              </label>
              <Textarea
                value={newMessage.contenu}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setNewMessage({ ...newMessage, contenu: e.target.value })
                }
                placeholder="Votre message..."
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pièces jointes
              </label>
              <div className="flex items-center space-x-2">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <span className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                    <Paperclip className="w-4 h-4 mr-2" />
                    Ajouter des fichiers
                  </span>
                </label>
              </div>
              
              {newMessage.piecesJointes.length > 0 && (
                <div className="mt-2 space-y-1">
                  {newMessage.piecesJointes.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                      <span className="text-sm text-gray-700 flex items-center">
                        <FileText className="w-4 h-4 mr-2" />
                        {file.name} ({(file.size / 1024).toFixed(2)} KB)
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="flex justify-end space-x-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCompose(false);
                  setNewMessage({ sujet: '', contenu: '', piecesJointes: [] });
                  setError(null);
                }}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={sending}>
                {sending ? (
                  'Envoi en cours...'
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Envoyer
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      )}
      
      {/* Liste des messages */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-500 mt-4">Chargement des messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="p-12 text-center">
            <MessageSquare className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">Aucun message pour ce dossier</p>
            <p className="text-gray-400 text-sm mt-2">Envoyez le premier message aux administrateurs</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {messages.map((message: any) => {
              const isFromMe = message.expediteur?._id?.toString() === (session?.user as any)?._id || 
                              message.expediteur?.toString() === (session?.user as any)?._id;
              
              return (
                <div
                  key={message._id || message.id}
                  className={`p-6 ${isFromMe ? 'bg-blue-50' : 'bg-white'}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <h3 className="font-semibold text-gray-900">
                          {message.sujet || 'Sans sujet'}
                        </h3>
                        {isFromMe && (
                          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                            Vous
                          </span>
                        )}
                      </div>
                      
                      <div className="text-sm text-gray-600 mb-2">
                        <span className="font-medium">
                          {isFromMe 
                            ? 'Vous' 
                            : `${message.expediteur?.firstName || ''} ${message.expediteur?.lastName || ''}`.trim() || message.expediteur?.email || 'Expéditeur inconnu'
                          }
                        </span>
                        {' • '}
                        <span>{formatDate(message.createdAt || message.dateCreation || new Date())}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-gray-700 whitespace-pre-wrap mb-3">
                    {message.contenu}
                  </div>
                  
                  {/* Pièces jointes */}
                  {message.piecesJointes && message.piecesJointes.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm font-medium text-gray-700">Pièces jointes :</p>
                      <div className="flex flex-wrap gap-2">
                        {message.piecesJointes.map((pj: any, idx: number) => (
                          <a
                            key={idx}
                            href={`/api/user/documents/${pj._id || pj}/download`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm text-gray-700"
                          >
                            <FileText className="w-4 h-4 mr-2" />
                            {pj.originalName || pj.filename || `Fichier ${idx + 1}`}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}