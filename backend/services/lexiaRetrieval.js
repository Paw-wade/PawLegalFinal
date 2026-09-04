/**
 * Récupération documentaire pour Paw AI : index Lexia, Judilibre (PISTE), Légifrance (PISTE),
 * et pages HTTPS sur hôtes juridiques officiels (liste blanche).
 * Pas d’accès HTTP arbitraire (SSRF) : domaines autorisés uniquement.
 */

const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { searchKnowledge, getKnowledgeDir, buildQueryFromMessages } = require('./lexiaInternal');

const DEFAULT_OFFICIAL_HOSTS = new Set(
  [
    'www.conseil-etat.fr',
    'conseil-etat.fr',
    'www.legifrance.gouv.fr',
    'legifrance.gouv.fr',
    'www.courdecassation.fr',
    'courdecassation.fr',
    'eur-lex.europa.eu',
    'curia.europa.eu',
    'hudoc.echr.coe.int',
    'www.service-public.fr',
    'service-public.fr',
    'www.justice.gouv.fr',
    'justice.gouv.fr',
    'www.vie-publique.fr',
    'vie-publique.fr',
  ].map((h) => h.toLowerCase())
);

function isRetrievalDisabled() {
  const v = String(process.env.LEXIA_DISABLE_RETRIEVAL || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Paw AI uniquement : sans abonnement API Légifrance sur PISTE, mettre à 1 pour ne pas appeler lf-engine-app. */
function isLegifranceRetrievalDisabled() {
  const v = String(process.env.LEXIA_DISABLE_LEGIFRANCE || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function extraOfficialHosts() {
  return String(process.env.LEXIA_RETRIEVAL_EXTRA_HOSTS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowedOfficialHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (DEFAULT_OFFICIAL_HOSTS.has(h)) return true;
  return extraOfficialHosts().includes(h);
}

function truncate(s, max) {
  const t = String(s || '');
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function extractAllowedHttpsUrls(messages, maxUrls) {
  if (!Array.isArray(messages)) return [];
  const tail = messages.slice(-4);
  const text = tail.map((m) => String(m?.content ?? '')).join('\n');
  const raw = text.match(/https:\/\/[^\s)"'<>\]]+/gi) || [];
  const out = [];
  const seen = new Set();
  for (let u of raw) {
    u = u.replace(/[),.;]+$/g, '');
    try {
      const url = new URL(u);
      if (url.protocol !== 'https:') continue;
      if (!isAllowedOfficialHost(url.hostname)) continue;
      const canon = url.toString();
      if (seen.has(canon)) continue;
      seen.add(canon);
      out.push(canon);
      if (out.length >= maxUrls) break;
    } catch {
      /* ignore */
    }
  }
  return out;
}

async function fetchOfficialPageText(urlStr) {
  const maxBytes = Math.min(Math.max(Number(process.env.LEXIA_RETRIEVAL_MAX_FETCH_BYTES) || 400_000, 20_000), 2_000_000);
  const timeoutMs = Math.min(Math.max(Number(process.env.LEXIA_RETRIEVAL_FETCH_MS) || 18_000, 3000), 60_000);

  let current = urlStr;
  for (let hop = 0; hop < 6; hop++) {
    let u;
    try {
      u = new URL(current);
    } catch {
      return { url: urlStr, error: 'URL invalide', text: '' };
    }
    if (u.protocol !== 'https:') {
      return { url: urlStr, error: 'Seuls les liens https sont autorisés.', text: '' };
    }
    if (!isAllowedOfficialHost(u.hostname)) {
      return { url: urlStr, error: `Hôte non autorisé : ${u.hostname}`, text: '' };
    }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: ac.signal,
        headers: {
          'User-Agent': 'AdaPapers-PawAI-Lexia/1.0',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
        },
      });
      clearTimeout(timer);

      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        const next = new URL(res.headers.get('location'), current);
        if (next.protocol !== 'https:') {
          return { url: urlStr, error: 'Redirection vers un schéma non autorisé.', text: '' };
        }
        if (!isAllowedOfficialHost(next.hostname)) {
          return { url: urlStr, error: `Redirection vers hôte non autorisé : ${next.hostname}`, text: '' };
        }
        current = next.toString();
        continue;
      }

      if (!res.ok) {
        return { url: current, error: `HTTP ${res.status}`, text: '' };
      }

      const buf = await res.buffer();
      if (buf.length > maxBytes) {
        return { url: current, error: `Réponse trop volumineuse (${buf.length} octets)`, text: '' };
      }
      const ctype = String(res.headers.get('content-type') || '').toLowerCase();
      let text = '';
      if (ctype.includes('text/html')) {
        const $ = cheerio.load(buf.toString('utf8'));
        $('script, style, noscript, svg').remove();
        text = $('body').length ? $('body').text() : $.root().text();
      } else {
        text = buf.toString('utf8');
      }
      text = text.replace(/\s+/g, ' ').trim();
      return { url: current, error: null, text: truncate(text, 12_000) };
    } catch (e) {
      clearTimeout(timer);
      return { url: urlStr, error: String(e.message || e), text: '' };
    }
  }
  return { url: urlStr, error: 'Trop de redirections', text: '' };
}

function formatIndexHitsForPrompt(hits) {
  if (!Array.isArray(hits) || !hits.length) {
    return '_Aucun extrait pertinent dans l’index documentaire pour cette requête._\n';
  }
  const lines = [];
  hits.forEach((h, i) => {
    const file = h.file != null ? String(h.file) : '(fichier)';
    const sn = truncate(String(h.snippet || ''), 900);
    const meta = h.metadata || {};
    const tags = [meta.juridiction, meta.dateIso, meta.decisionNumber ? `n° ${meta.decisionNumber}` : null]
      .filter(Boolean)
      .join(' · ');
    lines.push(`### [Index ${i + 1}] ${file}${tags ? ` _(${tags})_` : ''}\n\n${sn}\n`);
  });
  return lines.join('\n---\n\n');
}

async function tryJudilibre(queryText) {
  const sources = [];
  if (!process.env.PISTE_CLIENT_ID || !process.env.PISTE_CLIENT_SECRET) {
    return { md: '_Judilibre non configuré (PISTE_CLIENT_ID / PISTE_CLIENT_SECRET)._', sources };
  }
  const q = String(queryText || '').trim();
  if (q.length < 6) {
    return { md: '_Requête trop courte pour Judilibre._', sources };
  }
  let searchDecisions;
  let getDecision;
  try {
    ({ searchDecisions, getDecision } = require('../lib/judilibre'));
  } catch (e) {
    return { md: `_Module Judilibre indisponible : ${String(e.message || e)}_`, sources };
  }

  try {
    const raw = await searchDecisions(truncate(q, 400), { pageSize: 6, page: 0 });
    const candidates = raw.results || raw.decisions || raw.items || raw.hits || [];
    const list = Array.isArray(candidates) ? candidates : [];
    if (!list.length) {
      return { md: '_Aucun résultat Judilibre pour cette recherche._', sources };
    }

    const lines = ['### Judilibre (Cour de cassation - API officielle)', ''];
    for (let i = 0; i < Math.min(list.length, 6); i++) {
      const item = list[i] || {};
      const id = item.id || item.decisionId || item._id || item.decision_id;
      let blob = typeof item.text === 'string' ? item.text : typeof item.summary === 'string' ? item.summary : '';
      if (id && (!blob || blob.length < 80)) {
        try {
          const full = await getDecision(String(id));
          const t = full.text || full.content || full.decisionText || JSON.stringify(full);
          if (typeof t === 'string' && t.length > blob.length) blob = t;
        } catch {
          /* garde l’extrait court */
        }
      }
      const head = [item.numero || item.number, item.date || item.decisionDate, item.formation || item.chamber]
        .filter(Boolean)
        .join(' · ');
      lines.push(`**Décision ${i + 1}**${head ? ` - ${head}` : ''}${id ? ` - id: \`${id}\`` : ''}`);
      lines.push('');
      lines.push(truncate(String(blob || JSON.stringify(item)).replace(/\s+/g, ' '), 3500));
      lines.push('');
      lines.push('---');
      lines.push('');
      sources.push({
        file: id ? `judilibre:${id}` : `judilibre:hit-${i + 1}`,
        score: 1,
        metadata: { source: 'judilibre', id: id || undefined },
        source: 'judilibre',
      });
    }
    return { md: lines.join('\n'), sources };
  } catch (e) {
    return { md: `_Erreur Judilibre : ${String(e.message || e)}_`, sources };
  }
}

async function tryLegifrance(queryText) {
  const sources = [];
  if (isLegifranceRetrievalDisabled()) {
    return {
      md:
        '_Légifrance via API PISTE désactivée (`LEXIA_DISABLE_LEGIFRANCE`). Sans abonnement « API Légifrance » sur PISTE, Paw AI utilise surtout **Judilibre** (Cass.), l’index documentaire et les pages officielles ; les utilisateurs peuvent coller des URL legifrance.gouv.fr pour en charger le texte._',
      sources,
    };
  }
  if (!process.env.LEGIFRANCE_API_URL) {
    return { md: '_Légifrance API non configurée (LEGIFRANCE_API_URL)._', sources };
  }
  const q = String(queryText || '').trim().slice(0, 500);
  if (q.length < 4) {
    return { md: '_Requête trop courte pour Légifrance._', sources };
  }
  let rechercher;
  let collectAllLegiartiIds;
  let getArticlePreviewById;
  try {
    ({ rechercher, collectAllLegiartiIds, getArticlePreviewById } = require('../lib/legifrance'));
  } catch (e) {
    return { md: `_Module Légifrance indisponible : ${String(e.message || e)}_`, sources };
  }
  const fond = String(process.env.LEXIA_LEGIFRANCE_FOND || 'CODE_DATE').trim() || 'CODE_DATE';
  const maxArticles = Math.min(Math.max(Number(process.env.LEXIA_LEGIFRANCE_MAX_ARTICLE_FETCH) || 2, 0), 5);
  try {
    const data = await rechercher(q, fond);
    const json = truncate(JSON.stringify(data).replace(/\s+/g, ' '), 8000);

    let articleMd = '';
    if (maxArticles > 0) {
      const ids = collectAllLegiartiIds(data)
        .filter((id, i, arr) => arr.indexOf(id) === i)
        .slice(0, maxArticles);
      const parts = [];
      for (const id of ids) {
        try {
          const p = await getArticlePreviewById(id, q);
          const bodyText = truncate(String(p.text || '').replace(/\s+/g, ' '), 3500);
          parts.push(
            `#### ${p.title || id}\n\n\`${p.id}\`\n\n${bodyText}\n\n[Légifrance](${p.legifranceUrl})`
          );
        } catch (ae) {
          parts.push(`#### Article \`${id}\`\n\n_Lecture API : ${String(ae.message || ae)}_`);
        }
      }
      if (parts.length) {
        articleMd =
          `### Légifrance - texte d’articles (consult/getArticle)\n\n` + parts.join('\n\n---\n\n') + '\n\n';
      }
    }

    sources.push({
      file: 'legifrance:search',
      score: 1,
      metadata: { fond, source: 'legifrance' },
      source: 'legifrance',
    });
    return {
      md:
        `### Légifrance (recherche API - fond \`${fond}\`)\n\n` +
        articleMd +
        `_Réponse recherche (JSON tronqué). À recouper sur legifrance.gouv.fr._\n\n\`\`\`\n${json}\n\`\`\`\n`,
      sources,
    };
  } catch (e) {
    return { md: `_Erreur Légifrance : ${String(e.message || e)}_`, sources };
  }
}

