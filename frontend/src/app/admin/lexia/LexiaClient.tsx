'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { getApiBaseUrl, getAuthToken } from '@/lib/api';

type LexiaProviderMode = 'auto' | 'anthropic' | 'internal';

type ChatMessage = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  searched?: boolean;
  isError?: boolean;
  /** Réponse base interne vs modèle cloud */
  lexiaProvider?: 'anthropic' | 'internal';
};

type Category = {
  id: string;
  icon: string;
  label: string;
  color: string;
  prompts: string[];
};

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatMessage(raw: string) {
  const text = escapeHtml(raw);
  return text
    .split('\n')
    .map((line) => {
      if (line.startsWith('## ') || line.startsWith('### ')) {
        return `<div class="section-title">${line.replace(/^#{2,3} /, '')}</div>`;
      }
      if (
        line.startsWith('⚖️') ||
        line.startsWith('📋') ||
        line.startsWith('🎯') ||
        line.startsWith('📌') ||
        line.startsWith('✅') ||
        line.startsWith('🔗')
      ) {
        return `<div class="legal-row">${line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</div>`;
      }
      if (line.startsWith('- ') || line.startsWith('• ')) {
        return `<div class="bullet">${line
          .replace(/^[-•] /, '')
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</div>`;
      }
      if (/^\d+\./.test(line)) {
        return `<div class="numbered">${line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</div>`;
      }
      if (line === '---') return '<div class="divider"></div>';
      if (line === '') return '<div class="spacer"></div>';
      return `<span>${line
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')}</span>`;
    })
    .join('');
}

const categories: Category[] = [
  {
    id: 'oqtf',
    icon: '🚨',
    label: 'OQTF Étudiant',
    color: '#ff4d4d',
    prompts: [
      "Recherche toutes les décisions annulant une OQTF prise à l'encontre d'un étudiant étranger en cours de scolarité. Identifie les moyens retenus.",
      'Quels arguments ont permis d\'obtenir la suspension d\'une OQTF étudiant en référé-suspension ? Jurisprudence récente.',
      "Erreur manifeste d'appréciation dans une OQTF étudiant : jurisprudence des tribunaux administratifs.",
    ],
  },
  {
    id: 'anef',
    icon: '💻',
    label: 'ANEF & Récépissés',
    color: '#ff9500',
    prompts: [
      "Recherche des décisions condamnant l'État pour dysfonctionnement de la plateforme ANEF et ses conséquences sur le séjour des étudiants.",
      'Jurisprudence sur le droit au récépissé lors du dépôt d\'une demande de renouvellement de titre de séjour étudiant.',
      "Quels recours sont disponibles quand un étudiant ne peut pas prendre rendez-vous en préfecture ? Référé-mesures utiles applicables ?",
    ],
  },
  {
    id: 'refus',
    icon: '📄',
    label: 'Refus Renouvellement',
    color: '#007aff',
    prompts: [
      'Décisions annulant un refus de renouvellement de titre de séjour étudiant pour insuffisance de motivation ou erreur de droit.',
      'Quels éléments doivent être pris en compte par la préfecture pour renouveler un titre étudiant ? Jurisprudence Conseil d\'État.',
      'Impact de l\'article 8 CEDH (vie privée/familiale) dans les recours contre refus de renouvellement étudiant.',
    ],
  },
  {
    id: 'visa',
    icon: '🌍',
    label: 'Visa & CRRV',
    color: '#34c759',
    prompts: [
      'Jurisprudence du Tribunal Administratif de Nantes sur les recours contre refus de visa étudiant.',
      'Quels moyens sont invocables devant la Commission de Recours contre les Refus de Visa (CRRV) ?',
      'Accords bilatéraux applicables en matière de visa étudiant : quels ressortissants en bénéficient ?',
    ],
  },
  {
    id: 'refere',
    icon: '⚡',
    label: 'Référés',
    color: '#af52de',
    prompts: [
      'Conditions du référé-suspension en matière de droit des étrangers étudiants : urgence et doute sérieux. Jurisprudence récente.',
      'Référé-mesures utiles pour obtenir un rendez-vous préfectoral ou la délivrance d\'un récépissé : décisions favorables.',
      'Référé-liberté en matière de rétention administrative d\'étudiant étranger : quels arguments ?',
    ],
  },
  {
    id: 'accords',
    icon: '📜',
    label: 'Accords Bilatéraux',
    color: '#5ac8fa',
    prompts: [
      'Accord franco-algérien du 27 décembre 1968 : jurisprudence applicable aux étudiants algériens en situation irrégulière.',
      'Accord d\'Ankara : droits des ressortissants turcs étudiants en France, jurisprudence CJUE et CE.',
      'Quelles conventions bilatérales franco-africaines contiennent des dispositions favorables aux étudiants ?',
    ],
  },
];

