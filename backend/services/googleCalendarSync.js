/**
 * Synchronise les RDV vers Google Calendar (API Calendar v3) : création dès la demande
 * (en attente), mise à jour à la confirmation / replanification / fin, suppression si annulé.
 *
 * Variables d'environnement :
 * - GOOGLE_CALENDAR_API_KEY (optionnel) : ?key=… avec Bearer (quotas / projet).
 * - GOOGLE_CALENDAR_ID : calendrier cible.
 * - Écriture (au moins une) :
 *   - GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON = JSON du compte de service (une ligne), ou
 *   - GOOGLE_CALENDAR_SERVICE_ACCOUNT_PATH = chemin vers le .json (relatif au cwd, souvent backend/), ou
 *   - GOOGLE_APPLICATION_CREDENTIALS = chemin absolu/relatif vers le même JSON (convention Google), ou
 *   - GOOGLE_CALENDAR_REFRESH_TOKEN + GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (OAuth, scope calendar.events).
 */
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { OAuth2Client, JWT } = require('google-auth-library');

const CAL_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

function calendarApiKeyQuery() {
  const k = process.env.GOOGLE_CALENDAR_API_KEY;
  if (!k || !String(k).trim()) return '';
  return `?key=${encodeURIComponent(String(k).trim())}`;
}

function appendKeyToUrl(url) {
  const q = calendarApiKeyQuery();
  if (!q) return url;
  return url.includes('?') ? `${url}&${q.slice(1)}` : url + q;
}

