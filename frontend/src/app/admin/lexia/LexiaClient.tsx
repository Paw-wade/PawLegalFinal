'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { getApiBaseUrl, getAuthToken, pawSearchAPI } from '@/lib/api';

type LexiaProviderMode = 'auto' | 'anthropic' | 'gemini' | 'internal' | 'all';

type ChatMessage = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  searched?: boolean;
  isError?: boolean;
  /** Réponse base interne vs modèle cloud vs combinaison */
  lexiaProvider?: 'anthropic' | 'internal' | 'gemini' | 'all';
  /** Clés sources déduites des requêtes web_search (mode Anthropic). */
  sourcesFound?: string[];
  totalToolUses?: number;
};

const PAW_AI_THREADS_KEY = 'pawlegal-paw-ai-threads-v1';
/** Ancienne clé — lecture seule pour migration. */
const LEGACY_ADA_AI_THREADS_KEY = 'pawlegal-ada-ai-threads-v1';
const LEXIA_SIDEBAR_RAIL_COLLAPSED_KEY = 'pawlegal-lexia-sidebar-rail-collapsed';
const MAX_STORED_THREADS = 40;
/** Texte affiché lettre par lettre sur l’accueil Paw AI. */
const LEXIA_ACCUEIL_HELLO = 'Hello';

type ChatThread = {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
};

type PawSearchHit = {
  file: string;
  score: number;
  snippet: string;
  metadata?: {
    juridiction?: string;
    contentType?: string;
    dateIso?: string | null;
    decisionNumber?: string | null;
    ext?: string;
  };
};

function makeThread(): ChatThread {
  return {
    id:
      typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID()
        : `t-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title: 'Nouvelle conversation',
    messages: [],
    updatedAt: Date.now(),
  };
}

function clipTitle(s: string, n = 52) {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

function formatThreadWhen(ts: number) {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ts));
  } catch {
    return '';
  }
}

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
  const rowEmoji =
    /^(🧾|⚖️|⚖|📋|🎯|📌|✅|🔗|🔄|📊|🛡️|🛡|⏱️|⏱|🌍|⚠️|⚠|❌|📐|📎|⚔️|🏛️|🗄️|💡)/u;
  return text
    .split('\n')
    .map((line) => {
      const st = line.trimStart();
      if (/^──\s*SECTION\s+\d+\s*──/i.test(st)) {
        const title = st
          .replace(/^──\s*SECTION\s+\d+\s*──\s*/i, '')
          .replace(/\s*─+$/, '')
          .trim();
        return `<div class="lexia-section-title">${title || st}</div>`;
      }
      if (/^─{10,}$/.test(st) || /^━{10,}$/.test(st)) return '<div class="lexia-divider"></div>';
      if (st.startsWith('## ') || st.startsWith('### ')) {
        return `<div class="lexia-section-title">${st.replace(/^#{2,3} /, '')}</div>`;
      }
      if (rowEmoji.test(st)) {
        return `<div class="lexia-legal-row">${line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</div>`;
      }
      if (line.startsWith('- ') || line.startsWith('• ')) {
        return `<div class="lexia-bullet">${line
          .replace(/^[-•] /, '')
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</div>`;
      }
      if (/^\d+\./.test(line)) {
        return `<div class="lexia-numbered">${line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</div>`;
      }
      if (line === '---') return '<div class="lexia-divider"></div>';
      if (line === '') return '<div class="lexia-spacer"></div>';
      return `<span class="lexia-text-line">${line
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')}</span>`;
    })
    .join('');
}

const SOURCES_LIST = [
  { key: 'legifrance', label: 'Légifrance', color: '#2563eb', url: 'legifrance.gouv.fr' },
  { key: 'conseil-etat', label: "Conseil d'État", color: '#7c3aed', url: 'conseil-etat.fr' },
  { key: 'caa', label: 'CAA', color: '#0891b2', url: 'justice-administrative.gouv.fr' },
  { key: 'ta', label: 'Trib. administratifs', color: '#0284c7', url: 'justice-administrative.gouv.fr' },
  { key: 'cassation', label: 'Cour de cassation', color: '#dc2626', url: 'courdecassation.fr' },
  { key: 'pappers', label: 'Pappers Justice', color: '#d97706', url: 'justice.pappers.fr' },
  { key: 'eurlex', label: 'EUR-Lex / CJUE', color: '#059669', url: 'eur-lex.europa.eu' },
  { key: 'cedh', label: 'CEDH / HUDOC', color: '#0d9488', url: 'hudoc.echr.coe.int' },
  { key: 'gisti', label: 'GISTI', color: '#ea580c', url: 'gisti.org' },
  { key: 'datagouv', label: 'Data.gouv.fr', color: '#6366f1', url: 'data.gouv.fr' },
  { key: 'accords', label: 'Accords bilatéraux', color: '#9333ea', url: 'Traités internationaux' },
] as const;

const SOURCE_GROUPS = [
  { group: '🇫🇷 Juridictions françaises', keys: ['legifrance', 'conseil-etat', 'caa', 'ta', 'cassation'] },
  { group: '🔍 Sources spécialisées', keys: ['pappers', 'gisti', 'datagouv'] },
  { group: '🇪🇺 Sources européennes', keys: ['eurlex', 'cedh'] },
  { group: '📜 Accords internationaux', keys: ['accords'] },
] as const;