export type LexiaAudience = 'admin' | 'user';

type LexiaClientProps = {
  /**
   * `admin` : page /admin/lexia (admin / superadmin uniquement).
   * `user` : page /lexia — tout rôle connecté (client, partenaire, etc.).
   */
  audience?: LexiaAudience;
};

export default function LexiaClient({ audience = 'admin' }: LexiaClientProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agentStatus, setAgentStatus] = useState<'idle' | 'analyzing' | 'searching'>('idle');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  /** auto = serveur (LEXIA_PROVIDER + clé Anthropic) ; sinon force le mode pour cette session. */
  const [lexiaProvider, setLexiaProvider] = useState<LexiaProviderMode>('auto');
  const [lexiaConfig, setLexiaConfig] = useState<{
    envProvider: LexiaProviderMode;
    anthropicConfigured: boolean;
    knowledgeDirRelative?: string;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    const role = (session?.user as { role?: string })?.role;
    if (audience === 'admin' && role !== 'admin' && role !== 'superadmin') {
      router.push('/admin');
    }
  }, [session, status, router, audience]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getAuthToken();
        const base = getApiBaseUrl().replace(/\/+$/, '');
        const res = await fetch(`${base}/lexia/config`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok) return;
        setLexiaConfig({
          envProvider: (data?.envProvider as LexiaProviderMode) || 'auto',
          anthropicConfigured: Boolean(data?.anthropicConfigured),
          knowledgeDirRelative:
            typeof data?.knowledgeDirRelative === 'string' ? data.knowledgeDirRelative : undefined,
        });
      } catch {
        /* silencieux : l’UI reste utilisable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;
      setInput('');
      setIsLoading(true);
      setAgentStatus('analyzing');

      const userMsg: ChatMessage = { role: 'user', content: text, id: Date.now() };
      setMessages((prev) => [...prev, userMsg]);

      const history = messages.map((m) => ({ role: m.role, content: m.content }));

      try {
        const token = await getAuthToken();
        const url = `${getApiBaseUrl().replace(/\/+$/, '')}/lexia`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            messages: [...history, { role: 'user', content: text }],
            provider: lexiaProvider,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(typeof data?.error === 'string' ? data.error : res.statusText);
        }
        const finalText = typeof data?.text === 'string' ? data.text : 'Analyse terminée.';
        const searched = Boolean(data?.searched);
        const resolved =
          data?.resolvedProvider === 'internal' || data?.provider === 'internal'
            ? 'internal'
            : data?.resolvedProvider === 'anthropic' || data?.provider === 'anthropic'
              ? 'anthropic'
              : undefined;
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: finalText,
            id: Date.now() + 1,
            searched,
            lexiaProvider: resolved,
          },
        ]);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Erreur inconnue';
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `❌ ${msg}`,
            id: Date.now() + 2,
            isError: true,
          },
        ]);
      } finally {
        setIsLoading(false);
        setAgentStatus('idle');
        inputRef.current?.focus();
      }
    },
    [isLoading, messages, lexiaProvider]
  );

  if (status === 'loading' || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground text-sm">
        Chargement…
      </div>
    );
  }

  const role = (session.user as { role?: string })?.role;
  if (audience === 'admin' && role !== 'admin' && role !== 'superadmin') {
    return null;
  }

  const showServerPaths = audience === 'admin' && (role === 'admin' || role === 'superadmin');

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Source+Sans+3:wght@300;400;500;600&display=swap');

        .lexia-root *, .lexia-root *::before, .lexia-root *::after { box-sizing: border-box; }

        .lexia-root {
          --bg: #0d1117;
          --surface: #161b22;
          --surface2: #1c2128;
          --border: rgba(255,255,255,0.08);
          --border-accent: rgba(210,180,120,0.25);
          --gold: #c9a84c;
          --gold-light: #e8c97a;
          --text: rgba(255,255,255,0.88);
          --text-muted: rgba(255,255,255,0.42);
          --text-dim: rgba(255,255,255,0.22);
          --red: #ff4d4d;
          --blue: #4a9eff;
          min-height: calc(100vh - 4rem);
          background: var(--bg);
          font-family: 'Source Sans 3', sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
          overflow: hidden;
          color: var(--text);
        }

        .lexia-root::before {
          content: '';
          position: fixed;
          inset: 0;
          background:
            radial-gradient(ellipse 80% 50% at 50% -10%, rgba(201,168,76,0.06) 0%, transparent 60%),
            repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,255,255,0.015) 39px, rgba(255,255,255,0.015) 40px);
          pointer-events: none;
          z-index: 0;
        }

        .lexia-container {
          width: 100%;
          max-width: 920px;
          min-height: calc(100vh - 4rem);
          display: flex;
          flex-direction: column;
          position: relative;
          z-index: 1;
        }

        .lexia-header {
          padding: 18px 28px 14px;
          background: rgba(13,17,23,0.92);
          backdrop-filter: blur(24px);
          border-bottom: 1px solid var(--border-accent);
          position: sticky;
          top: 0;
          z-index: 20;
        }

        .lexia-header-row { display: flex; align-items: center; gap: 16px; margin-bottom: 10px; }
        .lexia-scales { font-size: 28px; line-height: 1; filter: drop-shadow(0 0 8px rgba(201,168,76,0.4)); }
        .lexia-header-titles { flex: 1; }
        .lexia-header-titles h1 {
          font-family: 'Playfair Display', serif;
          font-size: 20px;
          font-weight: 900;
          color: var(--gold-light);
          letter-spacing: 0.5px;
          line-height: 1;
          margin: 0;
        }
        .lexia-header-titles p {
          font-size: 11px;
          color: var(--text-muted);
          font-weight: 300;
          margin-top: 3px;
          letter-spacing: 0.8px;
          text-transform: uppercase;
        }

        .lexia-status-pill {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 5px 13px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }
        .lexia-status-pill.idle { background: rgba(52,199,89,0.1); border: 1px solid rgba(52,199,89,0.25); color: #34c759; }
        .lexia-status-pill.analyzing { background: rgba(201,168,76,0.1); border: 1px solid rgba(201,168,76,0.3); color: var(--gold); }
        .lexia-status-pill.searching { background: rgba(74,158,255,0.1); border: 1px solid rgba(74,158,255,0.3); color: var(--blue); }

        .lexia-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
        .lexia-status-pill.analyzing .lexia-dot,
        .lexia-status-pill.searching .lexia-dot { animation: lexia-blink 0.9s ease infinite; }
        @keyframes lexia-blink { 0%,100%{opacity:1} 50%{opacity:0.2} }

        .lexia-sources-row { display: flex; gap: 6px; flex-wrap: wrap; }
        .lexia-src {
          padding: 2px 9px;
          border-radius: 4px;
          font-size: 9.5px;
          font-weight: 600;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          background: rgba(201,168,76,0.07);
          border: 1px solid rgba(201,168,76,0.15);
          color: rgba(201,168,76,0.7);
        }

        .lexia-categories {
          padding: 14px 28px 14px;
          display: flex;
          gap: 8px;
          overflow-x: auto;
          scrollbar-width: none;
          background: rgba(13,17,23,0.6);
          border-bottom: 1px solid var(--border);
        }
        .lexia-categories::-webkit-scrollbar { display: none; }

        .lexia-cat-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text-muted);
          font-family: 'Source Sans 3', sans-serif;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s;
          flex-shrink: 0;
        }
        .lexia-cat-btn:hover { border-color: rgba(255,255,255,0.15); color: var(--text); }

        .lexia-messages {
          flex: 1;
          overflow-y: auto;
          padding: 24px 28px 12px;
          display: flex;
          flex-direction: column;
          gap: 22px;
          scrollbar-width: thin;
          scrollbar-color: rgba(201,168,76,0.15) transparent;
        }

        .lexia-welcome { padding: 32px 0 16px; animation: lexia-rise 0.5s ease both; }
        @keyframes lexia-rise { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }

        .lexia-welcome-badge {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 4px 14px;
          border-radius: 20px;
          background: rgba(201,168,76,0.08);
          border: 1px solid rgba(201,168,76,0.2);
          color: var(--gold);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          margin-bottom: 18px;
        }

        .lexia-welcome h2 {
          font-family: 'Playfair Display', serif;
          font-size: 28px;
          font-weight: 900;
          color: #fff;
          line-height: 1.2;
          margin: 0 0 10px;
        }
        .lexia-welcome h2 em { font-style: italic; color: var(--gold-light); }
        .lexia-welcome p { font-size: 14px; color: var(--text-muted); font-weight: 300; line-height: 1.7; max-width: 580px; margin: 0 0 28px; }

        .lexia-prompt-section { margin-bottom: 10px; }
        .lexia-prompt-section-title {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: var(--text-dim);
          margin-bottom: 8px;
          padding-left: 2px;
        }
        .lexia-prompt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .lexia-prompt-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 11px 13px;
          cursor: pointer;
          text-align: left;
          color: var(--text-muted);
          font-family: 'Source Sans 3', sans-serif;
          font-size: 12px;
          line-height: 1.45;
          transition: all 0.2s;
        }
        .lexia-prompt-card:hover { background: var(--surface2); border-color: rgba(201,168,76,0.25); color: var(--text); }

        .lexia-msg { display: flex; gap: 13px; animation: lexia-rise 0.3s ease both; }
        .lexia-msg.user { flex-direction: row-reverse; }

        .lexia-avatar {
          width: 34px; height: 34px;
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-size: 15px;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .lexia-avatar-ai {
          background: linear-gradient(135deg, #8b6914, #c9a84c);
          box-shadow: 0 0 14px rgba(201,168,76,0.25);
        }
        .lexia-avatar-user { background: var(--surface2); border: 1px solid var(--border); }

        .lexia-bubble {
          max-width: 78%;
          padding: 14px 17px;
          border-radius: 14px;
          font-size: 13.5px;
          line-height: 1.7;
        }
        .lexia-bubble-ai {
          background: var(--surface);
          border: 1px solid var(--border);
          color: var(--text);
          border-top-left-radius: 4px;
        }
        .lexia-bubble-user {
          background: linear-gradient(135deg, rgba(201,168,76,0.18), rgba(201,168,76,0.08));
          border: 1px solid rgba(201,168,76,0.25);
          border-top-right-radius: 4px;
        }
        .lexia-bubble-error { background: rgba(255,77,77,0.07); border-color: rgba(255,77,77,0.2); color: rgba(255,120,120,0.9); }

        .lexia-provider-row {
          margin-top: 10px;
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .lexia-provider-label {
          font-size: 10px;
          color: var(--text-dim);
          text-transform: uppercase;
          letter-spacing: 0.6px;
          flex-shrink: 0;
        }
        .lexia-provider-select {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text-muted);
          font-family: 'Source Sans 3', sans-serif;
          font-size: 12px;
          padding: 6px 28px 6px 10px;
          cursor: pointer;
          max-width: 100%;
        }
        .lexia-provider-select:focus {
          outline: none;
          border-color: rgba(201, 168, 76, 0.35);
        }
        .lexia-provider-hint {
          font-size: 10px;
          color: var(--text-dim);
          width: 100%;
          margin-top: 4px;
          line-height: 1.4;
        }

        .lexia-search-tag {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 9px;
          background: rgba(74,158,255,0.08);
          border: 1px solid rgba(74,158,255,0.2);
          border-radius: 5px;
          font-size: 10.5px;
          color: var(--blue);
          font-weight: 600;
          margin-bottom: 10px;
        }
        .lexia-internal-tag {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 9px;
          background: rgba(52,199,89,0.08);
          border: 1px solid rgba(52,199,89,0.22);
          border-radius: 5px;
          font-size: 10.5px;
          color: #6ecf8a;
          font-weight: 600;
          margin-bottom: 10px;
        }
        .lexia-cloud-tag {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 9px;
          background: rgba(201,168,76,0.08);
          border: 1px solid rgba(201,168,76,0.2);
          border-radius: 5px;
          font-size: 10.5px;
          color: var(--gold);
          font-weight: 600;
          margin-bottom: 10px;
        }

        .lexia-section-title {
          font-family: 'Playfair Display', serif;
          font-size: 15px;
          font-weight: 700;
          color: var(--gold-light);
          margin: 14px 0 6px;
          padding-bottom: 5px;
          border-bottom: 1px solid rgba(201,168,76,0.15);
        }
        .lexia-section-title:first-child { margin-top: 0; }
        .lexia-legal-row {
          padding: 5px 0 5px 10px;
          border-left: 2px solid rgba(201,168,76,0.2);
          margin: 4px 0;
          font-size: 13px;
        }
        .lexia-bullet { padding: 3px 0 3px 16px; position: relative; color: rgba(255,255,255,0.75); font-size: 13px; }
        .lexia-bullet::before { content: '›'; position: absolute; left: 4px; color: var(--gold); font-weight: 700; }
        .lexia-numbered { padding: 3px 0 3px 4px; color: rgba(255,255,255,0.75); font-size: 13px; }
        .lexia-divider { height: 1px; background: var(--border-accent); margin: 10px 0; }
        .lexia-spacer { height: 4px; }
        .lexia-bubble strong { font-weight: 600; color: #fff; }
        .lexia-bubble em { font-style: italic; color: var(--gold-light); }

        .lexia-typing { display: flex; gap: 13px; animation: lexia-rise 0.3s ease both; }
        .lexia-typing-inner {
          padding: 16px 20px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          border-top-left-radius: 4px;
        }
        .lexia-dots { display: flex; gap: 5px; align-items: center; }
        .lexia-dots span {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: var(--gold);
          opacity: 0.5;
          animation: lexia-dot-bounce 1.2s ease infinite;
        }
        .lexia-dots span:nth-child(2) { animation-delay: 0.15s; }
        .lexia-dots span:nth-child(3) { animation-delay: 0.3s; }
        @keyframes lexia-dot-bounce { 0%,60%,100%{transform:translateY(0);opacity:0.5} 30%{transform:translateY(-5px);opacity:1} }
        .lexia-typing-label { font-size: 11px; color: var(--text-dim); margin-top: 6px; }

        .lexia-input-area {
          padding: 14px 28px 20px;
          background: rgba(13,17,23,0.95);
          backdrop-filter: blur(20px);
          border-top: 1px solid var(--border-accent);
        }
        .lexia-input-wrap {
          display: flex;
          align-items: flex-end;
          gap: 10px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 13px;
          padding: 10px 10px 10px 16px;
        }
        .lexia-input-wrap:focus-within {
          border-color: rgba(201,168,76,0.35);
          box-shadow: 0 0 0 3px rgba(201,168,76,0.04);
        }
        .lexia-input-area textarea {
          flex: 1;
          background: none;
          border: none;
          outline: none;
          color: var(--text);
          font-family: 'Source Sans 3', sans-serif;
          font-size: 14px;
          resize: none;
          max-height: 130px;
          min-height: 22px;
          line-height: 1.55;
        }
        .lexia-input-area textarea::placeholder { color: var(--text-dim); }
        .lexia-send-btn {
          width: 36px; height: 36px;
          border-radius: 9px;
          border: none;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          font-size: 15px;
          flex-shrink: 0;
        }
        .lexia-send-btn:not(:disabled) {
          background: linear-gradient(135deg, #8b6914, #c9a84c);
          box-shadow: 0 3px 12px rgba(201,168,76,0.25);
        }
        .lexia-send-btn:disabled { background: var(--surface2); cursor: not-allowed; opacity: 0.5; }
        .lexia-input-hint { text-align: center; font-size: 10.5px; color: var(--text-dim); margin-top: 7px; }
      `}</style>

      <div className="lexia-root -mx-3 sm:-mx-4 lg:-mx-6">
        <div className="lexia-container">
          <div className="lexia-header">
            <div className="lexia-header-row">
              <div className="lexia-scales">⚖️</div>
              <div className="lexia-header-titles">
                <h1>LEXIA — Agent juridique</h1>
                <p>Droit des étrangers · Contentieux administratif · Jurisprudence</p>
              </div>
              <div className={`lexia-status-pill ${agentStatus}`}>
                <span className="lexia-dot" />
                {agentStatus === 'idle' && 'Opérationnel'}
                {agentStatus === 'analyzing' && 'Analyse…'}
                {agentStatus === 'searching' && 'Recherche…'}
              </div>
            </div>
            <div className="lexia-sources-row">
              {['Légifrance', "Conseil d'État", 'CAA', 'TA Nantes', 'CJUE', 'CEDH', 'Accords bilatéraux', 'CRRV'].map(
                (s) => (
                  <span key={s} className="lexia-src">
                    {s}
                  </span>
                )
              )}
            </div>
            <div className="lexia-provider-row">
              <span className="lexia-provider-label">Moteur</span>
              <select
                className="lexia-provider-select"
                value={lexiaProvider}
                onChange={(e) => setLexiaProvider(e.target.value as LexiaProviderMode)}
                aria-label="Mode LEXIA"
                disabled={isLoading}
              >
                <option value="auto">Auto (serveur : clé → Anthropic, sinon interne)</option>
                <option value="internal">Base documentaire interne uniquement</option>
                <option value="anthropic">Anthropic (clé API requise)</option>
              </select>
              {lexiaConfig && (
                <div className="lexia-provider-hint">
                  Serveur : <strong>{lexiaConfig.envProvider}</strong>
                  {lexiaConfig.anthropicConfigured ? ' · Anthropic configuré' : ' · Pas de clé Anthropic (Auto → interne)'}
                  {showServerPaths && lexiaConfig.knowledgeDirRelative
                    ? ` · Corpus : ${lexiaConfig.knowledgeDirRelative}`
                    : null}
                </div>
              )}
            </div>
          </div>

          <div className="lexia-categories">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className="lexia-cat-btn"
                style={
                  activeCategory === cat.id
                    ? { borderColor: cat.color, color: cat.color, borderWidth: 1 }
                    : undefined
                }
                onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
              >
                {cat.icon} {cat.label}
              </button>
            ))}
          </div>

          <div className="lexia-messages">
            {messages.length === 0 && (
              <div className="lexia-welcome">
                <div className="lexia-welcome-badge">⚖️ Expertise juridique</div>
                <h2>
                  Bienvenue, Maître.
                  <br />
                  <em>Comment puis-je vous assister ?</em>
                </h2>
                <p>
                  Je recherche et analyse la jurisprudence en droit des étrangers — OQTF, refus de titre, récépissés,
                  plateforme ANEF, référés — pour alimenter vos mémoires contentieux. Selon le moteur choisi ci-dessus :
                  le mode <strong>interne</strong> extrait des passages de vos fichiers sur le serveur (sans API
                  cloud) ; le mode <strong>Anthropic</strong> produit une synthèse via le modèle (vérifiez sources et
                  droit positif).
                </p>

                {activeCategory ? (
                  <div className="lexia-prompt-section">
                    <div className="lexia-prompt-section-title">
                      {categories.find((c) => c.id === activeCategory)?.icon}{' '}
                      {categories.find((c) => c.id === activeCategory)?.label} — Questions suggérées
                    </div>
                    <div className="lexia-prompt-grid">
                      {categories
                        .find((c) => c.id === activeCategory)
                        ?.prompts.map((p, i) => (
                          <button key={i} type="button" className="lexia-prompt-card" onClick={() => void sendMessage(p)}>
                            {p}
                          </button>
                        ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="lexia-prompt-section">
                      <div className="lexia-prompt-section-title">🚨 Cas urgents — Étudiants</div>
                      <div className="lexia-prompt-grid">
                        {[
                          "Jurisprudence récente sur la suspension d'OQTF prononcée contre un étudiant régulièrement inscrit. Quels moyens ont été retenus ?",
                          "Quels recours contre le refus de délivrance d'un récépissé lors d'un renouvellement de titre étudiant ?",
                        ].map((p, i) => (
                          <button key={i} type="button" className="lexia-prompt-card" onClick={() => void sendMessage(p)}>
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="lexia-prompt-section">
                      <div className="lexia-prompt-section-title">⚡ Référés & procédures d&apos;urgence</div>
                      <div className="lexia-prompt-grid">
                        {[
                          'Conditions du référé-mesures utiles pour obtenir un rendez-vous préfectoral. Décisions favorables des TA.',
                          "Recours contre les dysfonctionnements de la plateforme ANEF : quels arguments, quels délais ?",
                        ].map((p, i) => (
                          <button key={i} type="button" className="lexia-prompt-card" onClick={() => void sendMessage(p)}>
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={`lexia-msg ${m.role}`}>
                <div className={`lexia-avatar ${m.role === 'assistant' ? 'lexia-avatar-ai' : 'lexia-avatar-user'}`}>
                  {m.role === 'assistant' ? '⚖️' : '👤'}
                </div>
                <div>
                  {m.role === 'assistant' && m.lexiaProvider === 'internal' && (
                    <div className="lexia-internal-tag">📚 Base documentaire interne</div>
                  )}
                  {m.role === 'assistant' && m.lexiaProvider === 'anthropic' && m.searched && (
                    <div className="lexia-search-tag">🔎 Recherche web (outil modèle)</div>
                  )}
                  {m.role === 'assistant' && m.lexiaProvider === 'anthropic' && !m.searched && (
                    <div className="lexia-cloud-tag">☁️ Synthèse (modèle cloud)</div>
                  )}
                  {m.role === 'assistant' && !m.lexiaProvider && m.searched && (
                    <div className="lexia-search-tag">🔎 Recherche web (outil modèle)</div>
                  )}
                  <div
                    className={`lexia-bubble ${m.role === 'assistant' ? 'lexia-bubble-ai' : 'lexia-bubble-user'} ${
                      m.isError ? 'lexia-bubble-error' : ''
                    }`}
                    dangerouslySetInnerHTML={{ __html: formatMessage(m.content) }}
                  />
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="lexia-typing">
                <div className="lexia-avatar lexia-avatar-ai">⚖️</div>
                <div className="lexia-typing-inner">
                  <div className="lexia-dots">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="lexia-typing-label">
                    {agentStatus === 'searching'
                      ? '🔎 Recherche jurisprudentielle…'
                      : '📋 Analyse juridique en cours…'}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="lexia-input-area">
            <div className="lexia-input-wrap">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 130)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage(input.trim());
                  }
                }}
                placeholder="Ex. : Recherche les décisions du Conseil d'État sur l'OQTF d'un étudiant inscrit…"
                rows={1}
                disabled={isLoading}
              />
              <button
                type="button"
                className="lexia-send-btn"
                onClick={() => void sendMessage(input.trim())}
                disabled={!input.trim() || isLoading}
                title="Envoyer"
              >
                ⚖
              </button>
            </div>
            <div className="lexia-input-hint">Entrée pour envoyer · Shift+Entrée pour nouvelle ligne</div>
          </div>
        </div>
      </div>
    </>
  );
}
