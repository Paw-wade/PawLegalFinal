'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ArrowUp, ChevronLeft, ChevronRight, MessageSquare, Search } from 'lucide-react';
import { FORUM_THEMES, type ForumThemeValue } from '@/app/forum/forum-utils';
import { forumAPI, getApiBaseUrl, getAuthToken, lexiaAPI, pawSearchAPI } from '@/lib/api';
import { LexiaMarkdown } from '@/components/lexia/LexiaMarkdown';
import { formatKnowledgeSourceTitle } from '@/lib/lexiaKnowledgeDisplay';

type LexiaProviderMode = 'auto' | 'anthropic' | 'gemini' | 'internal' | 'all';

type LexiaKnowledgeSourceRow = {
  file: string;
  score?: number;
  /** Métadonnées index (juridiction, n° décision, date) — optionnel selon l’API. */
  metadata?: Record<string, unknown>;
};

function filterOpenableKnowledgeSources(raw: unknown): LexiaKnowledgeSourceRow[] {
  if (!Array.isArray(raw)) return [];
  const out: LexiaKnowledgeSourceRow[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const file = (item as { file?: unknown }).file;
    if (typeof file !== 'string') continue;
    const t = file.trim();
    if (!t || t.startsWith('api:')) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    const score = (item as { score?: unknown }).score;
    const rawMeta = (item as { metadata?: unknown }).metadata;
    const metadata =
      rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta)
        ? (rawMeta as Record<string, unknown>)
        : undefined;
    out.push({
      file: t,
      score: typeof score === 'number' && Number.isFinite(score) ? score : undefined,
      metadata,
    });
  }
  return out;
}

type ChatMessage = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  searched?: boolean;
  isError?: boolean;
  /** Réponse en cours de réception (stream SSE Anthropic). */
  streaming?: boolean;
  /** Réponse base interne vs modèle cloud vs combinaison */
  lexiaProvider?: 'anthropic' | 'internal' | 'gemini' | 'all';
  /** Clés sources déduites des requêtes web_search (mode Anthropic). */
  sourcesFound?: string[];
  totalToolUses?: number;
  /** Fichiers corpus (base interne) renvoyés par l’API — ouverture lecture intégrale. */
  lexiaKnowledgeSources?: LexiaKnowledgeSourceRow[];
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
  /** Si la conversation a été publiée sur le forum (id Mongo). */
  forumThreadId?: string;
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

/** Threads avec au moins un message — pour ne pas écraser le cloud avec une seule conversation vide locale. */
function latestMeaningfulThreadTs(threads: ChatThread[]): number {
  let m = 0;
  for (const t of threads) {
    if (t.messages.length > 0) m = Math.max(m, t.updatedAt || 0);
  }
  return m;
}

function normalizeThreadsFromCloud(raw: unknown): ChatThread[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (x): x is ChatThread =>
        x != null &&
        typeof x === 'object' &&
        typeof (x as ChatThread).id === 'string' &&
        Array.isArray((x as ChatThread).messages)
    )
    .slice(0, MAX_STORED_THREADS)
    .map((t) => ({
      ...t,
      title: typeof t.title === 'string' && t.title.trim() ? t.title : 'Nouvelle conversation',
      updatedAt:
        typeof t.updatedAt === 'number' && Number.isFinite(t.updatedAt) ? t.updatedAt : Date.now(),
      messages: Array.isArray(t.messages) ? t.messages : [],
    }));
}

/** Retire les champs purement UI (stream) avant envoi au serveur. */
function sanitizeThreadsForCloud(threads: ChatThread[]): ChatThread[] {
  return threads.slice(0, MAX_STORED_THREADS).map((t) => ({
    ...t,
    messages: t.messages.map(({ streaming: _omit, ...m }) => m),
  }));
}

/** Délai max pour POST /api/lexia (mode « all » ou recherches longues côté serveur). */
const LEXIA_CHAT_FETCH_MS = 180_000;
/** Anthropic en SSE : pas d’abandon à 30–60 s tant que des tokens arrivent. */
const LEXIA_STREAM_MS = 600_000;

/** Aligné sur POST /api/lexia JSON (`buildLexiaChatSuccessPayload`) + discriminant SSE `type`. */
type LexiaSseCompletePayload = {
  success: true;
  text: string;
  sources: unknown[];
  sourcesFound: string[];
  searched: boolean;
  provider?: string;
  resolvedProvider?: string;
  totalToolUses: number;
};

/**
 * Découpe le flux SSE : événements séparés par \n\n ou \r\n\r\n (proxies / Windows).
 * Chaque ligne `data: {...}` est un JSON (format backend Lexia).
 */
function parseLexiaSseChunks(buffer: string): { events: Record<string, unknown>[]; rest: string } {
  const events: Record<string, unknown>[] = [];
  const normalized = buffer.replace(/\r\n/g, '\n');
  let rest = normalized;
  let sep: number;
  while ((sep = rest.indexOf('\n\n')) !== -1) {
    const block = rest.slice(0, sep).trim();
    rest = rest.slice(sep + 2);
    for (const line of block.split('\n')) {
      const trimmed = line.replace(/\r$/, '').trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.startsWith('data: ') ? trimmed.slice(6).trim() : trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        events.push(JSON.parse(payload) as Record<string, unknown>);
      } catch {
        /* ligne SSE invalide ou JSON tronqué — attendu au prochain chunk */
      }
    }
  }
  return { events, rest };
}

function applyLexiaSseEvents(
  events: Record<string, unknown>[],
  onDelta: (t: string) => void
): LexiaSseCompletePayload | null {
  let complete: LexiaSseCompletePayload | null = null;
  for (const ev of events) {
    if (ev.type === 'delta' && typeof ev.text === 'string') {
      onDelta(ev.text);
    }
    if (ev.type === 'error') {
      throw new Error(typeof ev.error === 'string' ? ev.error : 'Erreur Paw AI (stream)');
    }
    if (ev.type === 'complete' && ev.success === true) {
      const text =
        typeof ev.text === 'string' ? ev.text : ev.text != null ? String(ev.text) : '';
      const tu = ev.totalToolUses;
      complete = {
        success: true,
        text,
        sources: Array.isArray(ev.sources) ? ev.sources : [],
        sourcesFound: Array.isArray(ev.sourcesFound)
          ? ev.sourcesFound.filter((s): s is string => typeof s === 'string')
          : [],
        searched: Boolean(ev.searched),
        provider: typeof ev.provider === 'string' ? ev.provider : undefined,
        resolvedProvider: typeof ev.resolvedProvider === 'string' ? ev.resolvedProvider : undefined,
        totalToolUses:
          typeof tu === 'number' && Number.isFinite(tu) ? tu : 0,
      };
    }
  }
  return complete;
}