function resolveCredentialFilePath(p) {
  const s = String(p || '')
    .trim()
    .replace(/^["']|["']$/g, '');
  if (!s) return null;
  if (path.isAbsolute(s)) return s;
  return path.resolve(process.cwd(), s);
}

/** JSON compte de service : variable d’environnement ou fichier. */
function loadServiceAccountCredentials() {
  const inline = process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON;
  if (inline && String(inline).trim()) {
    try {
      const o = JSON.parse(String(inline).trim());
      if (o && o.client_email && o.private_key) return o;
    } catch (_) {
      /* ignore */
    }
  }

  const pathCandidates = [
    process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_PATH,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
  ].filter(Boolean);

  for (const raw of pathCandidates) {
    const fp = resolveCredentialFilePath(raw);
    if (!fp || !fs.existsSync(fp)) continue;
    try {
      const o = JSON.parse(fs.readFileSync(fp, 'utf8'));
      if (o && o.client_email && o.private_key) return o;
    } catch (_) {
      /* ignore */
    }
  }
  return null;
}

function hasOAuthRefreshConfig() {
  return !!(
    process.env.GOOGLE_CALENDAR_REFRESH_TOKEN &&
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET
  );
}

function isWriteConfigured() {
  return !!(loadServiceAccountCredentials() || hasOAuthRefreshConfig());
}

let warnedApiKeyOnly = false;

function warnApiKeyOnlyOnce() {
  if (warnedApiKeyOnly) return;
  warnedApiKeyOnly = true;
  if (process.env.GOOGLE_CALENDAR_API_KEY && !isWriteConfigured()) {
    console.warn(
      '[Google Calendar] GOOGLE_CALENDAR_API_KEY est défini sans compte de service ni refresh token OAuth : la création d’événements est désactivée.'
    );
  }
}

warnApiKeyOnlyOnce();

function describeCalendarAuthHelp() {
  const lines = [];
  const hasApiKey = !!(process.env.GOOGLE_CALENDAR_API_KEY && String(process.env.GOOGLE_CALENDAR_API_KEY).trim());
  const hasInline = !!(
    process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON &&
    String(process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON).trim()
  );
  const pCal = process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_PATH;
  const pGa = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const sa = loadServiceAccountCredentials();
  const rt = !!(process.env.GOOGLE_CALENDAR_REFRESH_TOKEN && String(process.env.GOOGLE_CALENDAR_REFRESH_TOKEN).trim());
  const cid = !!(process.env.GOOGLE_CLIENT_ID && String(process.env.GOOGLE_CLIENT_ID).trim());
  const csec = !!(process.env.GOOGLE_CLIENT_SECRET && String(process.env.GOOGLE_CLIENT_SECRET).trim());
  const oauthOk = rt && cid && csec;

  lines.push('');
  lines.push('La clé API (GOOGLE_CALENDAR_API_KEY) ne suffit pas : Google exige OAuth ou un compte de service pour créer des événements.');
  lines.push('');
  lines.push('Configurer une des options dans backend/.env (chargé en priorité) :');
  lines.push('');
  lines.push('  A) Compte de service (recommandé)');
  lines.push('     • Google Cloud → activer « Google Calendar API » → IAM → compte de service → clé JSON.');
  lines.push('     • Dans .env, au choix :');
  lines.push('       GOOGLE_CALENDAR_SERVICE_ACCOUNT_PATH=./config/mon-calendrier-sa.json');
  lines.push('       ou GOOGLE_APPLICATION_CREDENTIALS=C:\\chemin\\complet\\fichier.json');
  lines.push('       ou GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON={"type":"service_account",...}');
  lines.push('     • Google Agenda : partager le calendrier avec l’e-mail client_email du JSON (droit « Modifier les événements »).');
  lines.push('     • GOOGLE_CALENDAR_ID = e-mail du calendrier ou ID (ex. xxx@group.calendar.google.com).');
  lines.push('');
  lines.push('  B) OAuth');
  lines.push('     • GOOGLE_CALENDAR_REFRESH_TOKEN + GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET');
  lines.push('     • Le CLIENT_SECRET doit aussi être présent dans backend/.env pour ce script.');
  lines.push('');

  lines.push('État détecté :');
  lines.push(hasApiKey ? '  ✓ GOOGLE_CALENDAR_API_KEY' : '  ○ GOOGLE_CALENDAR_API_KEY (optionnel)');

  if (sa) {
    lines.push('  ✓ Compte de service (JSON valide)');
  } else {
    lines.push('  ✗ Compte de service : absent ou JSON invalide');
    if (hasInline) {
      lines.push('    → GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON est défini mais illisible (JSON cassé ou guillemets / retours ligne).');
    }
    if (pCal || pGa) {
      const raw = pCal || pGa;
      const fp = resolveCredentialFilePath(raw);
      lines.push(`    → Chemin : ${raw}`);
      lines.push(`    → Résolu depuis le répertoire courant (${process.cwd()}) : ${fp || '(invalide)'}`);
      if (fp && !fs.existsSync(fp)) lines.push('    → Fichier introuvable : utilisez un chemin absolu ou lancez npm depuis backend/.');
    }
  }

  if (oauthOk) lines.push('  ✓ OAuth (refresh + client id + secret)');
  else {
    lines.push('  ✗ OAuth incomplet');
    if (!rt) lines.push('    → Manquant : GOOGLE_CALENDAR_REFRESH_TOKEN');
    if (!cid) lines.push('    → Manquant : GOOGLE_CLIENT_ID');
    if (!csec) lines.push('    → Manquant : GOOGLE_CLIENT_SECRET (à dupliquer dans backend/.env si vous ne l’avez que côté frontend)');
  }

  return lines.join('\n');
}

async function getAccessToken() {
  const sa = loadServiceAccountCredentials();
  if (sa) {
    const jwt = new JWT({
      email: sa.client_email,
      key: sa.private_key,
      scopes: [CAL_SCOPE],
    });
    const t = await jwt.getAccessToken();
    if (t && t.token) return t.token;
    throw new Error('Compte de service : jeton d’accès indisponible');
  }

  if (hasOAuthRefreshConfig()) {
    const client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    client.setCredentials({ refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN });
    const r = await client.getAccessToken();
    if (r && r.token) return r.token;
    throw new Error('OAuth : jeton d’accès indisponible');
  }

  return null;
}

/** Vérifie que le calendrier cible est accessible (partage compte de service / OAuth). */
async function verifyGoogleCalendarTargetReady() {
  if (!isWriteConfigured()) {
    return { ok: false, message: 'Authentification Google Calendar non configurée.' };
  }

  let token;
  try {
    token = await getAccessToken();
  } catch (e) {
    return { ok: false, message: e.message || String(e) };
  }
  if (!token) {
    return { ok: false, message: 'Jeton d’accès Google indisponible.' };
  }

  const calId = getCalendarId();
  const calUrl = appendKeyToUrl(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}`
  );
  const calRes = await fetch(calUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (calRes.ok) {
    return { ok: true, calendarId: calId };
  }

  const listUrl = appendKeyToUrl('https://www.googleapis.com/calendar/v3/users/me/calendarList');
  const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
  const listJson = await listRes.json().catch(() => ({}));
  const items = Array.isArray(listJson.items) ? listJson.items : [];
  const sa = loadServiceAccountCredentials();
  const serviceEmail = sa?.client_email;

  const lines = [
    `Calendrier introuvable pour GOOGLE_CALENDAR_ID=${calId} (HTTP ${calRes.status}).`,
  ];
  if (serviceEmail) {
    lines.push(
      `Partagez l’agenda Google avec ${serviceEmail} (droit « Modifier les événements »), puis copiez l’ID exact dans GOOGLE_CALENDAR_ID.`
    );
  }
  if (items.length) {
    lines.push('Calendriers visibles pour ce compte :');
    for (const c of items) {
      lines.push(`  • ${c.id} — ${c.summary || '(sans titre)'} (${c.accessRole || '?'})`);
    }
  } else {
    lines.push('Aucun calendrier visible : le partage avec le compte de service n’est pas encore effectif.');
  }

  return { ok: false, message: lines.join('\n') };
}

function getParisYmd(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(d));
}

/** Retourne { h, m } pour "14:30", "14h30", "9h", "09:00" */
function parseHeure(heure) {
  const s = String(heure || '')
    .trim()
    .replace(/\s/g, '');
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[hH:](\d{1,2})$/);
  if (m) {
    const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
    const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
    return { h, m: min };
  }
  m = s.match(/^(\d{1,2})[hH]$/);
  if (m) {
    const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
    return { h, m: 0 };
  }
  m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
    const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
    return { h, m: min };
  }
  return null;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function buildStartEndDateTime(rendezVous) {
  const ymd = getParisYmd(rendezVous.date);
  const hm = parseHeure(rendezVous.heure);
  if (!hm) return null;
  const startLocal = `${ymd}T${pad2(hm.h)}:${pad2(hm.m)}:00`;
  let endH = hm.h + 1;
  const endM = hm.m;
  if (endH > 23) {
    endH = 23;
    return { startLocal, endLocal: `${ymd}T23:59:00` };
  }
  const endLocal = `${ymd}T${pad2(endH)}:${pad2(endM)}:00`;
  return { startLocal, endLocal };
}

function statutLabel(statut) {
  const s = String(statut || '').trim();
  if (s === 'confirme') return 'Confirmé';
  if (s === 'en_attente') return 'En attente de confirmation';
  if (s === 'termine') return 'Terminé';
  if (s === 'annule') return 'Annulé';
  return s || '—';
}

function summaryForStatut(statut, name) {
  const s = String(statut || '').trim();
  if (s === 'confirme') return `RDV confirmé — ${name}`;
  if (s === 'en_attente') return `RDV (demande) — ${name}`;
  if (s === 'termine') return `RDV (terminé) — ${name}`;
  return `RDV — ${name}`;
}

function buildEventBody(rendezVous, motifLabel) {
  const times = buildStartEndDateTime(rendezVous);
  if (!times) return null;

  const name = `${String(rendezVous.prenom || '').trim()} ${String(rendezVous.nom || '').trim()}`.trim() || 'Client';
  const st = String(rendezVous.statut || 'en_attente').trim();
  const lines = [
    `Statut : ${statutLabel(st)}`,
    `Client : ${name}`,
    `E-mail : ${rendezVous.email || ''}`,
    rendezVous.telephone ? `Téléphone : ${rendezVous.telephone}` : null,
    `Motif : ${motifLabel || rendezVous.motif || ''}`,
    rendezVous.description ? `Détails : ${rendezVous.description}` : null,
    `Réf. PawLegal : ${rendezVous._id}`,
  ].filter(Boolean);

  return {
    summary: summaryForStatut(st, name),
    description: lines.join('\n'),
    start: { dateTime: times.startLocal, timeZone: 'Europe/Paris' },
    end: { dateTime: times.endLocal, timeZone: 'Europe/Paris' },
    extendedProperties: {
      private: {
        pawlegalAppointmentId: String(rendezVous._id),
      },
    },
  };
}

function getCalendarId() {
  const id = process.env.GOOGLE_CALENDAR_ID;
  if (id && String(id).trim()) return String(id).trim();
  return 'primary';
}

function shouldInsertNewEvent(rendezVous) {
  const st = String(rendezVous.statut || '').trim();
  return st === 'en_attente' || st === 'confirme' || st === 'termine';
}

/**
 * Crée ou met à jour l’événement Google pour ce RDV (tous statuts sauf annulé).
 * Ne supprime pas : utiliser removeGoogleCalendarEventIfAny pour annulation.
 */
async function syncAppointmentGoogleCalendar(rendezVous, getMotifLabel) {
  if (!rendezVous || rendezVous.statut === 'annule') return;
  if (!isWriteConfigured()) return;

  const RendezVous = require('../models/RendezVous');
  const motifLabel =
    typeof getMotifLabel === 'function' ? getMotifLabel(rendezVous.motif) : String(rendezVous.motif || '');
  const body = buildEventBody(rendezVous, motifLabel);
  if (!body) {
    console.warn('[Google Calendar] Heure non reconnue, sync ignoré pour', rendezVous._id);
    return;
  }

  let token;
  try {
    token = await getAccessToken();
  } catch (e) {
    console.error('[Google Calendar] Auth (non bloquant):', e.message || e);
    return;
  }
  if (!token) return;

  const calId = encodeURIComponent(getCalendarId());

  if (rendezVous.googleCalendarEventId) {
    const eid = encodeURIComponent(rendezVous.googleCalendarEventId);
    const url = appendKeyToUrl(
      `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${eid}`
    );
    const patchBody = {
      start: body.start,
      end: body.end,
      summary: body.summary,
      description: body.description,
    };
    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patchBody),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        console.error('[Google Calendar] events.patch HTTP', res.status, json.error || json);
      }
    } catch (e) {
      console.error('[Google Calendar] events.patch (non bloquant):', e.message || e);
    }
    return;
  }

  if (!shouldInsertNewEvent(rendezVous)) return;

  const url = appendKeyToUrl(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events`);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[Google Calendar] events.insert HTTP', res.status, json.error || json);
      return;
    }
    if (json.id) {
      await RendezVous.updateOne({ _id: rendezVous._id }, { $set: { googleCalendarEventId: json.id } });
      rendezVous.googleCalendarEventId = json.id;
    }
  } catch (e) {
    console.error('[Google Calendar] events.insert (non bloquant):', e.message || e);
  }
}

