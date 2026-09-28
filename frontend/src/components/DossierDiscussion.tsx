'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { messagesAPI } from '@/lib/api';

interface Props {
  dossierId: string;
  clientId?: string;
  variant: 'admin' | 'client';
  currentUserId?: string;
  currentUserName?: string;
}

interface Msg {
  _id: string;
  sujet: string;
  contenu: string;
  expediteur: { _id: string; firstName: string; lastName: string; role: string } | null;
  createdAt: string;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) +
    ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function DossierDiscussion({ dossierId, clientId, variant, currentUserId }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    if (!dossierId) return;
    try {
      const res = await messagesAPI.getMessages({ type: 'all', dossierId });
      if (res.data.success) {
        const flat: Msg[] = (res.data.messages || [])
          .slice()
          .sort((a: Msg, b: Msg) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        setMsgs(flat);

        const unread = flat.filter((m: any) => {
          const isRecipient =
            (Array.isArray(m.destinataires) && m.destinataires.some((d: any) =>
              (d?._id?.toString() || d?.toString()) === currentUserId
            )) ||
            (Array.isArray(m.copie) && m.copie.some((c: any) =>
              (c?._id?.toString() || c?.toString()) === currentUserId
            ));
          if (!isRecipient) return false;
          return !m.lu?.some((l: any) => (l?.user?._id?.toString() || l?.user?.toString()) === currentUserId);
        });
        for (const m of unread) {
          messagesAPI.markAsRead(m._id).catch(() => {});
        }
      }
    } catch {
      setError('Impossible de charger les messages.');
    } finally {
      setLoading(false);
    }
  }, [dossierId, currentUserId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSendError(null);
    setSending(true);
    try {
      const form = new FormData();
      form.append('sujet', 'Message dossier');
      form.append('contenu', content);
      form.append('dossierId', dossierId);
      if (variant === 'admin' && clientId) {
        form.append('destinataire', clientId);
      }
      await messagesAPI.sendMessage(form);
      setText('');
      await load();
    } catch (err: any) {
      setSendError(err?.response?.data?.message || 'Erreur lors de l\'envoi.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Chargement...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600 py-4 text-center">{error}</p>;
  }

  return (
    <div className="flex flex-col" style={{ minHeight: 320, maxHeight: 560 }}>
      {/* Message list */}
      <div
        className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
        style={{ minHeight: 200, maxHeight: 440 }}
      >
        {msgs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center pt-8">
            Aucun message pour l'instant. Ecrivez le premier message.
          </p>
        ) : (
          msgs.map((msg) => {
            const senderId = msg.expediteur?._id?.toString() || '';
            const isMine = senderId === currentUserId;
            const senderLabel = msg.expediteur
              ? `${msg.expediteur.firstName} ${msg.expediteur.lastName}`
              : 'Inconnu';
            const isAdminMsg = msg.expediteur?.role === 'admin' || msg.expediteur?.role === 'superadmin';

            return (
              <div
                key={msg._id}
                className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                    isMine
                      ? 'bg-orange-500 text-white rounded-br-sm'
                      : isAdminMsg
                      ? 'bg-blue-50 border border-blue-100 text-gray-800 rounded-bl-sm'
                      : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                  }`}
                >
                  {!isMine && (
                    <p className={`text-[10px] font-semibold mb-0.5 ${isAdminMsg ? 'text-blue-600' : 'text-gray-500'}`}>
                      {senderLabel}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words leading-snug">{msg.contenu}</p>
                  <p className={`text-[10px] mt-1 text-right ${isMine ? 'text-white/60' : 'text-gray-400'}`}>
                    {formatTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-gray-100 px-3 py-2 flex gap-2 items-end">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ecrire un message... (Entree pour envoyer)"
          rows={2}
          className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
          disabled={sending}
        />
        <button
          onClick={handleSend}
          disabled={sending || !text.trim()}
          className="shrink-0 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-xl px-4 py-2 text-sm font-medium transition-colors"
        >
          {sending ? '...' : 'Envoyer'}
        </button>
      </div>
      {sendError && (
        <p className="text-xs text-red-600 px-3 pb-2">{sendError}</p>
      )}
    </div>
  );
}
