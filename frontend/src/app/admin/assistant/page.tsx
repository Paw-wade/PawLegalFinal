'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { getApiBaseUrl, getAuthToken, assistantAPI } from '@/lib/api';

type MsgRole = 'user' | 'assistant';
interface ChatMsg {
  id: number;
  role: MsgRole;
  content: string;
  streaming?: boolean;
  isError?: boolean;
}
interface Stats {
  tachesEnRetard: number;
  tachesAujourdhui: number;
  tachesUrgentes: number;
  tachesEnCours: number;
  dossiersActifs: number;
  dossiersInactifs: number;
  rdvAujourdhui: number;
  rdvEnAttente: number;
  messagesNonLus: number;
}

function StatChip({ value, label, color }: { value: number; label: string; color: string }) {
  if (value === 0) return null;
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${color} text-sm`}>
      <span className="font-bold text-lg leading-none">{value}</span>
      <span className="leading-tight">{label}</span>
    </div>
  );
}

function MarkdownLine({ text }: { text: string }) {
  // Bold **...**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={i}>{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>
      )}
    </>
  );
}

function AssistantMessage({ content, streaming }: { content: string; streaming?: boolean }) {
  const lines = content.split('\n');
  return (
    <div className="text-sm text-gray-800 leading-relaxed space-y-1">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed && i < lines.length - 1) return <div key={i} className="h-2" />;
        if (trimmed.startsWith('### ')) return <h3 key={i} className="font-semibold text-gray-900 mt-3 mb-1 text-base">{trimmed.slice(4)}</h3>;
        if (trimmed.startsWith('## ')) return <h2 key={i} className="font-bold text-gray-900 mt-4 mb-1 text-base">{trimmed.slice(3)}</h2>;
        if (trimmed.startsWith('# ')) return <h1 key={i} className="font-bold text-gray-900 mt-4 mb-2 text-lg">{trimmed.slice(2)}</h1>;
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) return (
          <div key={i} className="flex gap-2">
            <span className="text-orange-400 mt-0.5 shrink-0">-</span>
            <span><MarkdownLine text={trimmed.slice(2)} /></span>
          </div>
        );
        if (/^\d+\.\s/.test(trimmed)) {
          const num = trimmed.match(/^(\d+)\.\s(.*)$/);
          return num ? (
            <div key={i} className="flex gap-2">
              <span className="text-orange-500 font-semibold shrink-0">{num[1]}.</span>
              <span><MarkdownLine text={num[2]} /></span>
            </div>
          ) : <p key={i}><MarkdownLine text={trimmed} /></p>;
        }
        if (trimmed.startsWith('**') && trimmed.endsWith('**') && trimmed.length > 4) {
          return <p key={i} className="font-semibold text-gray-900"><MarkdownLine text={trimmed} /></p>;
        }
        return trimmed ? <p key={i}><MarkdownLine text={trimmed} /></p> : null;
      })}
      {streaming && <span className="inline-block w-2 h-4 bg-orange-400 rounded-sm animate-pulse ml-0.5 align-middle" />}
    </div>
  );
}

export default function AdminAssistantPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const briefingFired = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin');
    else if (session) {
      const role = (session.user as any)?.role;
      if (role !== 'admin' && role !== 'superadmin') router.push('/client');
    }
  }, [session, status, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendToApi = useCallback(async (msgs: ChatMsg[], autobrief: boolean) => {
    setLoading(true);
    const assistantId = nextId.current++;
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', streaming: true }]);

    try {
      const token = await getAuthToken();
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/assistant/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: msgs.map(m => ({ role: m.role, content: m.content })),
          autobrief,
        }),
      });

      if (!res.ok || !res.body) throw new Error(`Erreur ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === 'stats' && evt.stats) {
              setStats(evt.stats);
            } else if (evt.type === 'delta' && evt.text) {
              fullText += evt.text;
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: fullText } : m
              ));
            } else if (evt.type === 'complete') {
              fullText = evt.text || fullText;
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: fullText, streaming: false } : m
              ));
            } else if (evt.type === 'error') {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: evt.error || 'Erreur', streaming: false, isError: true }
                  : m
              ));
            }
          } catch {}
        }
      }
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, streaming: false } : m
      ));
    } catch (err: any) {
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: err.message || 'Erreur reseau', streaming: false, isError: true }
          : m
      ));
    } finally {
      setLoading(false);
    }
  }, []);

  // Briefing auto au chargement (ref pour eviter le double-appel React StrictMode)
  useEffect(() => {
    if (status !== 'authenticated' || briefingFired.current) return;
    const role = (session?.user as any)?.role;
    if (role !== 'admin' && role !== 'superadmin') return;
    briefingFired.current = true;
    sendToApi([], true);
  }, [status, session, sendToApi]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    const userId = nextId.current++;
    const userMsg: ChatMsg = { id: userId, role: 'user', content: text };
    setMessages(prev => {
      const updated = [...prev, userMsg];
      sendToApi(updated.filter(m => !m.isError), false);
      return updated;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewBriefing = () => {
    if (loading) return;
    setMessages([]);
    sendToApi([], true);
  };

  const now = new Date();
  const dateLabel = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/40 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Assistant</h1>
            <p className="text-sm text-gray-500 capitalize">{dateLabel}</p>
          </div>
          <button
            onClick={handleNewBriefing}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7.5 1a6.5 6.5 0 1 0 6.5 6.5h-1a5.5 5.5 0 1 1-5.5-5.5V4L10 1.5 7.5 0V1Z" fill="currentColor"/>
            </svg>
            Nouveau briefing
          </button>
        </div>

        {/* Stats chips */}
        {stats && (
          <div className="mt-3 flex flex-wrap gap-2">
            <StatChip value={stats.tachesUrgentes} label="urgentes" color="bg-red-50 border-red-200 text-red-700" />
            <StatChip value={stats.tachesEnRetard} label="en retard" color="bg-orange-50 border-orange-200 text-orange-700" />
            <StatChip value={stats.tachesAujourdhui} label="taches aujourd'hui" color="bg-amber-50 border-amber-200 text-amber-700" />
            <StatChip value={stats.rdvAujourdhui} label="RDV aujourd'hui" color="bg-blue-50 border-blue-200 text-blue-700" />
            <StatChip value={stats.rdvEnAttente} label="RDV en attente" color="bg-indigo-50 border-indigo-200 text-indigo-700" />
            <StatChip value={stats.messagesNonLus} label="messages non lus" color="bg-purple-50 border-purple-200 text-purple-700" />
            <StatChip value={stats.dossiersInactifs} label="dossiers inactifs" color="bg-gray-100 border-gray-200 text-gray-600" />
          </div>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 max-w-3xl w-full mx-auto">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-orange-100 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z" fill="#f97316"/>
              </svg>
            </div>
            <p className="text-gray-500 text-sm max-w-xs">Le briefing est en cours de chargement...</p>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center shrink-0 mt-0.5 mr-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z" fill="#f97316"/>
                </svg>
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-orange-500 text-white text-sm'
                  : msg.isError
                  ? 'bg-red-50 border border-red-200 text-red-700 text-sm'
                  : 'bg-white border border-gray-100 shadow-sm'
              }`}
            >
              {msg.role === 'user' ? (
                <p className="text-sm">{msg.content}</p>
              ) : (
                <AssistantMessage content={msg.content} streaming={msg.streaming} />
              )}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Suggestions rapides */}
      {messages.length > 0 && !loading && (
        <div className="px-4 sm:px-6 py-2 max-w-3xl w-full mx-auto">
          <div className="flex flex-wrap gap-2">
            {[
              'Quelles taches sont en retard ?',
              'Resume les dossiers inactifs',
              'Prepare une relance client',
              'Mes RDV cette semaine',
            ].map(q => (
              <button
                key={q}
                onClick={() => { setInput(q); textareaRef.current?.focus(); }}
                className="px-3 py-1.5 rounded-full border border-gray-200 text-xs text-gray-600 bg-white hover:border-orange-300 hover:text-orange-600 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="bg-white border-t border-gray-100 px-4 sm:px-6 py-3">
        <div className="max-w-3xl mx-auto flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Posez une question sur vos dossiers, taches, RDV..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-300 transition max-h-32"
            style={{ minHeight: '44px' }}
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M14 8L2 2l3 6-3 6 12-6Z" fill="currentColor"/>
              </svg>
            )}
          </button>
        </div>
        <p className="text-center text-[10px] text-gray-400 mt-1 max-w-3xl mx-auto">
          Entree pour envoyer, Maj+Entree pour un saut de ligne
        </p>
      </div>
    </div>
  );
}