async function tryOfficialUrls(messages) {
  const max = Math.min(Math.max(Number(process.env.LEXIA_RETRIEVAL_MAX_OFFICIAL_URLS) || 3, 1), 8);
  const urls = extractAllowedHttpsUrls(messages, max);
  if (!urls.length) {
    return { md: '_Aucune URL officielle (liste blanche) dans les derniers messages._', sources: [] };
  }
  const parts = ['### Pages officielles (extrait HTML)', ''];
  const sources = [];
  for (const u of urls) {
    const r = await fetchOfficialPageText(u);
    if (r.error) {
      parts.push(`**${u}** - _${r.error}_\n`);
    } else {
      parts.push(`**${r.url}**\n\n${r.text || '_(vide)_'}\n`);
      sources.push({
        file: `official:${r.url}`,
        score: 1,
        metadata: { source: 'official_web' },
        source: 'official_web',
      });
    }
    parts.push('---\n');
  }
  return { md: parts.join('\n'), sources };
}

const RETRIEVAL_INSTRUCTION = `## Rôle de ce bloc (session serveur)
Données récupérées automatiquement : index Paw AI, API Judilibre / Légifrance si configurées, pages HTTPS sur domaines **autorisés** uniquement.

**Règles :**
- Pour une **référence présentée comme établie**, appuie-toi **prioritairement** sur ce bloc quand il est pertinent.
- **N’invente pas** de numéros de pourvoi, ECLI ou articles absents du bloc ; si tu dois signaler une incertitude majeure, un **court** <span class="lexia-caution">…</span> suffit (pas de surlignage systématique).
- Les URL vers des domaines **non autorisés** n’ont **pas** été chargées : ne prétends pas en avoir lu le contenu.`;