async function removeGoogleCalendarEventIfAny(rendezVous) {
  if (!rendezVous?.googleCalendarEventId) return;
  if (!isWriteConfigured()) return;

  const RendezVous = require('../models/RendezVous');
  let token;
  try {
    token = await getAccessToken();
  } catch (e) {
    console.error('[Google Calendar] Auth suppression (non bloquant):', e.message || e);
    return;
  }
  if (!token) return;

  const calId = encodeURIComponent(getCalendarId());
  const eid = encodeURIComponent(rendezVous.googleCalendarEventId);
  const url = appendKeyToUrl(
    `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${eid}`
  );

  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 204 || res.status === 200 || res.status === 404) {
      await RendezVous.updateOne({ _id: rendezVous._id }, { $unset: { googleCalendarEventId: 1 } });
      rendezVous.googleCalendarEventId = undefined;
      return;
    }
    const txt = await res.text();
    console.error('[Google Calendar] events.delete HTTP', res.status, txt);
  } catch (e) {
    console.error('[Google Calendar] events.delete (non bloquant):', e.message || e);
  }
}

module.exports = {
  syncAppointmentGoogleCalendar,
  removeGoogleCalendarEventIfAny,
  isWriteConfigured,
  describeCalendarAuthHelp,
  verifyGoogleCalendarTargetReady,
};
