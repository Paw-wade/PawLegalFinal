'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { whatsappAdminAPI, dossiersAPI, userAPI } from '@/lib/api';
import { Toast } from '@/components/Toast';
import {
  MessageCircle,
  Send,
  Search,
  Link2,
  Trash2,
  RefreshCw,
  CheckCheck,
  FileText,
  Image,
  Mic,
  Video,
  File,
  MapPin,
  Sticker,
  X,
  User,
  Phone,
} from 'lucide-react';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function formatTime(ts: string | Date) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return 'à l\'instant';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) {
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('33') && digits.length === 11) {
    return `+33 ${digits.slice(2, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)} ${digits.slice(9, 11)}`;
  }
  return phone;
}

function MediaIcon({ type }: { type: string }) {
  const cls = 'w-4 h-4 inline mr-1 text-muted-foreground';
  if (type === 'image') return <Image className={cls} />;
  if (type === 'document') return <File className={cls} />;
  if (type === 'audio') return <Mic className={cls} />;
  if (type === 'video') return <Video className={cls} />;
  if (type === 'sticker') return <Sticker className={cls} />;
  if (type === 'location') return <MapPin className={cls} />;
  return <FileText className={cls} />;
}

function getLastMessagePreview(conv: any) {
  if (!conv.messages || conv.messages.length === 0) return { text: 'Aucun message', time: conv.lastActivity };
  const last = conv.messages[conv.messages.length - 1];
  let text = last.content || '';
  if (!text) {
    const labels: Record<string, string> = { image: 'Photo', document: 'Document', audio: 'Message vocal', video: 'Vidéo', sticker: 'Sticker', location: 'Localisation' };
    text = labels[last.type] || 'Fichier';
  }
  if (text.length > 60) text = text.slice(0, 60) + '…';
  return { text, time: last.timestamp || conv.lastActivity, outbound: last.direction === 'outbound', type: last.type };
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export default function AdminWhatsAppPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConv, setSelectedConv] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [linkDossierId, setLinkDossierId] = useState('');
  const [linkClientId, setLinkClientId] = useState('');
  const [showProactiveModal, setShowProactiveModal] = useState(false);
  const [proactivePhone, setProactivePhone] = useState('');
  const [proactiveText, setProactiveText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auth guard
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/login');
  }, [status, router]);

  const loadConversations = useCallback(async () => {
    try {
      const res = await whatsappAdminAPI.listConversations({ limit: 100 });
      setConversations(res.data.conversations || []);
      setUnreadTotal(res.data.unreadTotal || 0);
    } catch {
      setToast({ message: 'Erreur chargement conversations', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') loadConversations();
  }, [status, loadConversations]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedConv?.messages]);

  async function openConversation(conv: any) {
    try {
      const res = await whatsappAdminAPI.getConversation(conv._id);
      setSelectedConv(res.data.conversation);
      // Marquer comme lu
      if (conv.unreadAdmin > 0) {
        await whatsappAdminAPI.markRead(conv._id);
        setConversations((prev) =>
          prev.map((c) => (c._id === conv._id ? { ...c, unreadAdmin: 0 } : c))
        );
        setUnreadTotal((n) => Math.max(0, n - (conv.unreadAdmin || 0)));
      }
    } catch {
      setToast({ message: 'Erreur chargement conversation', type: 'error' });
    }
  }

  async function sendReply() {
    if (!replyText.trim() || !selectedConv) return;
    setIsSending(true);
    try {
      await whatsappAdminAPI.send(selectedConv.phone, replyText.trim());
      // Rafraichir la conversation
      const res = await whatsappAdminAPI.getConversation(selectedConv._id);
      setSelectedConv(res.data.conversation);
      setReplyText('');
      loadConversations();
    } catch (err: any) {
      setToast({ message: err?.response?.data?.message || 'Erreur envoi', type: 'error' });
    } finally {
      setIsSending(false);
    }
  }

  async function sendProactive() {
    if (!proactivePhone.trim() || !proactiveText.trim()) return;
    setIsSending(true);
    try {
      const res = await whatsappAdminAPI.send(proactivePhone.trim(), proactiveText.trim());
      setToast({ message: 'Message envoyé', type: 'success' });
      setShowProactiveModal(false);
      setProactivePhone('');
      setProactiveText('');
      loadConversations();
      if (res.data.conversation) openConversation(res.data.conversation);
    } catch (err: any) {
      setToast({ message: err?.response?.data?.message || 'Erreur envoi', type: 'error' });
    } finally {
      setIsSending(false);
    }
  }

  async function openLinkModal() {
    setShowLinkModal(true);
    setLinkDossierId(selectedConv?.dossierId?._id || selectedConv?.dossierId || '');
    setLinkClientId(selectedConv?.clientId?._id || selectedConv?.clientId || '');
    if (dossiers.length === 0) {
      try {
        const r = await dossiersAPI.getAllDossiers({ limit: 200 } as any);
        setDossiers(r.data?.dossiers || r.data || []);
      } catch { /* ignore */ }
    }
    if (clients.length === 0) {
      try {
        const r = await userAPI.getAllUsers();
        setClients(r.data?.users || r.data || []);
      } catch { /* ignore */ }
    }
  }

  async function saveLink() {
    if (!selectedConv) return;
    try {
      const res = await whatsappAdminAPI.link(selectedConv._id, {
        clientId: linkClientId || null,
        dossierId: linkDossierId || null,
      });
      setSelectedConv(res.data.conversation);
      setShowLinkModal(false);
      setToast({ message: 'Lien mis à jour', type: 'success' });
      loadConversations();
    } catch {
      setToast({ message: 'Erreur lors du lien', type: 'error' });
    }
  }

  async function deleteConversation(id: string) {
    if (!confirm('Supprimer cette conversation ?')) return;
    try {
      await whatsappAdminAPI.remove(id);
      setConversations((prev) => prev.filter((c) => c._id !== id));
      if (selectedConv?._id === id) setSelectedConv(null);
      setToast({ message: 'Conversation supprimée', type: 'info' });
    } catch {
      setToast({ message: 'Erreur suppression', type: 'error' });
    }
  }

  const filtered = conversations.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.phone || '').includes(q) ||
      (c.contactName || '').toLowerCase().includes(q)
    );
  });

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-background">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      {/* ── Panneau gauche : liste des conversations ── */}
      <div className="w-80 flex flex-col border-r border-border shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-500" />
              <h1 className="font-semibold text-sm">WhatsApp</h1>
              {unreadTotal > 0 && (
                <span className="bg-green-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold">
                  {unreadTotal}
                </span>
              )}
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setShowProactiveModal(true)}
                className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title="Nouveau message"
              >
                <Send className="w-4 h-4" />
              </button>
              <button
                onClick={loadConversations}
                className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title="Actualiser"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              {search ? 'Aucun résultat' : 'Aucune conversation'}
            </div>
          ) : (
            filtered.map((conv) => {
              const preview = getLastMessagePreview(conv);
              const isSelected = selectedConv?._id === conv._id;
              return (
                <button
                  key={conv._id}
                  onClick={() => openConversation(conv)}
                  className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-accent/50 transition-colors ${isSelected ? 'bg-accent' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                      <MessageCircle className="w-5 h-5 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-medium text-sm truncate">
                          {conv.contactName || formatPhone(conv.phone)}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatTime(preview.time)}
                        </span>
                      </div>
                      {conv.contactName && (
                        <div className="text-xs text-muted-foreground">{formatPhone(conv.phone)}</div>
                      )}
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-xs text-muted-foreground truncate flex items-center gap-1">
                          {preview.outbound && <CheckCheck className="w-3 h-3 text-blue-400 shrink-0" />}
                          {preview.type && preview.type !== 'text' && <MediaIcon type={preview.type} />}
                          {preview.text}
                        </span>
                        {conv.unreadAdmin > 0 && (
                          <span className="bg-green-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold shrink-0 ml-1">
                            {conv.unreadAdmin}
                          </span>
                        )}
                      </div>
                      {(conv.clientId || conv.dossierId) && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {conv.clientId && (
                            <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
                              <User className="w-2.5 h-2.5 inline mr-0.5" />
                              {conv.clientId.prenom} {conv.clientId.nom}
                            </span>
                          )}
                          {conv.dossierId && (
                            <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded truncate max-w-[120px]">
                              <FileText className="w-2.5 h-2.5 inline mr-0.5" />
                              {conv.dossierId.titre || conv.dossierId.reference || 'Dossier'}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Panneau droit : conversation ── */}
      {selectedConv ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header conversation */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <MessageCircle className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <div className="font-semibold text-sm">
                  {selectedConv.contactName || formatPhone(selectedConv.phone)}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <Phone className="w-3 h-3" />
                  {formatPhone(selectedConv.phone)}
                  {selectedConv.clientId && (
                    <span className="text-blue-600 dark:text-blue-400">
                      · {selectedConv.clientId.prenom} {selectedConv.clientId.nom}
                    </span>
                  )}
                  {selectedConv.dossierId && (
                    <span className="text-purple-600 dark:text-purple-400">
                      · {selectedConv.dossierId.titre || 'Dossier'}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-1">
              <button
                onClick={openLinkModal}
                className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title="Lier à un dossier / client"
              >
                <Link2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => deleteConversation(selectedConv._id)}
                className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-muted-foreground hover:text-red-600 transition-colors"
                title="Supprimer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#e5ddd5] dark:bg-[#0d1117]">
            {(selectedConv.messages || []).length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">Aucun message</div>
            ) : (
              (selectedConv.messages || []).map((msg: any, i: number) => {
                const isOut = msg.direction === 'outbound';
                return (
                  <div key={i} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[70%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                        isOut
                          ? 'bg-[#dcf8c6] dark:bg-[#005c4b] text-foreground rounded-br-none'
                          : 'bg-white dark:bg-[#1f2937] text-foreground rounded-bl-none'
                      }`}
                    >
                      {msg.type !== 'text' && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                          <MediaIcon type={msg.type} />
                          <span className="capitalize">{msg.type}</span>
                          {msg.filename && <span>· {msg.filename}</span>}
                          {msg.mediaId && (
                            <span className="text-[10px] opacity-60">ID: {msg.mediaId.slice(0, 8)}…</span>
                          )}
                        </div>
                      )}
                      <p className="whitespace-pre-wrap break-words leading-relaxed">
                        {msg.content || (msg.type !== 'text' ? '(média)' : '')}
                      </p>
                      <div className={`text-[10px] mt-1 flex items-center gap-1 ${isOut ? 'justify-end' : 'justify-start'} text-muted-foreground`}>
                        {formatTime(msg.timestamp)}
                        {isOut && <CheckCheck className="w-3 h-3 text-blue-400" />}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Zone de saisie */}
          <div className="p-3 border-t border-border bg-background">
            <div className="flex gap-2 items-end">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendReply();
                  }
                }}
                placeholder="Votre message… (Entrée pour envoyer)"
                rows={2}
                className="flex-1 px-3 py-2 text-sm border border-input rounded-md bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={sendReply}
                disabled={isSending || !replyText.trim()}
                className="p-2.5 rounded-md bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSending ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <MessageCircle className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-sm">Sélectionnez une conversation</p>
          </div>
        </div>
      )}

      {/* ── Modal : lier à un client / dossier ── */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-base flex items-center gap-2">
                <Link2 className="w-4 h-4 text-primary" />
                Lier la conversation
              </h2>
              <button onClick={() => setShowLinkModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Client</label>
                <select
                  value={linkClientId}
                  onChange={(e) => setLinkClientId(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Aucun</option>
                  {clients.map((c: any) => (
                    <option key={c._id} value={c._id}>
                      {c.prenom} {c.nom} ({c.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Dossier</label>
                <select
                  value={linkDossierId}
                  onChange={(e) => setLinkDossierId(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Aucun</option>
                  {dossiers.map((d: any) => (
                    <option key={d._id} value={d._id}>
                      {d.titre || d.reference || d._id} — {d.statut}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowLinkModal(false)}
                className="px-4 py-2 text-sm border border-input rounded-md hover:bg-accent transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={saveLink}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal : message proactif ── */}
      {showProactiveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-base flex items-center gap-2">
                <Send className="w-4 h-4 text-green-500" />
                Nouveau message WhatsApp
              </h2>
              <button onClick={() => setShowProactiveModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">
                  Numéro de téléphone
                  <span className="text-muted-foreground font-normal ml-1">(format international, ex: 33612345678)</span>
                </label>
                <input
                  type="text"
                  value={proactivePhone}
                  onChange={(e) => setProactivePhone(e.target.value)}
                  placeholder="33612345678"
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Message</label>
                <textarea
                  value={proactiveText}
                  onChange={(e) => setProactiveText(e.target.value)}
                  rows={4}
                  placeholder="Votre message…"
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded p-2">
                ⚠️ WhatsApp n'autorise les messages proactifs que via des modèles approuvés (Business Initiated). Ce message ne sera délivré que si le client vous a contacté dans les dernières 24h, ou si vous utilisez un modèle approuvé.
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowProactiveModal(false)}
                className="px-4 py-2 text-sm border border-input rounded-md hover:bg-accent transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={sendProactive}
                disabled={isSending || !proactivePhone.trim() || !proactiveText.trim()}
                className="px-4 py-2 text-sm bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {isSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Envoyer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