async function prepareLlmContext(messages, options = {}) {
  if (isRetrievalDisabled()) {
    const threadOnly = String(options.threadAttachmentAppendix || '').trim();
    return {
      systemAppendix: threadOnly,
      sources: [],
      searched: Boolean(threadOnly),
      totalToolUses: threadOnly ? 1 : 0,
    };
  }

  const dir = getKnowledgeDir();
  const queryText = buildQueryFromMessages(messages);

  const [sk, jud, leg, web] = await Promise.all([
    searchKnowledge({ messages, knowledgeDir: dir, page: 1, limit: 12 }).catch((e) => ({
      hits: [],
      error: e.message || String(e),
    })),
    tryJudilibre(queryText),
    tryLegifrance(queryText),
    tryOfficialUrls(messages),
  ]);

  const hits = sk.hits || [];
  const indexMd = sk.error
    ? `### Index documentaire Paw AI\n\n_Erreur : ${sk.error}_\n`
    : `### Index documentaire Paw AI (extraits)\n\n${formatIndexHitsForPrompt(hits)}`;

  const appendix = [
    RETRIEVAL_INSTRUCTION,
    '',
    indexMd,
    '',
    jud.md,
    '',
    leg.md,
    '',
    web.md,
    String(options.threadAttachmentAppendix || '').trim() ? '' : null,
    String(options.threadAttachmentAppendix || '').trim() || null,
  ]
    .filter((part) => part != null && String(part).trim())
    .join('\n');

  const sources = [];
  for (const h of hits) {
    sources.push({
      file: h.file != null ? String(h.file) : '',
      score: Number(h.score) || 0,
      metadata: { ...(h.metadata || {}), source: 'internal_index' },
      source: 'internal_index',
    });
  }
  sources.push(...jud.sources, ...leg.sources, ...web.sources);

  const totalToolUses =
    (hits.length ? 1 : 0) +
    (jud.sources.length ? 1 : 0) +
    (leg.sources.length ? 1 : 0) +
    (web.sources.length ? 1 : 0);

  return {
    systemAppendix: appendix,
    sources,
    searched: true,
    totalToolUses,
  };
}