/** Thématiques en accordéon (barre latérale étroite, style assistant). */
function SidebarCategoryBlock({
  cat,
  onSelect,
}: {
  cat: Category;
  onSelect: (p: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="lexia-sidebar-cat">
      <button
        type="button"
        className="lexia-sidebar-cat-head"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <span className="lexia-cat-dot" style={{ background: cat.color }} />
        <span className="lexia-sidebar-cat-label">
          {cat.icon} {cat.label}
        </span>
        <span className="lexia-sidebar-cat-chev">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="lexia-sidebar-cat-prompts">
          {cat.prompts.map((p, i) => (
            <button
              key={i}
              type="button"
              className="lexia-sidebar-prompt-line"
              onClick={() => {
                onSelect(p);
                setExpanded(false);
              }}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const categories: Category[] = [
  {
    id: 'oqtf',
    icon: '🚨',
    label: 'OQTF Étudiant',
    color: '#dc2626',
    prompts: [
      "Jurisprudence récente sur la suspension d'OQTF prononcée contre un étudiant régulièrement inscrit. Quels moyens ont été retenus ?",
      "Erreur manifeste d'appréciation dans une OQTF étudiant : jurisprudence des TA.",
      "Quels arguments ont permis l'annulation d'une OQTF étudiant en REP ? Décisions favorables.",
      'OQTF et droit à la scolarité : jurisprudence CEDH art. 2 protocole 1 et art. 8.',
    ],
  },
  {
    id: 'anef',
    icon: '💻',
    label: 'ANEF & Récépissés',
    color: '#d97706',
    prompts: [
      "Décisions condamnant l'État pour dysfonctionnement de la plateforme ANEF et ses conséquences sur le séjour des étudiants.",
      'Droit au récépissé lors d\'un renouvellement de titre étudiant : jurisprudence.',
      "Recours quand un étudiant ne peut pas prendre rendez-vous en préfecture : référé-mesures utiles.",
      "Délais d'instruction abusifs et injonction de statuer : conditions et jurisprudence récente.",
    ],
  },
  {
    id: 'refus',
    icon: '📄',
    label: 'Refus Renouvellement',
    color: '#2563eb',
    prompts: [
      'Décisions annulant un refus de renouvellement de titre étudiant pour insuffisance de motivation.',
      "Éléments à prendre en compte par la préfecture pour renouveler un titre étudiant : jurisprudence CE.",
      "Impact de l'article 8 CEDH dans les recours contre refus de renouvellement étudiant.",
      "Erreur de droit dans l'appréciation du niveau d'études : annulations par les CAA.",
    ],
  },
  {
    id: 'visa',
    icon: '🌍',
    label: 'Visa & CRRV',
    color: '#059669',
    prompts: [
      'Jurisprudence du TA de Nantes sur les recours contre refus de visa étudiant.',
      'Moyens invocables devant la CRRV : jurisprudence et pratique.',
      'Accords bilatéraux applicables en matière de visa étudiant.',
      "Refus de visa long séjour étudiant : charge de la preuve et moyens d'annulation.",
    ],
  },
  {
    id: 'refere',
    icon: '⚡',
    label: 'Référés',
    color: '#7c3aed',
    prompts: [
      'Conditions du référé-suspension en droit des étrangers : urgence et doute sérieux. Jurisprudence récente.',
      'Référé-mesures utiles pour obtenir un RDV préfectoral ou un récépissé : décisions favorables.',
      "Référé-liberté en matière de rétention administrative : quels arguments devant le JLD ?",
      'Ordonnances de référé-suspension du CE contre des OQTF étudiants : critères retenus.',
    ],
  },
  {
    id: 'accords',
    icon: '📜',
    label: 'Accords bilatéraux',
    color: '#9333ea',
    prompts: [
      'Accord franco-algérien 1968 : jurisprudence applicable aux étudiants algériens en situation irrégulière.',
      "Accord d'Ankara : droits des ressortissants turcs étudiants en France, jurisprudence CJUE et CE.",
      'Conventions bilatérales franco-africaines contenant des dispositions favorables aux étudiants.',
      'CEDEAO et libre circulation : invocabilité devant les juridictions administratives françaises.',
    ],
  },
  {
    id: 'retention',
    icon: '🔒',
    label: 'Rétention & Liberté',
    color: '#0891b2',
    prompts: [
      'Jurisprudence Cour de cassation sur le contrôle du JLD en matière de rétention administrative.',
      'Irrégularités de procédure entraînant la remise en liberté : décisions récentes.',
      'Droits fondamentaux en rétention : jurisprudence CEDH art. 5 et art. 3.',
      "Rétention d'un étudiant étranger : quels recours spécifiques devant le JLD ?",
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
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadsReady, setThreadsReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  /** Desktop : panneau latéral réduit à une frise (historique / moteur masqués). */
  const [sidebarRailCollapsed, setSidebarRailCollapsed] = useState(false);
  /** Nombre de caractères de « Hello » visibles (accueil, animation typewriter). */
  const [helloCharIndex, setHelloCharIndex] = useState(0);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agentStatus, setAgentStatus] = useState<'idle' | 'analyzing' | 'searching'>('idle');
  const [openMenu, setOpenMenu] = useState<'srcs' | null>(null);
  const [searchStep, setSearchStep] = useState('');
  /** auto = serveur (clé Anthropic, sinon interne) ; sinon force le mode pour cette session. */
  const [lexiaProvider, setLexiaProvider] = useState<LexiaProviderMode>('auto');
  const [lexiaConfig, setLexiaConfig] = useState<{
    envProvider: LexiaProviderMode;
    anthropicConfigured: boolean;
    geminiConfigured: boolean;
    knowledgeDirRelative?: string;
    anthropicModel?: string;
    geminiModel?: string;
  } | null>(null);
  /** Assistant dialogue vs recherche fichier base interne (API /paw-search). */
  const [lexiaSurface, setLexiaSurface] = useState<'assistant' | 'pawSearch'>('assistant');
  const [pawSearchInput, setPawSearchInput] = useState('');
  const [pawSearchPage, setPawSearchPage] = useState(1);
  const [pawSearchTotalPages, setPawSearchTotalPages] = useState(1);
  const [pawSearchHits, setPawSearchHits] = useState<PawSearchHit[]>([]);
  const [pawSearchTotal, setPawSearchTotal] = useState(0);
  const [pawSearchTookMs, setPawSearchTookMs] = useState<number | null>(null);
  const [pawSearchKnowledgeDir, setPawSearchKnowledgeDir] = useState<string | null>(null);
  const [pawSearchLoading, setPawSearchLoading] = useState(false);
  const [pawSearchError, setPawSearchError] = useState<string | null>(null);
  const [pawSearchFiltersOpen, setPawSearchFiltersOpen] = useState(false);
  const [filterJuridiction, setFilterJuridiction] = useState('');
  const [filterContentType, setFilterContentType] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const pawSearchLastQueryRef = useRef('');
  const bottomRef = useRef<HTMLDivElement>(null);
  /** Après une réponse API, faire défiler vers le début de ce message assistant (pas la fin). */
  const scrollNewAssistantToTopRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const lexiaWelcomeName = useMemo(() => {
    const u = session?.user as
      | {
          name?: string;
          email?: string;
          googleFirstName?: string;
          googleLastName?: string;
        }
      | undefined;
    if (!u) return 'Maître';
    const nameFromGoogle = `${u.googleFirstName || ''} ${u.googleLastName || ''}`.trim();
    return (
      u.name?.trim() ||
      nameFromGoogle ||
      (u.email ? u.email.split('@')[0] : '') ||
      'Maître'
    );
  }, [session]);

  const activeThread = threads.find((t) => t.id === activeThreadId);
  const messages = activeThread?.messages ?? [];
  /** Scroll réservé aux réponses (chat) ou aux résultats Paw Search. */
  const conversationScrollable =
    lexiaSurface === 'pawSearch'
      ? pawSearchHits.length > 0 || pawSearchLoading || !!pawSearchError
      : activeThreadId !== null && (messages.length > 0 || isLoading);

  useEffect(() => {
    try {
      const raw =
        localStorage.getItem(PAW_AI_THREADS_KEY) ?? localStorage.getItem(LEGACY_ADA_AI_THREADS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed) && parsed.length > 0) {
          const cleaned = parsed
            .filter(
              (x): x is ChatThread =>
                x &&
                typeof x === 'object' &&
                typeof (x as ChatThread).id === 'string' &&
                Array.isArray((x as ChatThread).messages)
            )
            .slice(0, MAX_STORED_THREADS);
          if (cleaned.length) {
            setThreads(cleaned);
            setActiveThreadId(null);
            setThreadsReady(true);
            return;
          }
        }
      }
    } catch {
      /* ignore */
    }
    const t = makeThread();
    setThreads([t]);
    setActiveThreadId(null);
    setThreadsReady(true);
  }, []);

  useEffect(() => {
    try {
      if (localStorage.getItem(LEXIA_SIDEBAR_RAIL_COLLAPSED_KEY) === '1') {
        setSidebarRailCollapsed(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LEXIA_SIDEBAR_RAIL_COLLAPSED_KEY, sidebarRailCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [sidebarRailCollapsed]);

  useEffect(() => {
    if (!threadsReady || threads.length === 0) return;
    try {
      const toSave = threads.slice(0, MAX_STORED_THREADS);
      localStorage.setItem(PAW_AI_THREADS_KEY, JSON.stringify(toSave));
    } catch {
      /* ignore */
    }
  }, [threads, threadsReady]);

  useEffect(() => {
    if (!threadsReady || threads.length === 0) return;
    if (activeThreadId !== null && !threads.some((t) => t.id === activeThreadId)) {
      const sorted = [...threads].sort((a, b) => b.updatedAt - a.updatedAt);
      setActiveThreadId(sorted[0].id);
    }
  }, [threads, activeThreadId, threadsReady]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

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
    scrollNewAssistantToTopRef.current = null;
  }, [activeThreadId]);

  useLayoutEffect(() => {
    if (lexiaSurface === 'pawSearch') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    if (isLoading) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    const targetId = scrollNewAssistantToTopRef.current;
    const last = messages[messages.length - 1];
    if (targetId != null && last?.role === 'assistant' && last.id === targetId) {
      const el = document.querySelector<HTMLElement>(`[data-lexia-msg-id="${targetId}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      queueMicrotask(() => {
        scrollNewAssistantToTopRef.current = null;
      });
      return;
    }

    if (targetId != null && (last?.id !== targetId || last?.role !== 'assistant')) {
      queueMicrotask(() => {
        scrollNewAssistantToTopRef.current = null;
      });
    }

    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, lexiaSurface, pawSearchHits, pawSearchLoading]);

  useEffect(() => {
    if (activeThreadId !== null) {
      setHelloCharIndex(0);
      return;
    }
    setHelloCharIndex(0);
    const len = LEXIA_ACCUEIL_HELLO.length;
    const stepMs = 88;
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      setHelloCharIndex((prev) => (n <= len ? n : prev));
      if (n >= len) window.clearInterval(id);
    }, stepMs);
    return () => window.clearInterval(id);
  }, [activeThreadId, lexiaWelcomeName]);

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
          geminiConfigured: Boolean(data?.geminiConfigured),
          knowledgeDirRelative:
            typeof data?.knowledgeDirRelative === 'string' ? data.knowledgeDirRelative : undefined,
          anthropicModel: typeof data?.anthropicModel === 'string' ? data.anthropicModel : undefined,
          geminiModel: typeof data?.geminiModel === 'string' ? data.geminiModel : undefined,
        });
      } catch {
        /* silencieux : l’UI reste utilisable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await pawSearchAPI.getConfig();
        if (cancelled || !data?.success) return;
        if (typeof data.knowledgeDir === 'string') setPawSearchKnowledgeDir(data.knowledgeDir);
      } catch {
        /* silencieux */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runPawSearch = useCallback(
    async (queryText: string, pageNum: number) => {
      const q = queryText.trim();
      if (!q) return;

      setPawSearchLoading(true);
      setPawSearchError(null);
      try {
        const filters: {
          juridiction?: string;
          contentType?: string;
          dateFrom?: string;
          dateTo?: string;
        } = {};
        if (filterJuridiction.trim()) filters.juridiction = filterJuridiction.trim();
        if (filterContentType.trim()) filters.contentType = filterContentType.trim();
        if (filterDateFrom.trim()) filters.dateFrom = filterDateFrom.trim();
        if (filterDateTo.trim()) filters.dateTo = filterDateTo.trim();

        const { data } = await pawSearchAPI.search({
          query: q,
          page: pageNum,
          limit: 12,
          ...(Object.keys(filters).length ? { filters } : {}),
        });

        if (!data?.success) {
          throw new Error(typeof data?.message === 'string' ? data.message : 'Recherche impossible');
        }

        pawSearchLastQueryRef.current = q;
        setPawSearchPage(typeof data.page === 'number' && data.page >= 1 ? data.page : pageNum);
        setPawSearchHits(Array.isArray(data.hits) ? (data.hits as PawSearchHit[]) : []);
        setPawSearchTotal(typeof data.total === 'number' ? data.total : 0);
        setPawSearchTotalPages(typeof data.totalPages === 'number' ? Math.max(1, data.totalPages) : 1);
        setPawSearchTookMs(typeof data.tookMs === 'number' ? data.tookMs : null);
        if (typeof data.knowledgeDir === 'string') setPawSearchKnowledgeDir(data.knowledgeDir);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Erreur réseau';
        setPawSearchError(msg);
        setPawSearchHits([]);
        setPawSearchTotal(0);
        setPawSearchTotalPages(1);
      } finally {
        setPawSearchLoading(false);
      }
    },
    [filterJuridiction, filterContentType, filterDateFrom, filterDateTo]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      setInput('');
      setIsLoading(true);
      setOpenMenu(null);
      setAgentStatus('analyzing');
      setSearchStep('Analyse de la requête…');

      const userMsg: ChatMessage = { role: 'user', content: text, id: Date.now() };

      let tid = activeThreadId;
      let history: { role: 'user' | 'assistant'; content: string }[];

      const sorted = [...threads].sort((a, b) => b.updatedAt - a.updatedAt);
      const threadOk = tid !== null && threads.some((t) => t.id === tid);

      if (!threadOk) {
        const reuseEmpty = sorted.find((t) => t.messages.length === 0);
        if (reuseEmpty) {
          tid = reuseEmpty.id;
          setActiveThreadId(tid);
          history = [];
          setThreads((prev) =>
            prev.map((th) =>
              th.id !== tid
                ? th
                : {
                    ...th,
                    title: clipTitle(text),
                    messages: [userMsg],
                    updatedAt: Date.now(),
                  }
            )
          );
        } else {
          const newT = makeThread();
          tid = newT.id;
          history = [];
          setActiveThreadId(tid);
          setThreads((prev) =>
            [{ ...newT, title: clipTitle(text), messages: [userMsg], updatedAt: Date.now() }, ...prev]
              .filter((th, i, arr) => i === 0 || th.id !== newT.id)
              .slice(0, MAX_STORED_THREADS)
          );
        }
      } else {
        const thread = threads.find((t) => t.id === tid);
        if (!thread) {
          setIsLoading(false);
          setAgentStatus('idle');
          setSearchStep('');
          return;
        }
        history = thread.messages.map((m) => ({ role: m.role, content: m.content }));
        setThreads((prev) =>
          prev.map((th) =>
            th.id !== tid
              ? th
              : {
                  ...th,
                  title: th.messages.length === 0 ? clipTitle(text) : th.title,
                  messages: [...th.messages, userMsg],
                  updatedAt: Date.now(),
                }
          )
        );
      }

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
        const rawSources = data?.sourcesFound;
        const sourcesFound = Array.isArray(rawSources)
          ? rawSources.filter((k: unknown) => typeof k === 'string')
          : [];
        const totalToolUses =
          typeof data?.totalToolUses === 'number' && Number.isFinite(data.totalToolUses)
            ? data.totalToolUses
            : 0;
        const rp = data?.resolvedProvider ?? data?.provider;
        const resolved: ChatMessage['lexiaProvider'] | undefined =
          rp === 'internal'
            ? 'internal'
            : rp === 'anthropic'
              ? 'anthropic'
              : rp === 'gemini'
                ? 'gemini'
                : rp === 'all'
                  ? 'all'
                  : undefined;
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: finalText,
          id: Date.now() + 1,
          searched,
          lexiaProvider: resolved,
          sourcesFound,
          totalToolUses,
        };
        scrollNewAssistantToTopRef.current = assistantMsg.id;
        setThreads((prev) =>
          prev.map((th) =>
            th.id !== tid
              ? th
              : {
                  ...th,
                  messages: [...th.messages, assistantMsg],
                  updatedAt: Date.now(),
                }
          )
        );
      } catch (e: unknown) {
        let msg = e instanceof Error ? e.message : 'Erreur inconnue';
        const low = msg.toLowerCase();
        const looksLikeNetworkFailure =
          low.includes('failed to fetch') ||
          low.includes('networkerror') ||
          low.includes('connection reset') ||
          low.includes('load failed') ||
          (e instanceof TypeError && low.includes('fetch'));
        if (looksLikeNetworkFailure) {
          msg =
            'Impossible de joindre l’API (réseau). En local : démarrez le backend (`npm run dev` dans `backend/`, port 3005) et rechargez la page.';
        }
        const errMsg: ChatMessage = {
          role: 'assistant',
          content: `❌ ${msg}`,
          id: Date.now() + 2,
          isError: true,
        };
        scrollNewAssistantToTopRef.current = errMsg.id;
        setThreads((prev) =>
          prev.map((th) =>
            th.id !== tid ? th : { ...th, messages: [...th.messages, errMsg], updatedAt: Date.now() }
          )
        );
      } finally {
        setIsLoading(false);
        setAgentStatus('idle');
        setSearchStep('');
        inputRef.current?.focus();
      }
    },
    [isLoading, activeThreadId, threads, lexiaProvider, lexiaConfig]
  );

  const startNewThread = useCallback(() => {
    const t = makeThread();
    setThreads((prev) => [t, ...prev].slice(0, MAX_STORED_THREADS));
    setActiveThreadId(t.id);
    setOpenMenu(null);
  }, []);

  const selectThread = useCallback((id: string) => {
    setActiveThreadId(id);
  }, []);

  const goHome = useCallback(() => {
    setActiveThreadId(null);
    setOpenMenu(null);
  }, []);

  const removeThread = useCallback((id: string, e: ReactMouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setThreads((prev) => {
      const next = prev.filter((t) => t.id !== id);
      return next.length === 0 ? [makeThread()] : next;
    });
  }, []);

  const sortedThreads = useMemo(
    () => [...threads].sort((a, b) => b.updatedAt - a.updatedAt),
    [threads]
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
        .lexia-root *, .lexia-root *::before, .lexia-root *::after { box-sizing: border-box; }

        .lexia-root {
          /* Hauteur exacte du <main> (flex), pas calcul viewport — évite scroll page / jeu de ±px */
          flex: 1 1 0%;
          min-height: 0;
          max-height: none;
          /* Pleine largeur du <main> : annule px-3 / sm:px-4 / lg:px-6 du DashboardLayout */
          max-width: none;
          min-width: 0;
          box-sizing: border-box;
          width: calc(100% + 1.5rem);
          margin-left: -0.75rem;
          margin-right: -0.75rem;
          background: hsl(var(--background));
          color: hsl(var(--foreground));
          display: flex;
          flex-direction: row;
          align-items: stretch;
          position: relative;
          z-index: 0;
          isolation: isolate;
          overflow: hidden;
        }
        @media (min-width: 640px) {
          .lexia-root {
            width: calc(100% + 2rem);
            margin-left: -1rem;
            margin-right: -1rem;
          }
        }
        @media (min-width: 1024px) {
          .lexia-root {
            width: calc(100% + 3rem);
            margin-left: -1.5rem;
            margin-right: -1.5rem;
          }
        }
        @media (max-width: 1023px) {
          .lexia-root {
            flex: 1 1 0%;
            min-height: 0;
            margin-top: 0;
          }
        }

        .lexia-root::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 85% 55% at 50% -15%, hsl(var(--primary) / 0.09), transparent 52%);
          pointer-events: none;
          z-index: 0;
          border-radius: inherit;
        }

        .lexia-sidebar-backdrop {
          display: none;
        }
        @media (max-width: 1023px) {
          .lexia-sidebar-backdrop.open {
            display: block;
            position: absolute;
            inset: 0;
            z-index: 24;
            background: hsl(0 0% 0% / 0.45);
            border: none;
            cursor: pointer;
            padding: 0;
            margin: 0;
          }
        }

        .lexia-sidebar {
          flex-shrink: 0;
          align-self: stretch;
          height: 100%;
          width: 272px;
          background: hsl(var(--muted) / 0.45);
          border-right: 1px solid hsl(var(--border));
          display: flex;
          flex-direction: column;
          min-height: 0;
          z-index: 25;
          transition: transform 0.22s ease, width 0.2s ease, opacity 0.2s ease;
        }
        @media (max-width: 1023px) {
          .lexia-sidebar {
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: min(320px, 92vw);
            max-width: 100%;
            transform: translateX(-102%);
            box-shadow: 8px 0 32px -8px hsl(0 0% 0% / 0.2);
            background: hsl(var(--background));
          }
          .lexia-sidebar.open {
            transform: translateX(0);
          }
        }
        /* Desktop : conversations & moteur toujours visibles (le menu burger reste pour tablette uniquement). */
        @media (min-width: 1024px) {
          .lexia-sidebar {
            transform: none !important;
            opacity: 1 !important;
            pointer-events: auto !important;
            width: 272px !important;
            overflow: hidden;
            border-right: 1px solid hsl(var(--border));
          }
          .lexia-sidebar.lexia-sidebar--rail-collapsed {
            width: 44px !important;
            min-width: 44px;
          }
          .lexia-sidebar.lexia-sidebar--rail-collapsed .lexia-sidebar-inner,
          .lexia-sidebar.lexia-sidebar--rail-collapsed .lexia-sidebar-footer {
            display: none !important;
          }
          .lexia-sidebar.lexia-sidebar--rail-collapsed .lexia-sidebar-rail-expand {
            display: flex;
          }
          .lexia-sidebar:not(.lexia-sidebar--rail-collapsed) .lexia-sidebar-rail-expand {
            display: none !important;
          }
        }
        @media (max-width: 1023px) {
          .lexia-sidebar.lexia-sidebar--rail-collapsed {
            width: min(320px, 92vw) !important;
          }
          .lexia-sidebar.lexia-sidebar--rail-collapsed .lexia-sidebar-inner,
          .lexia-sidebar.lexia-sidebar--rail-collapsed .lexia-sidebar-footer {
            display: flex !important;
          }
          .lexia-sidebar.lexia-sidebar--rail-collapsed .lexia-sidebar-footer {
            flex-direction: column;
          }
          .lexia-sidebar-rail-expand {
            display: none !important;
          }
        }

        .lexia-sidebar-rail-expand {
          display: none;
          flex-direction: column;
          align-items: center;
          flex: 1 1 auto;
          min-height: 0;
          padding: 10px 4px;
        }
        .lexia-sidebar-rail-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: calc(var(--radius) - 2px);
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          color: hsl(var(--muted-foreground));
          cursor: pointer;
          flex-shrink: 0;
          transition: border-color 0.15s, background 0.15s, color 0.15s;
        }
        .lexia-sidebar-rail-btn:hover {
          border-color: hsl(var(--ring));
          color: hsl(var(--foreground));
          background: hsl(var(--muted));
        }
        .lexia-sidebar-rail-btn svg {
          width: 18px;
          height: 18px;
        }
        .lexia-sidebar-collapse-floating {
          display: none;
        }
        @media (min-width: 1024px) {
          .lexia-sidebar-collapse-floating {
            display: inline-flex;
            position: absolute;
            top: 12px;
            right: 10px;
            z-index: 3;
          }
          .lexia-sidebar-top {
            padding-right: 42px;
          }
        }
        .lexia-sidebar-inner {
          position: relative;
          display: flex;
          flex-direction: column;
          flex: 1 1 0%;
          min-height: 0;
          padding: 12px 10px 14px;
          gap: 10px;
          overflow: hidden;
        }
        @media (max-width: 639px) {
          .lexia-sidebar-inner {
            padding: 10px 8px 12px;
            gap: 8px;
          }
        }
        .lexia-sidebar-scroll {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          overscroll-behavior: contain;
          scrollbar-gutter: auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding-right: 2px;
          scrollbar-width: thin;
          scrollbar-color: hsl(var(--border)) transparent;
        }
        .lexia-sidebar-scroll::-webkit-scrollbar {
          width: 8px;
        }
        .lexia-sidebar-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .lexia-sidebar-scroll::-webkit-scrollbar-thumb {
          background: hsl(var(--border));
          border-radius: 9999px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }
        .lexia-sidebar-scroll::-webkit-scrollbar-thumb:hover {
          background: hsl(var(--muted-foreground));
          background-clip: padding-box;
        }
        @media (max-width: 639px) {
          .lexia-sidebar-scroll {
            gap: 8px;
            padding-right: 0;
          }
        }
        .lexia-sidebar-top {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 8px;
          flex-shrink: 0;
        }
        .lexia-home-nav {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 9px 12px;
          border-radius: calc(var(--radius) - 2px);
          border: 1px solid hsl(var(--border));
          background: hsl(var(--muted) / 0.35);
          font-size: 12px;
          font-weight: 600;
          color: hsl(var(--muted-foreground));
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s, color 0.15s;
        }
        @media (max-width: 639px) {
          .lexia-home-nav {
            padding: 8px 10px;
            font-size: 11px;
            line-height: 1.3;
          }
        }
        .lexia-home-nav:hover {
          border-color: hsl(var(--ring));
          color: hsl(var(--foreground));
          background: hsl(var(--muted));
        }
        .lexia-new-chat {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 9px 12px;
          border-radius: calc(var(--radius) - 2px);
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          font-size: 12px;
          font-weight: 600;
          color: hsl(var(--foreground));
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
        }
        @media (max-width: 639px) {
          .lexia-new-chat {
            padding: 8px 10px;
            font-size: 11px;
            line-height: 1.3;
          }
        }
        .lexia-new-chat:hover {
          border-color: hsl(var(--primary));
          background: hsl(var(--primary) / 0.06);
        }
        .lexia-sidebar-section-h {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: hsl(var(--muted-foreground));
          padding: 4px 6px 2px;
          flex-shrink: 0;
        }
        @media (max-width: 639px) {
          .lexia-sidebar-section-h {
            font-size: 9px;
            padding: 3px 4px 2px;
          }
        }
        .lexia-hist-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .lexia-hist-item {
          display: flex;
          align-items: stretch;
          gap: 2px;
          width: 100%;
        }
        .lexia-hist-row {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: flex-start;
          gap: 6px;
          text-align: left;
          padding: 8px 8px 8px 10px;
          border-radius: calc(var(--radius) - 2px);
          border: 1px solid transparent;
          background: transparent;
          cursor: pointer;
          color: hsl(var(--foreground));
          transition: background 0.12s, border-color 0.12s;
        }
        .lexia-hist-row:hover {
          background: hsl(var(--accent));
        }
        .lexia-hist-row.active {
          background: hsl(var(--primary) / 0.1);
          border-color: hsl(var(--primary) / 0.25);
        }
        .lexia-hist-meta {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .lexia-hist-title {
          font-size: 12px;
          font-weight: 500;
          line-height: 1.35;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .lexia-hist-when {
          font-size: 10px;
          color: hsl(var(--muted-foreground));
        }
        .lexia-hist-del {
          flex-shrink: 0;
          width: 26px;
          height: 26px;
          border: none;
          border-radius: calc(var(--radius) - 4px);
          background: transparent;
          color: hsl(var(--muted-foreground));
          cursor: pointer;
          font-size: 16px;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.65;
        }
        .lexia-hist-del:hover {
          opacity: 1;
          background: hsl(var(--muted));
          color: hsl(var(--foreground));
        }
        .lexia-sidebar-cat {
          border: 1px solid hsl(var(--border));
          border-radius: calc(var(--radius) - 2px);
          background: hsl(var(--background));
          overflow: hidden;
        }
        .lexia-sidebar-cat-head {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          width: 100%;
          padding: 8px 10px;
          border: none;
          background: transparent;
          cursor: pointer;
          font-size: 12px;
          color: hsl(var(--foreground));
          text-align: left;
        }
        .lexia-sidebar-cat-head:hover {
          background: hsl(var(--muted) / 0.5);
        }
        .lexia-cat-dot {
          width: 7px;
          height: 7px;
          border-radius: 2px;
          flex-shrink: 0;
        }
        .lexia-sidebar-cat-label {
          flex: 1;
          min-width: 0;
          line-height: 1.3;
          white-space: normal;
          word-break: break-word;
        }
        .lexia-sidebar-cat-chev {
          font-size: 9px;
          color: hsl(var(--muted-foreground));
        }
        .lexia-sidebar-cat-prompts {
          border-top: 1px solid hsl(var(--border));
          max-height: 200px;
          overflow-y: auto;
        }
        .lexia-sidebar-prompt-line {
          display: block;
          width: 100%;
          text-align: left;
          padding: 8px 10px;
          border: none;
          border-bottom: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          font-size: 11px;
          line-height: 1.4;
          color: hsl(var(--muted-foreground));
          cursor: pointer;
        }
        .lexia-sidebar-prompt-line:last-child {
          border-bottom: none;
        }
        .lexia-sidebar-prompt-line:hover {
          background: hsl(var(--accent));
          color: hsl(var(--foreground));
        }
        .lexia-sidebar-footer {
          flex-shrink: 0;
          padding: 10px 10px max(10px, env(safe-area-inset-bottom, 0px));
          border-top: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.06);
          display: flex;
          flex-direction: column;
          gap: 6px;
          position: relative;
          z-index: 2;
        }
        @media (min-width: 1024px) {
          .lexia-sidebar-footer {
            box-shadow: none;
            background: hsl(var(--muted) / 0.92);
            backdrop-filter: blur(10px);
          }
        }
        .lexia-sidebar-footer .lexia-provider-label {
          margin-top: 2px;
        }
        .lexia-sidebar-footer .lexia-provider-select {
          width: 100%;
        }

        .lexia-main-column {
          flex: 1;
          min-width: 0;
          min-height: 0;
          max-width: none;
          width: 100%;
          margin: 0;
          display: flex;
          flex-direction: column;
          position: relative;
          z-index: 1;
          overflow: hidden;
        }
        .lexia-main-column--home {
          justify-content: flex-start;
        }

        .lexia-header {
          flex-shrink: 0;
          padding: 10px 16px 10px;
          background: hsl(var(--background) / 0.92);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid hsl(var(--border));
          position: relative;
          z-index: 20;
        }
        @media (min-width: 640px) {
          .lexia-header {
            padding: 12px 20px 10px;
          }
        }

        .lexia-header-row { display: flex; align-items: center; gap: 10px; margin-bottom: 0; }
        @media (min-width: 640px) {
          .lexia-header-row { gap: 12px; margin-bottom: 10px; }
        }
        @media (max-width: 639px) {
          .lexia-header {
            padding: 7px 10px 7px;
          }
          .lexia-header-row {
            position: relative;
            gap: 0;
            justify-content: center;
            align-items: center;
            min-height: 40px;
          }
          .lexia-header-row .lexia-burger {
            position: absolute;
            left: 0;
            top: 50%;
            transform: translateY(-50%);
            z-index: 1;
          }
          .lexia-header-titles {
            flex: none;
            width: 100%;
            max-width: 100%;
            text-align: center;
            padding-left: 40px;
            padding-right: 40px;
            box-sizing: border-box;
          }
        }
        .lexia-burger {
          flex-shrink: 0;
          width: 40px;
          height: 40px;
          border-radius: calc(var(--radius) - 2px);
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 5px;
          padding: 0;
          transition: border-color 0.15s, background 0.15s;
        }
        @media (min-width: 1024px) {
          .lexia-burger {
            display: none;
          }
        }
        @media (max-width: 639px) {
          .lexia-burger {
            width: 34px;
            height: 34px;
            gap: 4px;
          }
          .lexia-burger-line {
            width: 16px;
          }
        }
        .lexia-burger:hover {
          border-color: hsl(var(--ring));
          background: hsl(var(--muted));
        }
        .lexia-burger-line {
          display: block;
          width: 18px;
          height: 2px;
          border-radius: 1px;
          background: hsl(var(--foreground));
        }
        .lexia-header-titles {
          flex: 1;
          min-width: 0;
        }
        .lexia-header-titles h1 {
          font-size: 1.05rem;
          font-weight: 700;
          color: #f97316;
          letter-spacing: -0.02em;
          line-height: 1.2;
          margin: 0;
        }
        @media (max-width: 639px) {
          .lexia-header-titles h1 {
            font-size: 0.93rem;
            line-height: 1.15;
          }
        }
        @media (min-width: 640px) {
          .lexia-header-titles h1 {
            font-size: 1.25rem;
          }
        }
        .lexia-header-titles p {
          font-size: 10px;
          color: hsl(var(--muted-foreground));
          font-weight: 500;
          margin-top: 3px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          line-height: 1.35;
        }
        @media (min-width: 640px) {
          .lexia-header-titles p {
            font-size: 11px;
            margin-top: 4px;
          }
        }

        .lexia-header-tabs {
          display: flex;
          gap: 6px;
          margin-top: 8px;
          flex-wrap: wrap;
        }
        @media (min-width: 640px) {
          .lexia-header-tabs {
            margin-top: 10px;
            gap: 8px;
          }
        }
        .lexia-header-tab {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 9999px;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--muted) / 0.35);
          font-size: 11px;
          font-weight: 600;
          color: hsl(var(--muted-foreground));
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s, color 0.15s;
        }
        @media (min-width: 640px) {
          .lexia-header-tab {
            font-size: 12px;
            padding: 7px 14px;
          }
        }
        .lexia-header-tab:hover {
          border-color: hsl(var(--ring));
          color: hsl(var(--foreground));
          background: hsl(var(--muted) / 0.55);
        }
        .lexia-header-tab.active {
          border-color: rgb(249 115 22 / 0.55);
          color: #ea580c;
          background: rgb(249 115 22 / 0.1);
          box-shadow: 0 0 0 2px rgb(249 115 22 / 0.12);
        }

        .lexia-messages--paw-search {
          flex: 1 1 0;
          min-height: 0;
          overflow-y: auto;
          scrollbar-gutter: stable;
        }

        .lexia-paw-wrap {
          padding: 6px 0 12px;
          max-width: 52rem;
          margin: 0 auto;
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .lexia-paw-lead {
          font-size: 13px;
          color: hsl(var(--muted-foreground));
          line-height: 1.55;
          margin: 0;
        }
        .lexia-paw-meta {
          font-size: 10px;
          color: hsl(var(--muted-foreground));
          letter-spacing: 0.04em;
        }
        .lexia-paw-filters {
          border: 1px solid hsl(var(--border));
          border-radius: var(--radius);
          background: hsl(var(--muted) / 0.25);
          padding: 10px 12px;
        }
        .lexia-paw-filters-summary {
          width: 100%;
          text-align: left;
          border: none;
          background: transparent;
          font-size: 12px;
          font-weight: 600;
          color: hsl(var(--foreground));
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .lexia-paw-filters-panel {
          margin-top: 10px;
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }
        @media (min-width: 520px) {
          .lexia-paw-filters-panel {
            grid-template-columns: 1fr 1fr;
          }
        }
        .lexia-paw-field label {
          display: block;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: hsl(var(--muted-foreground));
          margin-bottom: 4px;
        }
        .lexia-paw-field select,
        .lexia-paw-field input {
          width: 100%;
          font-size: 12px;
          padding: 6px 10px;
          border-radius: calc(var(--radius) - 2px);
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          color: hsl(var(--foreground));
        }
        .lexia-paw-empty {
          text-align: center;
          padding: 24px 12px;
          color: hsl(var(--muted-foreground));
          font-size: 13px;
        }
        .lexia-paw-hits {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .lexia-paw-hit {
          border: 1px solid hsl(var(--border));
          border-radius: var(--radius);
          background: hsl(var(--background));
          padding: 12px 14px;
          text-align: left;
        }
        .lexia-paw-hit-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 8px;
        }
        .lexia-paw-hit-file {
          font-size: 12px;
          font-weight: 600;
          color: hsl(var(--primary));
          word-break: break-word;
          flex: 1;
          min-width: 0;
        }
        .lexia-paw-hit-score {
          font-size: 10px;
          font-weight: 600;
          color: hsl(var(--muted-foreground));
          flex-shrink: 0;
          padding: 2px 8px;
          border-radius: calc(var(--radius) - 4px);
          border: 1px solid hsl(var(--border));
          background: hsl(var(--muted) / 0.35);
        }
        .lexia-paw-hit-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 8px;
        }
        .lexia-paw-tag {
          font-size: 10px;
          padding: 2px 7px;
          border-radius: 9999px;
          background: hsl(var(--muted));
          border: 1px solid hsl(var(--border));
          color: hsl(var(--muted-foreground));
        }
        .lexia-paw-snippet {
          font-size: 12px;
          line-height: 1.55;
          color: hsl(var(--foreground));
          white-space: pre-wrap;
          word-break: break-word;
        }
        .lexia-paw-err {
          padding: 12px;
          border-radius: var(--radius);
          border: 1px solid hsl(0 72% 51%);
          background: hsl(var(--muted));
          color: hsl(0 63% 31%);
          font-size: 13px;
        }
        .dark .lexia-paw-err {
          color: hsl(0 86% 88%);
          border-color: hsl(0 55% 42%);
        }
        .lexia-paw-pagination {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 12px 0 4px;
          flex-wrap: wrap;
        }
        .lexia-paw-page-btn {
          padding: 6px 12px;
          border-radius: calc(var(--radius) - 2px);
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          font-size: 11px;
          font-weight: 600;
          color: hsl(var(--foreground));
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
        }
        .lexia-paw-page-btn:hover:not(:disabled) {
          border-color: rgb(249 115 22 / 0.45);
          background: rgb(249 115 22 / 0.08);
        }
        .lexia-paw-page-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .lexia-dd { position: relative; width: 100%; }
        .lexia-dd-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: calc(var(--radius) - 2px);
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          font-size: 12px;
          font-weight: 500;
          color: hsl(var(--muted-foreground));
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s, background 0.15s;
          width: 100%;
          min-height: 38px;
          text-align: left;
        }
        .lexia-dd-btn:hover {
          border-color: hsl(var(--ring));
          color: hsl(var(--foreground));
        }
        .lexia-dd-btn.open {
          border-color: hsl(var(--primary));
          color: hsl(var(--primary));
          background: hsl(var(--primary) / 0.08);
        }
        .lexia-dd-chev { font-size: 8px; margin-left: auto; flex-shrink: 0; transition: transform 0.2s; }
        .lexia-dd-btn.open .lexia-dd-chev { transform: rotate(180deg); }
        .lexia-dd-panel {
          position: absolute;
          margin-top: 6px;
          left: 0;
          top: 100%;
          right: 0;
          width: 100%;
          background: hsl(var(--background));
          border: 1px solid hsl(var(--border));
          border-radius: var(--radius);
          box-shadow: 0 6px 24px -8px hsl(0 0% 0% / 0.12);
          z-index: 5;
          overflow: hidden;
          max-height: min(52vh, 320px);
          overflow-y: auto;
          animation: lexia-dd-in 0.15s ease both;
        }
        @keyframes lexia-dd-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .lexia-dd-gtitle {
          padding: 8px 12px 6px;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: hsl(var(--muted-foreground));
          border-bottom: 1px solid hsl(var(--border));
          background: hsl(var(--muted));
        }
        .lexia-src-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-bottom: 1px solid hsl(var(--border));
          font-size: 11px;
          color: hsl(var(--muted-foreground));
        }
        .lexia-src-item:last-child { border-bottom: none; }
        .lexia-sdot8 { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .lexia-src-url {
          font-size: 9px;
          color: hsl(var(--muted-foreground));
          margin-left: auto;
          font-weight: 400;
          opacity: 0.85;
          text-align: right;
          max-width: 42%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .lexia-messages {
          min-height: 0;
          overflow-x: hidden;
          overscroll-behavior: contain;
          scrollbar-gutter: auto;
          padding: 8px 14px 6px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          scrollbar-width: thin;
          scrollbar-color: hsl(var(--border)) transparent;
        }
        @media (max-width: 639px) {
          .lexia-messages {
            padding: 8px 10px 6px;
            gap: 10px;
          }
        }
        .lexia-messages.lexia-messages--accueil {
          flex: 1 1 0;
          min-height: 0;
          overflow-x: hidden;
          overflow-y: hidden;
          overscroll-behavior: none;
          scrollbar-width: none;
          -ms-overflow-style: none;
          scrollbar-gutter: auto;
          justify-content: flex-start;
          align-items: stretch;
          padding: 12px 14px 16px;
        }
        .lexia-messages.lexia-messages--accueil::-webkit-scrollbar {
          width: 0;
          height: 0;
          display: none;
        }
        @media (max-width: 639px) {
          .lexia-messages.lexia-messages--accueil {
            justify-content: center;
            align-items: center;
          }
        }
        @media (min-width: 640px) {
          .lexia-messages.lexia-messages--accueil {
            padding: 16px 18px 20px;
          }
        }
        @media (min-width: 1024px) {
          .lexia-messages.lexia-messages--accueil {
            flex: 1 1 0;
            justify-content: center;
            align-items: center;
            padding: 24px 24px 20px;
          }
        }
        @media (max-width: 1023px) {
          .lexia-messages.lexia-messages--accueil {
            flex: 1 1 0;
          }
        }
        .lexia-messages--chat {
          flex: 1 1 0;
          min-height: 0;
          overflow-x: hidden;
          overflow-y: hidden;
        }
        .lexia-messages--chat.lexia-messages--has-conversation {
          overflow-y: auto;
          scrollbar-gutter: stable;
        }
        @media (min-width: 640px) {
          .lexia-messages {
            padding: 10px 18px 8px;
            gap: 12px;
          }
        }
        @media (min-width: 1024px) {
          .lexia-messages {
            padding: 12px 20px 8px;
            gap: 14px;
          }
        }
        .lexia-accueil {
          flex: 0 0 auto;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          width: 100%;
          max-width: none;
          padding: 8px clamp(12px, 4vw, 32px) 0;
          gap: 0;
          animation: lexia-rise 0.45s ease both;
          margin: 0;
          box-sizing: border-box;
        }
        @media (max-width: 639px) {
          .lexia-accueil {
            max-width: 100%;
          }
        }
        .lexia-accueil-badge {
          display: inline-flex;
          align-self: center;
          align-items: center;
          gap: 6px;
          padding: 3px 10px;
          border-radius: 9999px;
          background: hsl(var(--primary) / 0.12);
          border: 1px solid hsl(var(--primary) / 0.28);
          color: hsl(var(--primary));
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        @media (min-width: 640px) {
          .lexia-accueil-badge {
            font-size: 11px;
            padding: 4px 14px;
            margin-bottom: 14px;
          }
        }
        .lexia-accueil-hello {
          font-size: 1.2rem;
          font-weight: 700;
          color: hsl(var(--foreground));
          line-height: 1.25;
          margin: 0 0 4px;
        }
        @media (min-width: 640px) {
          .lexia-accueil-hello {
            font-size: clamp(1.35rem, 2.2vw, 1.75rem);
            margin: 0 0 10px;
          }
        }
        .lexia-accueil-hello em {
          font-style: italic;
          color: hsl(var(--primary));
        }
        .lexia-accueil-hello-type {
          display: inline;
        }
        .lexia-accueil-hello-cursor {
          display: inline-block;
          width: 0.06em;
          margin-left: 1px;
          color: hsl(var(--primary));
          font-weight: 300;
          vertical-align: -0.06em;
          animation: lexia-caret-blink 0.85s step-end infinite;
        }
        @keyframes lexia-caret-blink {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0;
          }
        }
        .lexia-accueil-lead {
          font-size: 13px;
          color: hsl(var(--muted-foreground));
          line-height: 1.55;
          max-width: 42rem;
          margin: 0 0 6px;
        }
        @media (min-width: 640px) {
          .lexia-accueil-lead {
            font-size: 15px;
            line-height: 1.6;
            margin: 0 0 14px;
          }
        }
        .lexia-accueil-hint {
          font-size: 11px;
          color: hsl(var(--muted-foreground));
          margin-bottom: 6px;
          max-width: 42rem;
          line-height: 1.45;
        }
        @media (min-width: 640px) {
          .lexia-accueil-hint {
            font-size: 12px;
            margin-bottom: 14px;
          }
        }

        .lexia-welcome {
          padding: 16px 0 12px;
          animation: lexia-rise 0.5s ease both;
        }
        @media (min-width: 640px) {
          .lexia-welcome {
            padding: 28px 0 16px;
          }
        }
        @keyframes lexia-rise { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }

        .lexia-welcome-badge {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 4px 14px;
          border-radius: 9999px;
          background: hsl(var(--primary) / 0.12);
          border: 1px solid hsl(var(--primary) / 0.28);
          color: hsl(var(--primary));
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-bottom: 18px;
        }

        .lexia-welcome h2 {
          font-size: 1.5rem;
          font-weight: 700;
          color: hsl(var(--foreground));
          line-height: 1.25;
          margin: 0 0 10px;
        }
        .lexia-welcome h2 em { font-style: italic; color: hsl(var(--primary)); }
        .lexia-welcome p {
          font-size: 14px;
          color: hsl(var(--muted-foreground));
          font-weight: 400;
          line-height: 1.65;
          max-width: 620px;
          margin: 0 0 22px;
        }

        .lexia-qgrid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 5px;
          width: 100%;
          max-width: 100%;
        }
        @media (min-width: 640px) {
          .lexia-qgrid {
            grid-template-columns: 1fr 1fr;
            gap: 8px;
          }
        }
        .lexia-qcard {
          background: hsl(var(--muted));
          border: 1px solid hsl(var(--border));
          border-radius: var(--radius);
          padding: 9px 11px;
          cursor: pointer;
          text-align: left;
          color: hsl(var(--muted-foreground));
          font-size: 11px;
          line-height: 1.4;
          transition: border-color 0.15s, background 0.15s, color 0.15s;
          position: relative;
          overflow: hidden;
        }
        .lexia-qcard::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: hsl(var(--primary));
          opacity: 0;
          transition: opacity 0.15s;
        }
        .lexia-qcard:hover {
          background: hsl(var(--accent));
          border-color: hsl(var(--ring));
          color: hsl(var(--foreground));
        }
        .lexia-qcard:hover::before { opacity: 1; }
        @media (min-width: 640px) {
          .lexia-qcard {
            padding: 11px 13px;
            font-size: 12px;
            line-height: 1.45;
          }
        }

        .lexia-msg { display: flex; gap: 13px; animation: lexia-rise 0.3s ease both; }
        .lexia-msg.user {
          flex-direction: row;
          justify-content: flex-end;
          width: 100%;
        }
        .lexia-msg-user-cluster {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 6px;
          max-width: 78%;
          min-width: 0;
        }
        .lexia-msg-user-cluster .lexia-bubble-user {
          max-width: 100%;
        }
        .lexia-msg-user-cluster .lexia-avatar-user {
          margin-top: 0;
        }
        .lexia-msg-body {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 6px;
          min-width: 0;
          flex: 1 1 0%;
        }
        @media (max-width: 639px) {
          .lexia-msg-user-cluster {
            max-width: min(92%, 100%);
          }
          .lexia-msg { gap: 8px; }
        }

        .lexia-avatar {
          width: 34px; height: 34px;
          border-radius: calc(var(--radius) + 2px);
          display: flex; align-items: center; justify-content: center;
          font-size: 15px;
          flex-shrink: 0;
          margin-top: 2px;
        }
        @media (max-width: 639px) {
          .lexia-avatar {
            width: 30px;
            height: 30px;
            font-size: 13px;
          }
        }
        .lexia-avatar-ai {
          background: hsl(var(--primary));
          color: hsl(var(--primary-foreground));
          box-shadow: 0 2px 10px hsl(var(--primary) / 0.35);
        }
        .lexia-avatar-user {
          background: hsl(var(--muted));
          border: 1px solid hsl(var(--border));
          width: auto;
          min-width: 34px;
          max-width: 7.5rem;
          min-height: 34px;
          height: auto;
          padding: 4px 7px;
          font-size: 10px;
          font-weight: 600;
          line-height: 1.2;
          text-align: center;
          word-break: break-word;
          overflow: hidden;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }

        .lexia-bubble {
          max-width: 78%;
          padding: 14px 17px;
          border-radius: var(--radius);
          font-size: 13.5px;
          line-height: 1.7;
          min-width: 0;
        }
        @media (max-width: 639px) {
          .lexia-bubble {
            max-width: calc(100% - 42px);
            padding: 10px 12px;
            font-size: 12.5px;
            line-height: 1.55;
          }
        }
        .lexia-bubble-ai {
          background: hsl(var(--background));
          border: 1px solid hsl(var(--border));
          color: hsl(var(--foreground));
          border-top-left-radius: 4px;
        }
        .lexia-bubble-user {
          background: hsl(var(--secondary));
          border: 1px solid hsl(var(--border));
          color: hsl(var(--foreground));
          border-top-right-radius: 4px;
          border-right: 3px solid hsl(var(--primary));
        }
        .lexia-bubble-error {
          background: hsl(var(--muted));
          border: 1px solid hsl(0 72% 51%);
          color: hsl(0 63% 31%);
        }
        .dark .lexia-bubble-error {
          color: hsl(0 86% 88%);
          border-color: hsl(0 55% 42%);
        }

        .lexia-provider-row {
          margin-top: 10px;
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .lexia-provider-label {
          font-size: 10px;
          color: hsl(var(--muted-foreground));
          text-transform: uppercase;
          letter-spacing: 0.06em;
          flex-shrink: 0;
        }
        .lexia-provider-select {
          background: hsl(var(--background));
          border: 1px solid hsl(var(--border));
          border-radius: calc(var(--radius) - 2px);
          color: hsl(var(--foreground));
          font-size: 12px;
          padding: 6px 28px 6px 10px;
          cursor: pointer;
          max-width: 100%;
        }
        .lexia-provider-select:focus {
          outline: none;
          border-color: hsl(var(--ring));
          box-shadow: 0 0 0 2px hsl(var(--ring) / 0.25);
        }
        .lexia-provider-hint {
          font-size: 10px;
          color: hsl(var(--muted-foreground));
          width: 100%;
          margin-top: 4px;
          line-height: 1.4;
        }

        .lexia-search-tag {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 9px;
          background: hsl(var(--primary) / 0.1);
          border: 1px solid hsl(var(--primary) / 0.28);
          border-radius: calc(var(--radius) - 4px);
          font-size: 10.5px;
          color: hsl(var(--primary));
          font-weight: 600;
          margin-bottom: 10px;
        }
        .lexia-internal-tag {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 9px;
          background: hsl(var(--muted));
          border: 1px solid hsl(var(--border));
          border-radius: calc(var(--radius) - 4px);
          font-size: 10.5px;
          color: hsl(var(--muted-foreground));
          font-weight: 600;
          margin-bottom: 10px;
        }
        .lexia-cloud-tag {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 9px;
          background: hsl(var(--secondary));
          border: 1px solid hsl(var(--border));
          border-radius: calc(var(--radius) - 4px);
          font-size: 10.5px;
          color: hsl(var(--muted-foreground));
          font-weight: 600;
          margin-bottom: 10px;
        }

        .lexia-section-title {
          font-size: 15px;
          font-weight: 700;
          color: hsl(var(--primary));
          margin: 14px 0 6px;
          padding-bottom: 5px;
          border-bottom: 1px solid hsl(var(--border));
        }
        .lexia-section-title:first-child { margin-top: 0; }
        .lexia-text-line {
          display: block;
          color: hsl(var(--muted-foreground));
          font-size: 13.5px;
        }
        .lexia-legal-row {
          padding: 5px 0 5px 10px;
          border-left: 2px solid hsl(var(--primary) / 0.45);
          margin: 4px 0;
          font-size: 13px;
          color: hsl(var(--foreground));
        }
        .lexia-bullet {
          padding: 3px 0 3px 16px;
          position: relative;
          color: hsl(var(--muted-foreground));
          font-size: 13px;
        }
        .lexia-bullet::before {
          content: '›';
          position: absolute;
          left: 4px;
          color: hsl(var(--primary));
          font-weight: 700;
        }
        .lexia-numbered {
          padding: 3px 0 3px 4px;
          color: hsl(var(--muted-foreground));
          font-size: 13px;
        }
        .lexia-divider { height: 1px; background: hsl(var(--border)); margin: 10px 0; }
        .lexia-spacer { height: 4px; }
        .lexia-bubble strong { font-weight: 600; color: hsl(var(--foreground)); }
        .lexia-bubble em { font-style: italic; color: hsl(var(--primary)); }

        .lexia-typing { display: flex; gap: 13px; animation: lexia-rise 0.3s ease both; }
        .lexia-typing-inner {
          padding: 16px 20px;
          background: hsl(var(--background));
          border: 1px solid hsl(var(--border));
          border-radius: var(--radius);
          border-top-left-radius: 4px;
        }
        .lexia-dots { display: flex; gap: 5px; align-items: center; }
        .lexia-dots span {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: hsl(var(--primary));
          opacity: 0.45;
          animation: lexia-dot-bounce 1.2s ease infinite;
        }
        .lexia-dots span:nth-child(2) { animation-delay: 0.15s; }
        .lexia-dots span:nth-child(3) { animation-delay: 0.3s; }
        @keyframes lexia-dot-bounce { 0%,60%,100%{transform:translateY(0);opacity:0.45} 30%{transform:translateY(-5px);opacity:1} }
        .lexia-typing-label { font-size: 11px; color: hsl(var(--muted-foreground)); margin-top: 6px; }
        .lexia-sp-row { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
        .lexia-sp-tag {
          padding: 2px 7px;
          border-radius: calc(var(--radius) - 4px);
          font-size: 9.5px;
          font-weight: 600;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--muted));
          color: hsl(var(--muted-foreground));
        }

        .lexia-input-area {
          flex-shrink: 0;
          padding: 8px 12px 8px;
          padding-bottom: max(8px, env(safe-area-inset-bottom, 0px));
          background: hsl(var(--background) / 0.98);
          backdrop-filter: blur(12px);
          border-top: 1px solid hsl(var(--border));
        }
        @media (max-width: 639px) {
          .lexia-input-area {
            padding: 8px 8px 8px;
            padding-bottom: max(8px, env(safe-area-inset-bottom, 0px));
          }
        }
        @media (min-width: 640px) {
          .lexia-input-area {
            padding: 8px 14px 10px;
            padding-bottom: 10px;
          }
        }
        .lexia-main-column--home .lexia-input-area {
          border-top: 1px solid hsl(var(--border) / 0.65);
          background: hsl(var(--background) / 0.95);
          backdrop-filter: blur(10px);
          width: 100%;
          max-width: none;
          margin: 0;
          padding-top: 12px;
          padding-bottom: 12px;
          padding-left: clamp(12px, 4vw, 28px);
          padding-right: clamp(12px, 4vw, 28px);
          margin-top: 0;
          flex-shrink: 0;
        }
        @media (min-width: 1024px) {
          .lexia-main-column--home .lexia-input-area {
            padding-left: 8px;
            padding-right: 8px;
            padding-bottom: 14px;
          }
        }
        @media (max-width: 1023px) {
          .lexia-main-column--home .lexia-input-area {
            border-top: none;
            background: transparent;
            backdrop-filter: none;
            margin-top: auto;
            padding-top: 8px;
            padding-bottom: max(10px, env(safe-area-inset-bottom, 0px));
          }
        }
        .lexia-input-wrap {
          display: flex;
          align-items: flex-end;
          gap: 10px;
          background: hsl(var(--background));
          border: 1px solid #f97316;
          border-radius: var(--radius);
          padding: 10px 10px 10px 16px;
          max-width: none;
          width: 100%;
          margin: 0;
          box-sizing: border-box;
        }
        @media (max-width: 639px) {
          .lexia-input-wrap {
            padding: 8px 8px 8px 10px;
            gap: 8px;
            border-radius: calc(var(--radius) - 2px);
          }
        }
        .lexia-input-wrap:focus-within {
          border-color: #ea580c;
          box-shadow: 0 0 0 3px rgb(249 115 22 / 0.2);
        }
        .lexia-input-area textarea {
          flex: 1;
          background: none;
          border: none;
          outline: none;
          color: hsl(var(--foreground));
          font-size: 14px;
          resize: none;
          max-height: 130px;
          min-height: 22px;
          line-height: 1.55;
          text-align: left;
          direction: ltr;
        }
        @media (max-width: 639px) {
          .lexia-input-area textarea {
            font-size: 16px;
            line-height: 1.45;
          }
        }
        .lexia-input-area textarea::placeholder {
          color: hsl(var(--muted-foreground));
          text-align: left;
        }
        .lexia-send-btn {
          width: 36px; height: 36px;
          border-radius: calc(var(--radius) - 2px);
          border: none;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          font-size: 15px;
          flex-shrink: 0;
        }
        .lexia-send-btn:not(:disabled) {
          background: hsl(var(--primary));
          color: hsl(var(--primary-foreground));
          box-shadow: 0 2px 10px hsl(var(--primary) / 0.35);
        }
        .lexia-send-btn:not(:disabled):hover { filter: brightness(0.95); }
        .lexia-send-btn:disabled {
          background: hsl(var(--muted));
          cursor: not-allowed;
          opacity: 0.55;
        }
        .lexia-input-hint {
          text-align: center;
          font-size: 10.5px;
          color: hsl(var(--muted-foreground));
          margin-top: 3px;
          margin-bottom: 0;
          line-height: 1.2;
        }
        @media (max-width: 639px) {
          .lexia-header-titles p {
            display: none;
          }
          .lexia-input-hint {
            font-size: 10px;
          }
        }
      `}</style>

      <div className="lexia-root rounded-lg border border-border shadow-sm">
        <button
          type="button"
          className={`lexia-sidebar-backdrop ${sidebarOpen ? 'open' : ''}`}
          aria-label="Fermer le menu"
          onClick={() => setSidebarOpen(false)}
        />
        <aside
          ref={sidebarRef}
          className={`lexia-sidebar ${sidebarOpen ? 'open' : ''}${sidebarRailCollapsed ? ' lexia-sidebar--rail-collapsed' : ''}`}
        >
          <div className="lexia-sidebar-rail-expand">
            <button
              type="button"
              className="lexia-sidebar-rail-btn"
              onClick={() => setSidebarRailCollapsed(false)}
              aria-label="Afficher le panneau latéral Paw AI"
              title="Afficher le panneau"
            >
              <ChevronRight aria-hidden />
            </button>
          </div>

          <div className="lexia-sidebar-inner">
            <button
              type="button"
              className="lexia-sidebar-rail-btn lexia-sidebar-collapse-floating"
              onClick={() => setSidebarRailCollapsed(true)}
              aria-label="Réduire le panneau latéral"
              title="Réduire le panneau"
            >
              <ChevronLeft aria-hidden />
            </button>
            <div className="lexia-sidebar-top">
              <button type="button" className="lexia-home-nav" onClick={goHome}>
                ⌂ Accueil
              </button>
              <button type="button" className="lexia-new-chat" onClick={startNewThread}>
                ✚ Nouvelle discussion
              </button>
            </div>
            <div className="lexia-sidebar-section-h">Historique</div>
            <div className="lexia-sidebar-scroll">
              <div className="lexia-hist-list">
                {sortedThreads.map((t) => (
                  <div key={t.id} className="lexia-hist-item">
                    <button
                      type="button"
                      className={`lexia-hist-row ${t.id === activeThreadId && activeThreadId !== null ? 'active' : ''}`}
                      onClick={() => selectThread(t.id)}
                    >
                      <span className="lexia-hist-meta">
                        <span className="lexia-hist-title">{t.title}</span>
                        <span className="lexia-hist-when">{formatThreadWhen(t.updatedAt)}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="lexia-hist-del"
                      aria-label="Supprimer la conversation"
                      title="Supprimer"
                      onClick={(e) => removeThread(t.id, e)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <div className="lexia-sidebar-section-h" style={{ marginTop: 10 }}>
                Sources
              </div>
              <div className="lexia-dd">
                <button
                  type="button"
                  className={`lexia-dd-btn ${openMenu === 'srcs' ? 'open' : ''}`}
                  onClick={() => setOpenMenu(openMenu === 'srcs' ? null : 'srcs')}
                >
                  🗄️ Bases ({SOURCES_LIST.length}) <span className="lexia-dd-chev">▾</span>
                </button>
                {openMenu === 'srcs' && (
                  <div className="lexia-dd-panel">
                    {SOURCE_GROUPS.map((g) => (
                      <div key={g.group}>
                        <div className="lexia-dd-gtitle">{g.group}</div>
                        {SOURCES_LIST.filter((s) => (g.keys as readonly string[]).includes(s.key)).map((s) => (
                          <div key={s.key} className="lexia-src-item">
                            <span className="lexia-sdot8" style={{ background: s.color }} />
                            <span>{s.label}</span>
                            <span className="lexia-src-url">{s.url}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="lexia-sidebar-footer">
            <span className="lexia-provider-label">Moteur</span>
            <select
              className="lexia-provider-select"
              value={lexiaProvider}
              onChange={(e) => setLexiaProvider(e.target.value as LexiaProviderMode)}
              aria-label="Mode Paw AI"
              disabled={isLoading}
            >
              <option value="auto">Auto (Anthropic → Gemini → interne)</option>
              <option value="internal">Base documentaire interne uniquement</option>
              <option value="anthropic">Anthropic uniquement (clé API)</option>
              <option value="gemini">Gemini uniquement (clé API)</option>
              <option value="all">Tout combiner (interne + Anthropic + Gemini + synthèse)</option>
            </select>
            {lexiaConfig && (
              <div className="lexia-provider-hint">
                Serveur : <strong>{lexiaConfig.envProvider}</strong>
                {lexiaConfig.anthropicConfigured ? ' · Anthropic OK' : ' · Anthropic KO'}
                {lexiaConfig.geminiConfigured ? ' · Gemini OK' : ' · Gemini KO'}
                {lexiaConfig.anthropicModel ? ` · ${lexiaConfig.anthropicModel}` : ''}
                {lexiaConfig.geminiModel ? ` · ${lexiaConfig.geminiModel}` : ''}
                {showServerPaths && lexiaConfig.knowledgeDirRelative
                  ? ` · Corpus : ${lexiaConfig.knowledgeDirRelative}`
                  : null}
              </div>
            )}
          </div>
        </aside>

        <div
          className={`lexia-main-column${
            activeThreadId === null && lexiaSurface === 'assistant' ? ' lexia-main-column--home' : ''
          }`}
        >
          <div className="lexia-header">
            <div className="lexia-header-row">
              <button
                type="button"
                className="lexia-burger"
                onClick={() => setSidebarOpen((v) => !v)}
                aria-expanded={sidebarOpen}
                aria-label="Menu Paw AI"
              >
                <span className="lexia-burger-line" />
                <span className="lexia-burger-line" />
                <span className="lexia-burger-line" />
              </button>
              <div className="lexia-header-titles">
                <h1>Paw AI - Votre assistant juridique</h1>
                <p>Droit des étrangers · Contentieux administratif</p>
              </div>
            </div>
            <div className="lexia-header-tabs" role="tablist" aria-label="Mode Paw AI">
              <button
                type="button"
                role="tab"
                aria-selected={lexiaSurface === 'assistant'}
                className={`lexia-header-tab ${lexiaSurface === 'assistant' ? 'active' : ''}`}
                onClick={() => setLexiaSurface('assistant')}
              >
                Assistant
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={lexiaSurface === 'pawSearch'}
                className={`lexia-header-tab ${lexiaSurface === 'pawSearch' ? 'active' : ''}`}
                onClick={() => setLexiaSurface('pawSearch')}
              >
                <Search aria-hidden width={13} height={13} strokeWidth={2.25} />
                Paw Search
              </button>
            </div>
          </div>

          <div
            className={`lexia-messages ${
              activeThreadId === null && lexiaSurface === 'assistant' ? 'lexia-messages--accueil' : 'lexia-messages--chat'
            }${conversationScrollable ? ' lexia-messages--has-conversation' : ''}${
              lexiaSurface === 'pawSearch' ? ' lexia-messages--paw-search' : ''
            }`}
          >
            {lexiaSurface === 'pawSearch' ? (
              <div className="lexia-paw-wrap">
                <div>
                  <div className="lexia-welcome-badge" style={{ marginBottom: 10 }}>
                    📚 Base documentaire interne
                  </div>
                  <p className="lexia-paw-lead">
                    Recherche plein texte dans les fichiers <strong>.md</strong>, <strong>.txt</strong>,{' '}
                    <strong>.xml</strong>, <strong>.pdf</strong>, <strong>.doc</strong> et <strong>.docx</strong>{' '}
                    indexés sur le serveur (sans appel à un modèle cloud). Affinez avec les
                    filtres optionnels ci-dessous.
                  </p>
                  <p className="lexia-paw-meta">
                    Moteur paw-search-internal
                    {pawSearchTookMs != null && pawSearchHits.length > 0
                      ? ` · dernière requête ${pawSearchTookMs} ms`
                      : ''}
                    {pawSearchTotal > 0 ? ` · ${pawSearchTotal} résultat${pawSearchTotal > 1 ? 's' : ''}` : ''}
                  </p>
                  {showServerPaths && pawSearchKnowledgeDir ? (
                    <p className="lexia-paw-meta" style={{ marginTop: 6, wordBreak: 'break-word' }}>
                      Dossier corpus : {pawSearchKnowledgeDir}
                    </p>
                  ) : null}
                </div>

                <div className="lexia-paw-filters">
                  <button
                    type="button"
                    className="lexia-paw-filters-summary"
                    onClick={() => setPawSearchFiltersOpen((o) => !o)}
                    aria-expanded={pawSearchFiltersOpen}
                  >
                    Filtres optionnels
                    <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>
                      {pawSearchFiltersOpen ? '▾' : '▸'}
                    </span>
                  </button>
                  {pawSearchFiltersOpen && (
                    <div className="lexia-paw-filters-panel">
                      <div className="lexia-paw-field">
                        <label htmlFor="paw-filter-jur">Juridiction</label>
                        <select
                          id="paw-filter-jur"
                          value={filterJuridiction}
                          onChange={(e) => setFilterJuridiction(e.target.value)}
                        >
                          <option value="">Toutes</option>
                          <option value="CE">CE</option>
                          <option value="CAA">CAA</option>
                          <option value="TA">TA</option>
                          <option value="Cassation">Cassation</option>
                          <option value="Autre">Autre</option>
                        </select>
                      </div>
                      <div className="lexia-paw-field">
                        <label htmlFor="paw-filter-type">Type de contenu</label>
                        <select
                          id="paw-filter-type"
                          value={filterContentType}
                          onChange={(e) => setFilterContentType(e.target.value)}
                        >
                          <option value="">Tous</option>
                          <option value="xml">xml</option>
                          <option value="md">md</option>
                          <option value="txt">txt</option>
                          <option value="jurisprudence">jurisprudence</option>
                          <option value="document">document</option>
                        </select>
                      </div>
                      <div className="lexia-paw-field">
                        <label htmlFor="paw-filter-from">Date début (AAAA-MM-JJ)</label>
                        <input
                          id="paw-filter-from"
                          type="date"
                          value={filterDateFrom}
                          onChange={(e) => setFilterDateFrom(e.target.value)}
                        />
                      </div>
                      <div className="lexia-paw-field">
                        <label htmlFor="paw-filter-to">Date fin (AAAA-MM-JJ)</label>
                        <input
                          id="paw-filter-to"
                          type="date"
                          value={filterDateTo}
                          onChange={(e) => setFilterDateTo(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {pawSearchError ? <div className="lexia-paw-err">{pawSearchError}</div> : null}

                {pawSearchLoading && pawSearchHits.length === 0 ? (
                  <div className="lexia-paw-empty">Indexation et recherche en cours…</div>
                ) : null}

                {!pawSearchLoading && pawSearchHits.length === 0 && !pawSearchError ? (
                  <div className="lexia-paw-empty">
                    Saisissez des mots-clés en bas puis Entrée (ou l’icône de recherche) pour lancer Paw Search.
                  </div>
                ) : null}

                <div className="lexia-paw-hits">
                  {pawSearchHits.map((h, idx) => {
                    const md = h.metadata || {};
                    const tags = [
                      md.juridiction,
                      md.dateIso ? String(md.dateIso) : null,
                      md.decisionNumber ? `n° ${md.decisionNumber}` : null,
                      md.contentType,
                    ].filter(Boolean);
                    return (
                      <article key={`${h.file}-${idx}-${h.score}`} className="lexia-paw-hit">
                        <div className="lexia-paw-hit-head">
                          <div className="lexia-paw-hit-file">{h.file}</div>
                          <div className="lexia-paw-hit-score">score {h.score}</div>
                        </div>
                        {tags.length > 0 ? (
                          <div className="lexia-paw-hit-tags">
                            {tags.map((t) => (
                              <span key={String(t)} className="lexia-paw-tag">
                                {String(t)}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className="lexia-paw-snippet">{h.snippet || ''}</div>
                      </article>
                    );
                  })}
                </div>

                {pawSearchTotalPages > 1 && pawSearchHits.length > 0 ? (
                  <div className="lexia-paw-pagination">
                    <button
                      type="button"
                      className="lexia-paw-page-btn"
                      disabled={pawSearchPage <= 1 || pawSearchLoading}
                      onClick={() => void runPawSearch(pawSearchLastQueryRef.current, pawSearchPage - 1)}
                    >
                      Page précédente
                    </button>
                    <span className="lexia-paw-meta">
                      Page {pawSearchPage} / {pawSearchTotalPages}
                    </span>
                    <button
                      type="button"
                      className="lexia-paw-page-btn"
                      disabled={pawSearchPage >= pawSearchTotalPages || pawSearchLoading}
                      onClick={() => void runPawSearch(pawSearchLastQueryRef.current, pawSearchPage + 1)}
                    >
                      Page suivante
                    </button>
                  </div>
                ) : null}

                {pawSearchLoading && pawSearchHits.length > 0 ? (
                  <div className="lexia-paw-empty">Mise à jour des résultats…</div>
                ) : null}
              </div>
            ) : activeThreadId === null ? (
              <div className="lexia-accueil">
                <div className="lexia-accueil-badge">Paw AI · Assistant juridique</div>
                <h2
                  className="lexia-accueil-hello"
                  aria-label={`Hello, ${lexiaWelcomeName}. Heureux de vous retrouver.`}
                >
                  <span className="lexia-accueil-hello-type" aria-hidden>
                    {LEXIA_ACCUEIL_HELLO.slice(0, helloCharIndex)}
                    {helloCharIndex < LEXIA_ACCUEIL_HELLO.length && (
                      <span className="lexia-accueil-hello-cursor">▍</span>
                    )}
                    {helloCharIndex >= LEXIA_ACCUEIL_HELLO.length && (
                      <>
                        {' 👋, '}
                        {lexiaWelcomeName}.
                        <br />
                        <em>Heureux de vous retrouver.</em>
                      </>
                    )}
                  </span>
                </h2>
                <p className="lexia-accueil-lead">
                  Posez une question ci-dessous ou choisissez une suggestion pour lancer une analyse. Vos conversations
                  passées restent disponibles dans le menu à gauche (icône menu).
                </p>
                <div className="lexia-qgrid">
                  {[
                    'Changement de statut étudiant vers salarié : quelles conditions légales (diplôme, contrat, rémunération, autorisation de travail) sont exigées ?',
                    'Quelles sont les principales causes d’OQTF visant les étudiants étrangers ?',
                    'En cas d’OQTF contre un étudiant, quels moyens sont les plus efficaces en référé-suspension et au fond ?',
                    'Retard de traitement d’un renouvellement de titre étudiant : quelles actions urgentes engager ?',
                  ].map((p, i) => (
                    <button key={i} type="button" className="lexia-qcard" onClick={() => void sendMessage(p)}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.length === 0 && (
                  <div className="lexia-welcome">
                    <div className="lexia-welcome-badge">⚖️ Paw AI</div>
                    <h2>
                      Bienvenue, {lexiaWelcomeName}.
                      <br />
                      <em>Comment puis-je vous assister ?</em>
                    </h2>
                    <p>
                      Posez votre question : Paw AI analyse la requête et vous propose une réponse structurée. Vérifiez
                      toujours les sources et le droit positif avant toute décision ou acte juridique.
                    </p>
                    <div className="lexia-qgrid">
                      {[
                        'Changement de statut étudiant vers salarié : quelles conditions légales (diplôme, contrat, rémunération, autorisation de travail) sont exigées ?',
                        'Quelles sont les principales causes d’OQTF visant les étudiants étrangers ?',
                        'En cas d’OQTF contre un étudiant, quels moyens sont les plus efficaces en référé-suspension et au fond ?',
                        'Retard de traitement d’un renouvellement de titre étudiant : quelles actions urgentes engager ?',
                      ].map((p, i) => (
                        <button key={i} type="button" className="lexia-qcard" onClick={() => void sendMessage(p)}>
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((m) =>
                  m.role === 'user' ? (
                    <div key={m.id} className="lexia-msg user" data-lexia-msg-id={m.id}>
                      <div className="lexia-msg-user-cluster">
                        <div
                          className="lexia-avatar lexia-avatar-user"
                          title={lexiaWelcomeName}
                          aria-label={lexiaWelcomeName}
                        >
                          {lexiaWelcomeName}
                        </div>
                        <div
                          className="lexia-bubble lexia-bubble-user"
                          dangerouslySetInnerHTML={{ __html: formatMessage(m.content) }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div key={m.id} className="lexia-msg assistant" data-lexia-msg-id={m.id}>
                      <div className="lexia-avatar lexia-avatar-ai">⚖️</div>
                      <div className="lexia-msg-body">
                        {!m.isError && <div className="lexia-internal-tag">Analyse de la requête</div>}
                        <div
                          className={`lexia-bubble lexia-bubble-ai ${m.isError ? 'lexia-bubble-error' : ''}`}
                          dangerouslySetInnerHTML={{ __html: formatMessage(m.content) }}
                        />
                      </div>
                    </div>
                  )
                )}

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
                        {searchStep || 'Analyse de la requête…'}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="lexia-input-area">
            <div className="lexia-input-wrap">
              <textarea
                ref={inputRef}
                value={lexiaSurface === 'pawSearch' ? pawSearchInput : input}
                onChange={(e) => {
                  if (lexiaSurface === 'pawSearch') setPawSearchInput(e.target.value);
                  else setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 130)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (lexiaSurface === 'pawSearch') void runPawSearch(pawSearchInput, 1);
                    else void sendMessage(input.trim());
                  }
                }}
                placeholder={
                  lexiaSurface === 'pawSearch'
                    ? 'Mots-clés, thème ou n° de décision dans la base documentaire…'
                    : 'Recherchez des informations fiables relatives à votre situation...'
                }
                rows={1}
                disabled={lexiaSurface === 'pawSearch' ? pawSearchLoading : isLoading}
              />
              <button
                type="button"
                className="lexia-send-btn"
                onClick={() => {
                  if (lexiaSurface === 'pawSearch') void runPawSearch(pawSearchInput, 1);
                  else void sendMessage(input.trim());
                }}
                disabled={
                  lexiaSurface === 'pawSearch'
                    ? !pawSearchInput.trim() || pawSearchLoading
                    : !input.trim() || isLoading
                }
                title={lexiaSurface === 'pawSearch' ? 'Lancer Paw Search' : 'Envoyer'}
                aria-label={lexiaSurface === 'pawSearch' ? 'Lancer Paw Search' : 'Envoyer'}
              >
                {lexiaSurface === 'pawSearch' ? <Search aria-hidden width={18} height={18} strokeWidth={2.25} /> : '⚖'}
              </button>
            </div>
            <div className="lexia-input-hint">
              {lexiaSurface === 'pawSearch'
                ? 'Entrée pour rechercher dans le corpus serveur · Shift+Entrée pour nouvelle ligne'
                : 'Entrée pour envoyer · Shift+Entrée pour nouvelle ligne'}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