async function postLexiaAnthropicSse(
  url: string,
  body: { messages: { role: string; content: string }[]; provider: LexiaProviderMode },
  token: string | null,
  onDelta: (chunk: string) => void
): Promise<LexiaSseCompletePayload> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), LEXIA_STREAM_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ ...body, stream: true }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        formatLexiaApiError(res.status, typeof data?.error === 'string' ? data.error : res.statusText)
      );
    }
    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('Flux de réponse indisponible.');
    }
    const decoder = new TextDecoder();
    let buf = '';
    let lastComplete: LexiaSseCompletePayload | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const { events, rest } = parseLexiaSseChunks(buf);
      buf = rest;
      const c = applyLexiaSseEvents(events, onDelta);
      if (c) lastComplete = c;
    }

    if (buf.trim()) {
      const { events } = parseLexiaSseChunks(`${buf}\n\n`);
      const c = applyLexiaSseEvents(events, onDelta);
      if (c) lastComplete = c;
    }

    if (!lastComplete || lastComplete.success !== true) {
      throw new Error('Réponse stream incomplète (pas d’événement complete).');
    }
    return lastComplete;
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchLexiaChat(url: string, init: RequestInit, timeoutMs = LEXIA_CHAT_FETCH_MS): Promise<Response> {
  const ctrl = new AbortController();
  const id = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    window.clearTimeout(id);
  }
}

function formatLexiaApiError(status: number, errStr: string): string {
  const low = (errStr || '').toLowerCase();
  if (
    low.includes('quota') ||
    low.includes('rate limit') ||
    low.includes('resource exhausted') ||
    low.includes('exceeded your current quota') ||
    low.includes('free_tier') ||
    low.includes('generativelanguage.googleapis.com')
  ) {
    return (
      'Quota ou limite de débit atteinte côté modèle cloud (souvent Gemini sur l’offre gratuite). ' +
      'Attendez une minute, choisissez un autre fournisseur Paw AI (Anthropic ou interne), ou vérifiez la facturation / les quotas sur Google AI.'
    );
  }
  if (status === 502 || status === 503) {
    return 'Le fournisseur IA a renvoyé une erreur temporaire. Réessayez dans un instant.';
  }
  const trimmed = (errStr || '').trim();
  return trimmed || `Erreur HTTP ${status}`;
}

/** Texte forum : le fil affiche le corps en brut (pas de HTML). */
function stripHtmlToPlainText(s: string): string {
  if (!s) return '';
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

/** Messages à publier (toute la conversation ou depuis la dernière question utilisateur). */
function getForumPublishSlice(messages: ChatMessage[], scope: 'full' | 'last'): ChatMessage[] {
  let slice = messages;
  if (scope === 'last' && messages.length > 0) {
    let lastUser = -1;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'user') {
        lastUser = i;
        break;
      }
    }
    if (lastUser >= 0) slice = messages.slice(lastUser);
  }
  return slice;
}

/** Corps du fil : en-tête + premier bloc (idéalement la première question). */
function buildForumThreadOpeningBody(slice: ChatMessage[]): string {
  const header = `Discussion importée depuis Paw AI le ${new Date().toLocaleString('fr-FR')}\n\n`;
  const first = slice[0];
  let main = '';
  if (first?.role === 'user') {
    main = stripHtmlToPlainText(first.content);
  } else if (first) {
    const label = first.role === 'assistant' ? (first.isError ? 'Paw AI — erreur' : 'Paw AI') : 'Message';
    main = `${label}\n\n${stripHtmlToPlainText(first.content)}`;
  }
  let combined = `${header}${main.trim()}`;
  if (combined.replace(/\s/g, '').length < 10) {
    combined = `${combined}\n\n(Import Paw AI.)`;
  }
  return combined;
}

/** Texte d’une réponse forum (message suivant le premier). */
function buildForumReplyPostBody(m: ChatMessage): string {
  const label = m.role === 'user' ? 'Question' : m.isError ? 'Paw AI — erreur' : 'Paw AI';
  return `${label}\n\n${stripHtmlToPlainText(m.content)}`.trim();
}