async function gatherExternalOnlyForInternal(messages) {
  if (isRetrievalDisabled()) {
    return { markdown: '', sources: [], totalToolUses: 0 };
  }
  const queryText = buildQueryFromMessages(messages);
  const [jud, leg, web] = await Promise.all([tryJudilibre(queryText), tryLegifrance(queryText), tryOfficialUrls(messages)]);

  const sources = [...jud.sources, ...leg.sources, ...web.sources];
  const md = [
    '## Récupération automatique - bases externes',
    '_Judilibre / Légifrance (si configurés) et pages officielles en liste blanche. À recouper sur les sites officiels._',
    '',
    jud.md,
    '',
    leg.md,
    '',
    web.md,
  ].join('\n');

  const totalToolUses =
    (jud.sources.length ? 1 : 0) + (leg.sources.length ? 1 : 0) + (web.sources.length ? 1 : 0);
  return { markdown: md, sources, totalToolUses };
}

function mergeSystemPrompt(base, appendix) {
  if (!appendix || !String(appendix).trim()) return base;
  return `${base}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nDonnées de récupération (fiabilité)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n${appendix}`;
}

module.exports = {
  prepareLlmContext,
  gatherExternalOnlyForInternal,
  mergeSystemPrompt,
  isRetrievalDisabled,
  isLegifranceRetrievalDisabled,
  isAllowedOfficialHost,
};