function ensureForumTitle(raw: string): string {
  const t = raw.replace(/\s+/g, ' ').trim() || 'Discussion Paw AI';
  if (t.length >= 5) return t.slice(0, 200);
  return `${t} · forum`.slice(0, 200);
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
    /** Moteur utilisé côté serveur lorsque provider=auto. */
    resolvedForAuto?: LexiaProviderMode;
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
  /** Modal lecture intégrale d’un fichier du corpus (base interne). */
  const [knowledgeReader, setKnowledgeReader] = useState<{
    file: string;
    loading: boolean;
    content: string;
    error: string | null;
    truncated?: boolean;
    empty?: boolean;
  } | null>(null);
  const [filterJuridiction, setFilterJuridiction] = useState('');
  const [filterContentType, setFilterContentType] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [forumModalOpen, setForumModalOpen] = useState(false);
  const [forumBusy, setForumBusy] = useState(false);
  const [forumErr, setForumErr] = useState<string | null>(null);
  const [forumDraftTitle, setForumDraftTitle] = useState('');
  const [forumDraftTheme, setForumDraftTheme] = useState<ForumThemeValue>('autres');
  const [forumScope, setForumScope] = useState<'full' | 'last'>('full');
  const [forumPublishedId, setForumPublishedId] = useState<string | null>(null);
  const pawSearchLastQueryRef = useRef('');
  const bottomRef = useRef<HTMLDivElement>(null);
  /** Après une réponse API, faire défiler vers le début de ce message assistant (pas la fin). */
  const scrollNewAssistantToTopRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const threadsRef = useRef<ChatThread[]>([]);
  const sessionUserIdOrNull =
    status === 'authenticated'
      ? String((session?.user as { id?: string } | undefined)?.id || '').trim() || null
      : null;
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(false);

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

  /** Prénom seul à côté des bulles utilisateur (pas le nom complet dans un encadré). */
  const lexiaChatUserLabel = useMemo(() => {
    const u = session?.user as { googleFirstName?: string } | undefined;
    const fromGoogle = u?.googleFirstName?.trim();
    if (fromGoogle) return fromGoogle;
    const full = lexiaWelcomeName.trim();
    const first = full.split(/\s+/).filter(Boolean)[0];
    return first || full;
  }, [session, lexiaWelcomeName]);

  /** Lien « contactez Ada Papers » : messagerie selon le rôle (demande cible /client/messages pour les clients). */
  const lexiaAdaPapersMessagesHref = useMemo(() => {
    const r = String((session?.user as { role?: string } | undefined)?.role || 'client').toLowerCase();
    if (r === 'partenaire') return '/partenaire/messages';
    if (r === 'admin' || r === 'superadmin') return '/admin/messages';
    return '/client/messages';
  }, [session]);

  const openKnowledgeReader = useCallback((file: string) => {
    const f = String(file || '').trim();
    if (!f || f.startsWith('api:')) return;
    setKnowledgeReader({ file: f, loading: true, content: '', error: null });
    void (async () => {
      try {
        const { data } = await lexiaAPI.readKnowledgeFile(f);
        if (!data?.success) {
          throw new Error(typeof data?.error === 'string' ? data.error : 'Lecture impossible');
        }
        setKnowledgeReader({
          file: typeof data.file === 'string' && data.file ? data.file : f,
          loading: false,
          content: typeof data.content === 'string' ? data.content : '',
          error: null,
          truncated: Boolean(data.truncated),
          empty: Boolean(data.empty),
        });
      } catch (e: unknown) {
        let msg = e instanceof Error ? e.message : 'Erreur réseau';
        if (typeof e === 'object' && e !== null && 'response' in e) {
          const d = (e as { response?: { data?: { error?: string; message?: string } } }).response?.data;
          if (d && typeof d.error === 'string') msg = d.error;
          else if (d && typeof d.message === 'string') msg = d.message;
        }
        setKnowledgeReader({ file: f, loading: false, content: '', error: msg });
      }
    })();
  }, []);

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
    threadsRef.current = threads;
  }, [threads]);

  useEffect(() => {
    setCloudSyncEnabled(false);
  }, [sessionUserIdOrNull]);

  /** Fusion local / serveur une fois la session et le chargement local prêts. */
  useEffect(() => {
    if (status !== 'authenticated' || !sessionUserIdOrNull || !threadsReady) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await lexiaAPI.getChatState();
        if (cancelled) return;
        const remote = normalizeThreadsFromCloud(data?.threads);
        const local = threadsRef.current;
        const localAct = latestMeaningfulThreadTs(local);
        const remoteAct = latestMeaningfulThreadTs(remote);
        if (remote.length > 0 && (localAct === 0 || remoteAct >= localAct)) {
          setThreads(remote);
          setActiveThreadId(null);
        } else if (localAct > remoteAct) {
          await lexiaAPI.putChatState({ threads: sanitizeThreadsForCloud(local) });
        } else if (remote.length === 0 && localAct > 0) {
          await lexiaAPI.putChatState({ threads: sanitizeThreadsForCloud(local) });
        }
      } catch {
        /* hors ligne ou erreur API : conserver le local */
      } finally {
        if (!cancelled) setCloudSyncEnabled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, threadsReady, sessionUserIdOrNull]);

  /** Sauvegarde cloud (debounce) après chaque modification locale. */
  useEffect(() => {
    if (!threadsReady || !cloudSyncEnabled || status !== 'authenticated' || !sessionUserIdOrNull) return;
    const tmr = window.setTimeout(() => {
      void lexiaAPI
        .putChatState({ threads: sanitizeThreadsForCloud(threadsRef.current) })
        .catch(() => {});
    }, 2000);
    return () => window.clearTimeout(tmr);
  }, [threads, threadsReady, cloudSyncEnabled, status, sessionUserIdOrNull]);

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
    if (!knowledgeReader) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setKnowledgeReader(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [knowledgeReader]);

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
          resolvedForAuto:
            typeof data?.resolvedForAuto === 'string'
              ? (data.resolvedForAuto as LexiaProviderMode)
              : undefined,
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

      let streamingAssistantId: number | null = null;
      try {
        const token = await getAuthToken();
        const url = `${getApiBaseUrl().replace(/\/+$/, '')}/lexia`;
        const useAnthropicStream =
          lexiaProvider === 'anthropic' ||
          (lexiaProvider === 'auto' && lexiaConfig?.resolvedForAuto === 'anthropic');

        if (useAnthropicStream) {
          streamingAssistantId = Date.now() + 1;
          const placeholder: ChatMessage = {
            role: 'assistant',
            content: '',
            id: streamingAssistantId,
            streaming: true,
          };
          scrollNewAssistantToTopRef.current = streamingAssistantId;
          setThreads((prev) =>
            prev.map((th) =>
              th.id !== tid
                ? th
                : {
                    ...th,
                    messages: [...th.messages, placeholder],
                    updatedAt: Date.now(),
                  }
            )
          );

          const streamResult = await postLexiaAnthropicSse(
            url,
            {
              messages: [...history, { role: 'user', content: text }],
              provider: lexiaProvider,
            },
            token,
            (delta) => {
              setThreads((prev) =>
                prev.map((th) => {
                  if (th.id !== tid) return th;
                  return {
                    ...th,
                    messages: th.messages.map((m) =>
                      m.id === streamingAssistantId ? { ...m, content: m.content + delta } : m
                    ),
                    updatedAt: Date.now(),
                  };
                })
              );
            }
          );

          const rawSources = streamResult.sourcesFound;
          const sourcesFound = Array.isArray(rawSources)
            ? rawSources.filter((k: unknown) => typeof k === 'string')
            : [];
          const rp = streamResult.resolvedProvider ?? streamResult.provider;
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
          const lexiaKnowledgeSources = filterOpenableKnowledgeSources(streamResult.sources);
          const streamToolUses =
            typeof streamResult.totalToolUses === 'number' && Number.isFinite(streamResult.totalToolUses)
              ? streamResult.totalToolUses
              : 0;

          setThreads((prev) =>
            prev.map((th) =>
              th.id !== tid
                ? th
                : {
                    ...th,
                    messages: th.messages.map((m) =>
                      m.id === streamingAssistantId
                        ? {
                            role: 'assistant',
                            content: streamResult.text,
                            id: streamingAssistantId,
                            searched: Boolean(streamResult.searched),
                            lexiaProvider: resolved,
                            sourcesFound,
                            totalToolUses: streamToolUses,
                            lexiaKnowledgeSources: lexiaKnowledgeSources.length ? lexiaKnowledgeSources : undefined,
                            streaming: false,
                          }
                        : m
                    ),
                    updatedAt: Date.now(),
                  }
            )
          );
        } else {
          const res = await fetchLexiaChat(url, {
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
            const raw = typeof data?.error === 'string' ? data.error : res.statusText;
            throw new Error(formatLexiaApiError(res.status, raw));
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
          const lexiaKnowledgeSources = filterOpenableKnowledgeSources(data?.sources);
          const assistantMsg: ChatMessage = {
            role: 'assistant',
            content: finalText,
            id: Date.now() + 1,
            searched,
            lexiaProvider: resolved,
            sourcesFound,
            totalToolUses,
            lexiaKnowledgeSources: lexiaKnowledgeSources.length ? lexiaKnowledgeSources : undefined,
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
        }
      } catch (e: unknown) {
        if (streamingAssistantId != null) {
          setThreads((prev) =>
            prev.map((th) =>
              th.id !== tid
                ? th
                : {
                    ...th,
                    messages: th.messages.filter((m) => m.id !== streamingAssistantId),
                    updatedAt: Date.now(),
                  }
            )
          );
        }
        let msg = e instanceof Error ? e.message : 'Erreur inconnue';
        const isAbort =
          (e instanceof Error && e.name === 'AbortError') ||
          (e != null && typeof e === 'object' && (e as { name?: string }).name === 'AbortError');
        if (isAbort) {
          msg =
            streamingAssistantId != null
              ? `La requête stream a dépassé ${LEXIA_STREAM_MS / 60_000} minutes (annulation). Réessayez ou raccourcissez la question.`
              : `La requête a dépassé ${LEXIA_CHAT_FETCH_MS / 1000} secondes (annulation côté navigateur). Réessayez ou choisissez un fournisseur plus rapide.`;
        }
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

  const openForumPublishModal = useCallback(() => {
    if (!activeThreadId) return;
    const th = threads.find((t) => t.id === activeThreadId);
    if (!th || th.messages.length === 0) return;
    setForumPublishedId(null);
    setForumDraftTitle(th.title);
    setForumDraftTheme('autres');
    setForumScope('full');
    setForumErr(null);
    setForumModalOpen(true);
  }, [activeThreadId, threads]);

  const publishConversationToForum = useCallback(async () => {
    if (!activeThreadId) return;
    const th = threads.find((t) => t.id === activeThreadId);
    if (!th) return;
    const slice = getForumPublishSlice(th.messages, forumScope);
    if (slice.length === 0) {
      setForumErr('Aucun message à publier.');
      return;
    }
    const openingBody = buildForumThreadOpeningBody(slice);
    if (openingBody.replace(/\s/g, '').length < 10) {
      setForumErr('Contenu trop court pour le forum (minimum 10 caractères).');
      return;
    }
    const title = ensureForumTitle(forumDraftTitle || th.title);
    setForumBusy(true);
    setForumErr(null);
    try {
      const res = await forumAPI.createThread({
        title,
        body: openingBody,
        theme: forumDraftTheme,
      });
      type CreateRes = { success?: boolean; data?: { _id?: string }; message?: string };
      const payload = res.data as CreateRes;
      if (!payload?.success || !payload.data?._id) {
        throw new Error(
          typeof payload?.message === 'string' ? payload.message : 'Publication impossible'
        );
      }
      const fid = String(payload.data._id);

      const replyFailures: string[] = [];
      for (let i = 1; i < slice.length; i += 1) {
        const replyBody = buildForumReplyPostBody(slice[i]);
        if (replyBody.replace(/\s/g, '').length < 2) continue;
        try {
          const r2 = await forumAPI.replyToThread(fid, { body: replyBody });
          type ReplyRes = { success?: boolean; message?: string };
          const p2 = r2.data as ReplyRes;
          if (!p2?.success) {
            replyFailures.push(
              typeof p2?.message === 'string' ? p2.message : `Réponse ${i + 1} non publiée`
            );
          }
        } catch (re: unknown) {
          let msg = re instanceof Error ? re.message : 'Erreur réseau';
          if (re && typeof re === 'object' && 'response' in re) {
            const ax = re as {
              response?: { data?: { message?: string; errors?: { msg?: string }[] } };
            };
            const m2 =
              ax.response?.data?.errors?.[0]?.msg ||
              (typeof ax.response?.data?.message === 'string' ? ax.response.data.message : null);
            if (m2) msg = m2;
          }
          replyFailures.push(`Message ${i + 1} : ${msg}`);
        }
      }

      setThreads((prev) =>
        prev.map((t) => (t.id === activeThreadId ? { ...t, forumThreadId: fid } : t))
      );
      setForumPublishedId(fid);
      if (replyFailures.length > 0) {
        setForumErr(
          `La discussion est en ligne, mais ${replyFailures.length} message(s) n’ont pas pu être publié(s) en réponse : ${replyFailures.join(' — ')}`
        );
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('forumUnreadUpdated'));
      }
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'response' in e) {
        const ax = e as {
          response?: { data?: { message?: string; errors?: { msg?: string }[] } };
        };
        const msg =
          ax.response?.data?.errors?.[0]?.msg ||
          (typeof ax.response?.data?.message === 'string' ? ax.response.data.message : null);
        if (msg) {
          setForumErr(msg);
          return;
        }
      }
      setForumErr(e instanceof Error ? e.message : 'Erreur réseau');
    } finally {
      setForumBusy(false);
    }
  }, [activeThreadId, threads, forumDraftTitle, forumDraftTheme, forumScope]);

  const closeForumModal = useCallback(() => {
    setForumModalOpen(false);
    setForumErr(null);
    setForumPublishedId(null);
  }, []);

  const sortedThreads = useMemo(
    () => [...threads].sort((a, b) => b.updatedAt - a.updatedAt),
    [threads]
  );

  if (status === 'loading' || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-600 dark:text-slate-300">
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
          /* Texte secondaire : ardoise légèrement bleutée, plus lisible qu’un gris neutre */
          --lexia-readable-muted: 222 32% 34%;
          display: flex;
          flex-direction: row;
          align-items: stretch;
          position: relative;
          z-index: 0;
          isolation: isolate;
          overflow: hidden;
        }
        .dark .lexia-root {
          --lexia-readable-muted: 215 22% 76%;
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
          color: hsl(var(--lexia-readable-muted));
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
          color: hsl(var(--lexia-readable-muted));
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
          color: hsl(var(--lexia-readable-muted));
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
          color: hsl(var(--lexia-readable-muted));
        }
        .lexia-hist-del {
          flex-shrink: 0;
          width: 26px;
          height: 26px;
          border: none;
          border-radius: calc(var(--radius) - 4px);
          background: transparent;
          color: hsl(var(--lexia-readable-muted));
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
        .lexia-hist-forum {
          flex-shrink: 0;
          width: 26px;
          height: 26px;
          display: flex;
          align-items: center;
          justify-content: center;
          align-self: center;
          border-radius: calc(var(--radius) - 4px);
          color: hsl(var(--primary));
          font-size: 12px;
          font-weight: 700;
          text-decoration: none;
          opacity: 0.8;
        }
        .lexia-hist-forum:hover {
          opacity: 1;
          background: hsl(var(--muted));
        }
        .lexia-forum-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 10050;
          background: hsl(0 0% 0% / 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .lexia-forum-modal-panel {
          width: 100%;
          max-width: 420px;
          max-height: min(90vh, 560px);
          overflow: auto;
          border-radius: var(--radius);
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          box-shadow: 0 12px 40px hsl(0 0% 0% / 0.18);
          padding: 18px 18px 16px;
        }
        .lexia-forum-modal-panel h2 {
          font-size: 16px;
          font-weight: 600;
          margin: 0 0 12px;
          line-height: 1.3;
        }
        .lexia-forum-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 12px;
          font-size: 12px;
          color: hsl(var(--lexia-readable-muted));
        }
        .lexia-forum-field input,
        .lexia-forum-field select {
          font-size: 14px;
          padding: 8px 10px;
          border-radius: calc(var(--radius) - 2px);
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          color: hsl(var(--foreground));
        }
        .lexia-forum-field input:disabled,
        .lexia-forum-field select:disabled {
          opacity: 0.65;
        }
        .lexia-forum-scope {
          border: none;
          margin: 0 0 12px;
          padding: 0;
          font-size: 13px;
        }
        .lexia-forum-scope legend {
          font-size: 12px;
          color: hsl(var(--lexia-readable-muted));
          margin-bottom: 8px;
          padding: 0;
        }
        .lexia-forum-scope label {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
          cursor: pointer;
          color: hsl(var(--foreground));
        }
        .lexia-forum-scope input[type='radio'] {
          accent-color: hsl(var(--primary));
        }
        .lexia-forum-err {
          font-size: 13px;
          color: hsl(var(--destructive));
          margin: 0 0 12px;
        }
        .lexia-forum-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 4px;
        }
        .lexia-forum-btn-primary,
        .lexia-forum-btn-secondary {
          font-size: 13px;
          font-weight: 600;
          padding: 8px 14px;
          border-radius: calc(var(--radius) - 2px);
          cursor: pointer;
          border: 1px solid transparent;
        }
        .lexia-forum-btn-primary {
          background: hsl(var(--primary));
          color: hsl(var(--primary-foreground));
        }
        .lexia-forum-btn-primary:hover:not(:disabled) {
          filter: brightness(1.05);
        }
        .lexia-forum-btn-secondary {
          background: hsl(var(--muted));
          color: hsl(var(--foreground));
          border-color: hsl(var(--border));
        }
        .lexia-forum-btn-primary:disabled,
        .lexia-forum-btn-secondary:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .lexia-forum-success-link {
          display: inline-block;
          font-size: 14px;
          font-weight: 600;
          color: hsl(var(--primary));
          text-decoration: underline;
          margin-bottom: 14px;
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
          color: hsl(var(--lexia-readable-muted));
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
          color: hsl(var(--lexia-readable-muted));
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
          .lexia-header-forum { margin-left: auto; }
        }
        .lexia-header-forum {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          height: 36px;
          padding: 0 10px;
          border-radius: calc(var(--radius) - 2px);
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          color: hsl(var(--foreground));
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
        }
        .lexia-header-forum:hover {
          background: hsl(var(--accent));
          border-color: hsl(var(--primary) / 0.35);
        }
        .lexia-header-forum:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .lexia-header-forum-label {
          display: none;
        }
        @media (min-width: 640px) {
          .lexia-header-forum-label { display: inline; }
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
          .lexia-header-row .lexia-header-forum {
            position: absolute;
            right: 0;
            top: 50%;
            transform: translateY(-50%);
            z-index: 1;
            height: 34px;
            padding: 0 8px;
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
          color: hsl(var(--lexia-readable-muted));
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
          color: hsl(var(--lexia-readable-muted));
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
          color: hsl(var(--lexia-readable-muted));
          line-height: 1.55;
          margin: 0;
        }
        .lexia-paw-meta {
          font-size: 10px;
          color: hsl(var(--lexia-readable-muted));
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
          color: hsl(var(--lexia-readable-muted));
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
          color: hsl(var(--lexia-readable-muted));
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
          color: hsl(var(--lexia-readable-muted));
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
          color: hsl(var(--lexia-readable-muted));
        }
        .lexia-paw-snippet {
          font-size: 12px;
          line-height: 1.55;
          color: hsl(var(--foreground));
          white-space: pre-wrap;
          word-break: break-word;
        }
        .lexia-paw-hit-actions {
          margin-top: 10px;
        }
        .lexia-paw-open-file {
          font-size: 11px;
          font-weight: 600;
          padding: 6px 12px;
          border-radius: calc(var(--radius) - 2px);
          border: 1px solid rgb(249 115 22 / 0.45);
          background: rgb(249 115 22 / 0.1);
          color: #c2410c;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
        }
        .lexia-paw-open-file:hover {
          background: rgb(249 115 22 / 0.18);
          border-color: rgb(249 115 22 / 0.65);
        }
        .lexia-knowledge-strip {
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px dashed hsl(var(--border));
        }
        .lexia-knowledge-strip-label {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: hsl(var(--lexia-readable-muted));
          margin-bottom: 6px;
        }
        .lexia-knowledge-strip-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .lexia-knowledge-strip-btn {
          text-align: left;
          width: 100%;
          font-size: 12px;
          font-weight: 600;
          padding: 6px 10px;
          border-radius: calc(var(--radius) - 2px);
          border: 1px solid hsl(var(--border));
          background: hsl(var(--muted) / 0.25);
          color: hsl(var(--foreground));
          cursor: pointer;
          word-break: break-word;
          transition: border-color 0.15s, background 0.15s;
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: 0.25rem 0.45rem;
        }
        .lexia-knowledge-strip-idx {
          font-variant-numeric: tabular-nums;
          font-weight: 700;
          color: hsl(var(--lexia-readable-muted));
          flex-shrink: 0;
        }
        .lexia-knowledge-strip-ref {
          flex: 1;
          min-width: 12ch;
          font-weight: 600;
          color: hsl(var(--foreground));
        }
        .lexia-knowledge-strip-btn:hover {
          border-color: rgb(249 115 22 / 0.45);
          background: rgb(249 115 22 / 0.08);
        }
        .lexia-knowledge-strip-score {
          font-weight: 500;
          color: hsl(var(--lexia-readable-muted));
        }
        .lexia-knowledge-backdrop {
          position: fixed;
          inset: 0;
          z-index: 12000;
          background: rgba(0, 0, 0, 0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .lexia-knowledge-panel {
          width: min(96vw, 720px);
          max-height: min(88vh, 720px);
          display: flex;
          flex-direction: column;
          background: hsl(var(--background));
          color: hsl(var(--foreground));
          border-radius: 12px;
          border: 1px solid hsl(var(--border));
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
          overflow: hidden;
        }
        .lexia-knowledge-panel-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 14px;
          border-bottom: 1px solid hsl(var(--border));
          flex-shrink: 0;
        }
        .lexia-knowledge-panel-title {
          margin: 0;
          font-size: 13px;
          font-weight: 700;
          line-height: 1.35;
          word-break: break-word;
        }
        .lexia-knowledge-panel-close {
          flex-shrink: 0;
          width: 36px;
          height: 36px;
          border: none;
          border-radius: 8px;
          background: hsl(var(--muted) / 0.5);
          font-size: 22px;
          line-height: 1;
          cursor: pointer;
          color: hsl(var(--foreground));
        }
        .lexia-knowledge-panel-close:hover {
          background: hsl(var(--muted));
        }
        .lexia-knowledge-panel-body {
          padding: 12px 14px 16px;
          overflow: auto;
          flex: 1;
          min-height: 0;
        }
        .lexia-knowledge-panel-err {
          margin: 0;
          font-size: 13px;
          color: hsl(var(--destructive, 0 72% 45%));
        }
        .lexia-knowledge-panel-empty {
          margin: 0;
          font-size: 13px;
          color: hsl(var(--lexia-readable-muted));
        }
        .lexia-knowledge-trunc {
          margin: 10px 0 0;
          font-size: 11px;
          color: hsl(var(--lexia-readable-muted));
        }
        .lexia-knowledge-pre {
          margin: 0;
          font-size: 12px;
          line-height: 1.5;
          white-space: pre-wrap;
          word-break: break-word;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
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
          color: hsl(var(--lexia-readable-muted));
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
          color: hsl(var(--lexia-readable-muted));
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
          color: hsl(var(--lexia-readable-muted));
        }
        .lexia-src-item:last-child { border-bottom: none; }
        .lexia-sdot8 { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .lexia-src-url {
          font-size: 9px;
          color: hsl(var(--lexia-readable-muted));
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
          color: hsl(var(--lexia-readable-muted));
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
          color: hsl(var(--lexia-readable-muted));
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
          color: hsl(var(--lexia-readable-muted));
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
          color: hsl(var(--lexia-readable-muted));
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
          .lexia-avatar:not(.lexia-avatar-user) {
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
          background: transparent;
          border: none;
          box-shadow: none;
          width: auto;
          min-width: 0;
          max-width: none;
          min-height: 0;
          height: auto;
          padding: 0;
          margin-top: 0;
          font-size: 12px;
          font-weight: 600;
          line-height: 1.25;
          text-align: right;
          color: hsl(var(--lexia-readable-muted));
          word-break: normal;
          overflow: visible;
          display: block;
          align-self: flex-end;
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

        .lexia-ai-disclaimer {
          margin: 12px 0 0;
          padding-top: 10px;
          border-top: 1px solid hsl(var(--border));
          font-size: 11px;
          line-height: 1.45;
          color: hsl(var(--lexia-readable-muted));
        }
        .lexia-bubble-error .lexia-ai-disclaimer {
          border-top-color: hsl(0 50% 50% / 0.28);
        }
        .lexia-ai-disclaimer-link {
          color: hsl(var(--primary));
          text-decoration: underline;
          text-underline-offset: 2px;
          font-weight: 600;
        }
        .lexia-ai-disclaimer-link:hover {
          text-decoration-thickness: 2px;
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
          color: hsl(var(--lexia-readable-muted));
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
          color: hsl(var(--lexia-readable-muted));
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
          color: hsl(var(--lexia-readable-muted));
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
          color: hsl(var(--lexia-readable-muted));
          font-weight: 600;
          margin-bottom: 10px;
        }

        .lexia-md {
          font-size: 13.5px;
          line-height: 1.7;
          color: hsl(var(--foreground));
          min-width: 0;
        }
        .lexia-md > :first-child { margin-top: 0; }
        .lexia-md > :last-child { margin-bottom: 0; }
        .lexia-md-h {
          font-weight: 700;
          color: hsl(var(--primary));
          line-height: 1.35;
          margin: 1rem 0 0.45rem;
          padding-bottom: 0.35rem;
          border-bottom: 1px solid hsl(var(--border));
        }
        .lexia-md-h:first-child { margin-top: 0; }
        .lexia-md-h1 { font-size: 1.05rem; }
        .lexia-md-h2 { font-size: 1rem; }
        .lexia-md-h3 { font-size: 0.95rem; border-bottom: none; padding-bottom: 0; opacity: 0.95; }
        .lexia-md-h4, .lexia-md-h5, .lexia-md-h6 { font-size: 0.9rem; border-bottom: none; padding-bottom: 0; }
        .lexia-md-p {
          margin: 0.45rem 0;
          color: hsl(var(--lexia-readable-muted));
        }
        .lexia-md-ul, .lexia-md-ol {
          margin: 0.4rem 0 0.6rem;
          padding-left: 1.35rem;
          color: hsl(var(--lexia-readable-muted));
        }
        .lexia-md-li { margin: 0.25rem 0; }
        .lexia-md-li > .lexia-md-p { margin: 0.2rem 0; }
        .lexia-md-blockquote {
          margin: 0.6rem 0;
          padding: 0.5rem 0.75rem;
          border-left: 3px solid hsl(var(--primary) / 0.45);
          background: hsl(var(--muted) / 0.35);
          border-radius: 0 calc(var(--radius) - 2px) calc(var(--radius) - 2px) 0;
          color: hsl(var(--foreground));
        }
        .lexia-md-blockquote .lexia-md-p { color: inherit; }
        .lexia-md-hr {
          border: none;
          height: 1px;
          background: hsl(var(--border));
          margin: 0.85rem 0;
        }
        .lexia-md-a {
          color: hsl(var(--primary));
          font-weight: 500;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .lexia-md-a:hover { opacity: 0.9; }
        .lexia-md-table-wrap {
          margin: 0.6rem 0;
          overflow-x: auto;
          max-width: 100%;
          border-radius: calc(var(--radius) - 2px);
          border: 1px solid hsl(var(--border));
        }
        .lexia-md-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12.5px;
        }
        .lexia-md-th, .lexia-md-td {
          border: 1px solid hsl(var(--border));
          padding: 0.45rem 0.6rem;
          text-align: left;
          vertical-align: top;
        }
        .lexia-md-th {
          background: hsl(var(--muted) / 0.5);
          font-weight: 600;
          color: hsl(var(--foreground));
        }
        .lexia-md-pre {
          margin: 0.55rem 0;
          padding: 0.65rem 0.85rem;
          overflow-x: auto;
          border-radius: calc(var(--radius) - 2px);
          background: hsl(var(--muted));
          border: 1px solid hsl(var(--border));
          font-size: 12px;
          line-height: 1.5;
        }
        .lexia-md-code-block {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          white-space: pre;
          display: block;
          background: transparent;
          border: none;
          padding: 0;
          font-size: inherit;
        }
        .lexia-md-code-inline {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.88em;
          padding: 0.1em 0.35em;
          border-radius: 4px;
          background: hsl(var(--muted));
          border: 1px solid hsl(var(--border));
          color: hsl(var(--foreground));
        }
        .lexia-md span.lexia-verified {
          display: inline;
          box-decoration-break: clone;
          -webkit-box-decoration-break: clone;
          padding: 0.08em 0.28em;
          margin: 0 0.04em;
          border-radius: 3px;
          font-weight: 600;
          color: hsl(160 48% 22%);
          background: hsl(142 45% 94%);
          border-bottom: 1px solid hsl(152 40% 42% / 0.45);
          line-height: 1.55;
        }
        .lexia-md span.lexia-hypothesis {
          display: inline;
          box-decoration-break: clone;
          -webkit-box-decoration-break: clone;
          padding: 0.08em 0.28em;
          margin: 0 0.04em;
          border-radius: 3px;
          font-weight: 500;
          color: hsl(32 48% 24%);
          background: hsl(38 55% 94%);
          border-bottom: 1px solid hsl(32 55% 44% / 0.4);
          line-height: 1.55;
        }
        .lexia-md span.lexia-caution {
          display: inline;
          box-decoration-break: clone;
          -webkit-box-decoration-break: clone;
          padding: 0.08em 0.28em;
          margin: 0 0.04em;
          border-radius: 3px;
          font-weight: 600;
          color: hsl(0 45% 28%);
          background: hsl(0 55% 96%);
          border-bottom: 1px solid hsl(0 60% 48% / 0.45);
          line-height: 1.55;
        }
        .lexia-md span.lexia-emphasis {
          display: inline;
          box-decoration-break: clone;
          -webkit-box-decoration-break: clone;
          padding: 0.06em 0.28em;
          margin: 0 0.04em;
          border-radius: 3px;
          font-weight: 700;
          color: hsl(var(--primary));
          background: hsl(var(--primary) / 0.08);
          border: 1px solid hsl(var(--primary) / 0.22);
          line-height: 1.55;
        }
        .lexia-md-u.lexia-md-u,
        .lexia-md .lexia-md-u {
          text-decoration: underline;
          text-underline-offset: 3px;
          text-decoration-thickness: 2px;
          text-decoration-color: hsl(152 55% 36%);
        }
        .lexia-md-mark.lexia-md-mark,
        .lexia-md .lexia-md-mark {
          background: hsl(48 70% 90%);
          color: hsl(var(--foreground));
          padding: 0.04em 0.2em;
          border-radius: 2px;
        }
        .dark .lexia-md span.lexia-verified {
          color: hsl(142 45% 90%);
          background: hsl(160 28% 20%);
          border-bottom-color: hsl(152 40% 48% / 0.5);
        }
        .dark .lexia-md span.lexia-hypothesis {
          color: hsl(38 70% 90%);
          background: hsl(32 32% 20%);
          border-bottom-color: hsl(38 55% 50% / 0.45);
        }
        .dark .lexia-md span.lexia-caution {
          color: hsl(0 55% 92%);
          background: hsl(0 28% 22%);
          border-bottom-color: hsl(0 50% 52% / 0.5);
        }
        .dark .lexia-md span.lexia-emphasis {
          background: hsl(var(--primary) / 0.14);
          border-color: hsl(var(--primary) / 0.32);
          color: hsl(var(--primary));
        }
        .dark .lexia-md .lexia-md-u {
          text-decoration-color: hsl(152 50% 55%);
        }
        .dark .lexia-md .lexia-md-mark {
          background: hsl(45 28% 24%);
          color: hsl(48 55% 92%);
        }
        .lexia-bubble-error .lexia-md-p,
        .lexia-bubble-error .lexia-md-li { color: inherit; }
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
        .lexia-typing-label { font-size: 11px; color: hsl(var(--lexia-readable-muted)); margin-top: 6px; }
        .lexia-sp-row { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
        .lexia-sp-tag {
          padding: 2px 7px;
          border-radius: calc(var(--radius) - 4px);
          font-size: 9.5px;
          font-weight: 600;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--muted));
          color: hsl(var(--lexia-readable-muted));
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
          color: hsl(var(--lexia-readable-muted));
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
          background: hsl(var(--secondary));
          color: hsl(var(--secondary-foreground));
          box-shadow: 0 1px 4px hsl(var(--foreground) / 0.08);
        }
        .lexia-send-btn:not(:disabled):hover { filter: brightness(0.97); }
        .lexia-send-btn:not(:disabled) .lexia-send-arrow-assistant {
          color: currentColor !important;
        }
        .lexia-send-btn:not(:disabled) .lexia-send-arrow-assistant circle,
        .lexia-send-btn:not(:disabled) .lexia-send-arrow-assistant line,
        .lexia-send-btn:not(:disabled) .lexia-send-arrow-assistant path,
        .lexia-send-btn:not(:disabled) .lexia-send-arrow-assistant polyline {
          stroke: currentColor !important;
        }
        .lexia-send-btn:disabled .lexia-send-arrow-assistant,
        .lexia-send-btn:disabled .lexia-send-arrow-assistant path,
        .lexia-send-btn:disabled .lexia-send-arrow-assistant line,
        .lexia-send-btn:disabled .lexia-send-arrow-assistant polyline {
          color: hsl(var(--lexia-readable-muted)) !important;
          stroke: hsl(var(--lexia-readable-muted)) !important;
        }
        .lexia-send-btn:disabled {
          background: hsl(var(--muted));
          cursor: not-allowed;
          opacity: 0.55;
        }
        .lexia-input-hint {
          text-align: center;
          font-size: 10.5px;
          color: hsl(var(--lexia-readable-muted));
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
                    {t.forumThreadId ? (
                      <Link
                        href={`/forum/${t.forumThreadId}`}
                        className="lexia-hist-forum"
                        title="Voir sur le forum"
                        aria-label="Voir sur le forum"
                        onClick={(e) => e.stopPropagation()}
                      >
                        ↗
                      </Link>
                    ) : null}
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
              {lexiaSurface === 'assistant' && activeThreadId !== null && messages.length > 0 ? (
                <button
                  type="button"
                  className="lexia-header-forum"
                  onClick={openForumPublishModal}
                  title="Publier cette conversation sur le forum"
                  aria-label="Publier la conversation sur le forum"
                >
                  <MessageSquare aria-hidden width={16} height={16} strokeWidth={2.25} />
                  <span className="lexia-header-forum-label">Forum</span>
                </button>
              ) : null}
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
                    <span style={{ fontSize: 10, color: 'hsl(var(--lexia-readable-muted))' }}>
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
                        <div className="lexia-paw-hit-actions">
                          <button
                            type="button"
                            className="lexia-paw-open-file"
                            onClick={() => openKnowledgeReader(h.file)}
                          >
                            Ouvrir le fichier complet
                          </button>
                        </div>
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
                          {lexiaChatUserLabel}
                        </div>
                        <div className="lexia-bubble lexia-bubble-user">
                          <LexiaMarkdown content={m.content} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div key={m.id} className="lexia-msg assistant" data-lexia-msg-id={m.id}>
                      <div className="lexia-avatar lexia-avatar-ai">⚖️</div>
                      <div className="lexia-msg-body">
                        {!m.isError && <div className="lexia-internal-tag">Analyse de la requête</div>}
                        <div className={`lexia-bubble lexia-bubble-ai ${m.isError ? 'lexia-bubble-error' : ''}`}>
                          <LexiaMarkdown content={m.content} />
                          {!m.isError && m.lexiaKnowledgeSources && m.lexiaKnowledgeSources.length > 0 ? (
                            <div className="lexia-knowledge-strip" role="region" aria-label="Références de la base interne">
                              <div className="lexia-knowledge-strip-label">Références (base interne)</div>
                              <ul className="lexia-knowledge-strip-list">
                                {m.lexiaKnowledgeSources.map((s, idx) => (
                                  <li key={s.file}>
                                    <button
                                      type="button"
                                      className="lexia-knowledge-strip-btn"
                                      title={`Fichier : ${s.file}`}
                                      onClick={() => openKnowledgeReader(s.file)}
                                    >
                                      <span className="lexia-knowledge-strip-idx">{idx + 1}.</span>
                                      <span className="lexia-knowledge-strip-ref">
                                        {formatKnowledgeSourceTitle(s.file, s.metadata)}
                                      </span>
                                      {typeof s.score === 'number' ? (
                                        <span className="lexia-knowledge-strip-score">
                                          · score {s.score.toFixed(1)}
                                        </span>
                                      ) : null}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          <p className="lexia-ai-disclaimer" role="note">
                            Les réponses de Paw AI sont données à titre informatif uniquement et ne remplacent pas un
                            accompagnement personnalisé par Ada Papers. Paw AI peut se tromper ou omettre des éléments
                            importants. Pour une prise en charge sur mesure,{' '}
                            <Link href={lexiaAdaPapersMessagesHref} className="lexia-ai-disclaimer-link">
                              contactez Ada Papers
                            </Link>
                            .
                          </p>
                        </div>
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
                {lexiaSurface === 'pawSearch' ? (
                  <Search aria-hidden width={18} height={18} strokeWidth={2.25} />
                ) : (
                  <ArrowUp
                    className="lexia-send-arrow-assistant"
                    aria-hidden
                    width={18}
                    height={18}
                    strokeWidth={2.5}
                    color="#f97316"
                  />
                )}
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

      {forumModalOpen ? (
        <div
          className="lexia-forum-modal-overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !forumBusy && !forumPublishedId) closeForumModal();
          }}
        >
          <div
            className="lexia-forum-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lexia-forum-modal-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id="lexia-forum-modal-title">Publier sur le forum</h2>
            {forumPublishedId ? (
              <>
                <p style={{ fontSize: 13, margin: '0 0 10px', lineHeight: 1.45 }}>
                  La discussion a été publiée. La première question figure dans le message d’ouverture ; les autres
                  messages ont été ajoutés comme réponses séparées lorsque c’était possible.
                </p>
                {forumErr ? (
                  <p className="lexia-forum-err" style={{ marginBottom: 10 }}>
                    {forumErr}
                  </p>
                ) : null}
                <Link href={`/forum/${forumPublishedId}`} className="lexia-forum-success-link">
                  Ouvrir le fil sur le forum
                </Link>
                <div className="lexia-forum-actions" style={{ marginTop: 8 }}>
                  <button type="button" className="lexia-forum-btn-primary" onClick={closeForumModal}>
                    Fermer
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="lexia-forum-field">
                  <span>Titre</span>
                  <input
                    type="text"
                    value={forumDraftTitle}
                    onChange={(e) => setForumDraftTitle(e.target.value)}
                    maxLength={200}
                    disabled={forumBusy}
                    autoComplete="off"
                  />
                </label>
                <label className="lexia-forum-field">
                  <span>Thème</span>
                  <select
                    value={forumDraftTheme}
                    onChange={(e) => setForumDraftTheme(e.target.value as ForumThemeValue)}
                    disabled={forumBusy}
                  >
                    {FORUM_THEMES.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset className="lexia-forum-scope" disabled={forumBusy}>
                  <legend>Contenu à publier</legend>
                  <p style={{ fontSize: 11, margin: '0 0 8px', color: 'hsl(var(--lexia-readable-muted))', lineHeight: 1.4 }}>
                    Le premier message devient le corps du fil ; chaque message suivant est publié comme une réponse
                    distincte (comme sur le forum).
                  </p>
                  <label>
                    <input
                      type="radio"
                      name="forum-scope"
                      checked={forumScope === 'full'}
                      onChange={() => setForumScope('full')}
                    />
                    Toute la conversation
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="forum-scope"
                      checked={forumScope === 'last'}
                      onChange={() => setForumScope('last')}
                    />
                    Depuis la dernière question
                  </label>
                </fieldset>
                {forumErr ? <p className="lexia-forum-err">{forumErr}</p> : null}
                <div className="lexia-forum-actions">
                  <button
                    type="button"
                    className="lexia-forum-btn-secondary"
                    onClick={closeForumModal}
                    disabled={forumBusy}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    className="lexia-forum-btn-primary"
                    onClick={() => void publishConversationToForum()}
                    disabled={forumBusy}
                  >
                    {forumBusy ? 'Publication…' : 'Publier'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {knowledgeReader ? (
        <div
          className="lexia-knowledge-backdrop"
          role="presentation"
          onClick={() => setKnowledgeReader(null)}
        >
          <div
            className="lexia-knowledge-panel"
            role="dialog"
            aria-modal="true"
            aria-label={`Contenu du fichier ${knowledgeReader.file}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="lexia-knowledge-panel-head">
              <h3 className="lexia-knowledge-panel-title">{knowledgeReader.file}</h3>
              <button
                type="button"
                className="lexia-knowledge-panel-close"
                onClick={() => setKnowledgeReader(null)}
                aria-label="Fermer"
              >
                ×
              </button>
            </div>
            <div className="lexia-knowledge-panel-body">
              {knowledgeReader.loading ? <p className="lexia-knowledge-panel-empty">Chargement du texte…</p> : null}
              {knowledgeReader.error ? (
                <p className="lexia-knowledge-panel-err">{knowledgeReader.error}</p>
              ) : null}
              {!knowledgeReader.loading &&
              !knowledgeReader.error &&
              knowledgeReader.empty &&
              !knowledgeReader.content ? (
                <p className="lexia-knowledge-panel-empty">
                  Aucun texte extrait (fichier vide ou extraction impossible).
                </p>
              ) : null}
              {!knowledgeReader.loading && !knowledgeReader.error && knowledgeReader.content ? (
                <pre className="lexia-knowledge-pre">{knowledgeReader.content}</pre>
              ) : null}
              {knowledgeReader.truncated ? (
                <p className="lexia-knowledge-trunc">
                  Affichage tronqué (limite serveur LEXIA_FULL_FILE_MAX_CHARS).
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
