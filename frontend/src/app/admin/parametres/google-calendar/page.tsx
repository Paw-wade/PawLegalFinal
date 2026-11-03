'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { appointmentsAPI } from '@/lib/api';

interface CalendarStatus {
  configured: boolean;
  calendarId: string | null;
  calendarReady?: boolean;
  message: string;
  authMethod: 'service_account' | 'oauth' | null;
}

// ─── Section helper ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {children}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 mt-0.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">
          {n}
        </span>
      </div>
      <div className="flex-1 pb-6">
        <p className="mb-2 font-semibold text-gray-900">{title}</p>
        <div className="space-y-2 text-sm text-gray-600">{children}</div>
      </div>
    </div>
  );
}

function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative mt-1 rounded-lg bg-gray-900 px-4 py-3 font-mono text-xs text-green-300">
      <pre className="whitespace-pre-wrap break-all">{children}</pre>
      <button
        type="button"
        onClick={() => { navigator.clipboard.writeText(children).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        className="absolute right-2 top-2 rounded bg-gray-700 px-2 py-0.5 text-[10px] text-gray-300 hover:bg-gray-600"
      >
        {copied ? 'Copie !' : 'Copier'}
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GoogleCalendarSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [calStatus, setCalStatus] = useState<CalendarStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeMethod, setActiveMethod] = useState<'sa' | 'oauth'>('sa');

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin');
  }, [status, router]);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await appointmentsAPI.getGoogleCalendarStatus();
      setCalStatus((res.data as any).data);
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || 'Erreur reseau');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') fetchStatus();
  }, [status, fetchStatus]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  const StatusBadge = ({ ok }: { ok: boolean }) => (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
      {ok ? 'Operationnel' : 'Non configure'}
    </span>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-3xl space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/admin/calendrier" className="text-sm text-gray-500 hover:text-orange-500">
            Calendrier
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-medium text-gray-900">Google Calendar</span>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Integration Google Calendar</h1>
            <p className="mt-1 text-sm text-gray-500">
              Les rendez-vous confirmes sont automatiquement synchronises vers ton agenda Google.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchStatus}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <svg className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Tester la connexion
          </button>
        </div>

        {/* Status */}
        <Section title="Etat de la connexion">
          {error ? (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
          ) : calStatus ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Authentification</span>
                <StatusBadge ok={calStatus.configured} />
              </div>
              {calStatus.configured && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">Calendrier accessible</span>
                  <StatusBadge ok={!!calStatus.calendarReady} />
                </div>
              )}
              {calStatus.calendarId && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">ID calendrier</span>
                  <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700">{calStatus.calendarId}</span>
                </div>
              )}
              {calStatus.authMethod && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">Methode</span>
                  <span className="text-xs font-medium text-gray-600">
                    {calStatus.authMethod === 'service_account' ? 'Compte de service (SA)' : 'OAuth 2.0'}
                  </span>
                </div>
              )}
              {calStatus.message && !calStatus.calendarReady && (
                <div className="mt-3 rounded-lg bg-amber-50 p-3">
                  <p className="whitespace-pre-wrap text-xs text-amber-800 font-mono">{calStatus.message}</p>
                </div>
              )}
              {calStatus.configured && calStatus.calendarReady && (
                <div className="mt-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
                  Tout est pret. Les rendez-vous confirmes seront automatiquement ajoutes a ton agenda Google.
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-orange-300 border-t-transparent" />
              Verification en cours...
            </div>
          )}
        </Section>

        {/* Guide de configuration */}
        <Section title="Configuration - choisir une methode">
          <div className="mb-6 flex gap-2">
            <button
              type="button"
              onClick={() => setActiveMethod('sa')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${activeMethod === 'sa' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              A. Compte de service (recommande)
            </button>
            <button
              type="button"
              onClick={() => setActiveMethod('oauth')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${activeMethod === 'oauth' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              B. OAuth 2.0
            </button>
          </div>

          {activeMethod === 'sa' && (
            <div className="divide-y divide-gray-100">
              <Step n={1} title="Ouvrir Google Cloud Console">
                <p>Va sur <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="text-orange-500 underline">console.cloud.google.com</a> et selectionne (ou cree) ton projet.</p>
              </Step>

              <Step n={2} title="Activer l'API Google Calendar">
                <p>Menu lateral : <strong>APIs et services</strong> &gt; <strong>Bibliotheque</strong> &gt; recherche <em>Google Calendar API</em> &gt; <strong>Activer</strong>.</p>
              </Step>

              <Step n={3} title="Creer un compte de service">
                <p><strong>IAM et administration</strong> &gt; <strong>Comptes de service</strong> &gt; <strong>Creer</strong>.</p>
                <p>Donne-lui un nom (ex. <code className="rounded bg-gray-100 px-1">pawlegal-calendar</code>). Pas besoin de role IAM pour cette etape.</p>
                <p>Clique sur le compte cree &gt; onglet <strong>Cles</strong> &gt; <strong>Ajouter une cle</strong> &gt; <strong>JSON</strong>. Telecharge le fichier.</p>
              </Step>

              <Step n={4} title="Copier le fichier JSON sur le serveur">
                <p>Place le fichier dans <code className="rounded bg-gray-100 px-1">backend/config/</code> (dossier a creer si besoin) :</p>
                <Code>{`mkdir -p backend/config\ncp ~/Downloads/mon-projet-xxxxx.json backend/config/google-calendar-sa.json`}</Code>
              </Step>

              <Step n={5} title="Ajouter les variables dans backend/.env">
                <Code>{`GOOGLE_CALENDAR_SERVICE_ACCOUNT_PATH=./config/google-calendar-sa.json\nGOOGLE_CALENDAR_ID=ton-email@gmail.com`}</Code>
                <p className="mt-2 text-xs text-gray-400">
                  Si tu veux un calendrier dedie (recommande) : dans Google Agenda, cree un agenda &gt; Parametres &gt; copie l'ID (format <em>xxx@group.calendar.google.com</em>).
                </p>
              </Step>

              <Step n={6} title="Partager le calendrier avec le compte de service">
                <p>Dans <strong>Google Agenda</strong>, clique sur les 3 points a cote de ton calendrier &gt; <strong>Parametres et partage</strong>.</p>
                <p>Section <strong>Partager avec des personnes</strong> : ajoute l'e-mail <code>client_email</code> du JSON telechargé, avec le droit <strong>Modifier les evenements</strong>.</p>
              </Step>

              <Step n={7} title="Redemarrer le backend et tester">
                <Code>{`cd backend && npm run dev`}</Code>
                <p>Puis clique <strong>Tester la connexion</strong> en haut de cette page.</p>
              </Step>
            </div>
          )}

          {activeMethod === 'oauth' && (
            <div className="divide-y divide-gray-100">
              <Step n={1} title="Creer les identifiants OAuth dans Google Cloud">
                <p>Va sur <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-orange-500 underline">APIs et services &gt; Identifiants</a>.</p>
                <p>Clique <strong>Creer des identifiants</strong> &gt; <strong>ID client OAuth 2.0</strong> &gt; type <strong>Application Web</strong>.</p>
                <p>Ajoute <code className="rounded bg-gray-100 px-1">http://localhost:3005</code> comme URI de redirection autorisee. Note le <strong>Client ID</strong> et le <strong>Client Secret</strong>.</p>
              </Step>

              <Step n={2} title="Obtenir un refresh token">
                <p>Utilise le script de test OAuth ou Google OAuth Playground (<a href="https://developers.google.com/oauthplayground" target="_blank" rel="noreferrer" className="text-orange-500 underline">oauthplayground</a>).</p>
                <p>Scope a autoriser :</p>
                <Code>{`https://www.googleapis.com/auth/calendar.events`}</Code>
                <p className="mt-2">Le <strong>Refresh Token</strong> genere ne change pas (sauf revocation).</p>
              </Step>

              <Step n={3} title="Ajouter les variables dans backend/.env">
                <Code>{`GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com\nGOOGLE_CLIENT_SECRET=GOCSPX-xxxxx\nGOOGLE_CALENDAR_REFRESH_TOKEN=1//xxxxx\nGOOGLE_CALENDAR_ID=ton-email@gmail.com`}</Code>
              </Step>

              <Step n={4} title="Redemarrer le backend et tester">
                <Code>{`cd backend && npm run dev`}</Code>
                <p>Puis clique <strong>Tester la connexion</strong> en haut de cette page.</p>
              </Step>
            </div>
          )}
        </Section>

        {/* Ce qui est synchronise */}
        <Section title="Ce qui est synchronise automatiquement">
          <ul className="space-y-2 text-sm text-gray-700">
            {[
              ['Creation', 'Un RDV passe au statut "en attente" ou "confirme" : evenement cree dans Google Agenda.'],
              ['Mise a jour', 'Changement de date, heure ou statut : l\'evenement Google est mis a jour automatiquement.'],
              ['Annulation', 'Statut "annule" : l\'evenement est supprime de Google Agenda.'],
            ].map(([label, desc]) => (
              <li key={label} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-orange-100">
                  <svg className="h-3 w-3 text-orange-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </span>
                <span><strong>{label}</strong> : {desc}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
            La synchronisation est <strong>non bloquante</strong> : si Google Calendar est inaccessible, le RDV est quand meme enregistre dans la base de donnees PawLegal.
          </div>
        </Section>

        {/* Variables reference */}
        <Section title="Reference des variables d'environnement">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="pb-2 text-left font-semibold text-gray-700">Variable</th>
                  <th className="pb-2 text-left font-semibold text-gray-700">Requis</th>
                  <th className="pb-2 text-left font-semibold text-gray-700">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[
                  ['GOOGLE_CALENDAR_ID', 'Oui', 'ID du calendrier cible (email ou xxx@group.calendar.google.com). Defaut : primary.'],
                  ['GOOGLE_CALENDAR_SERVICE_ACCOUNT_PATH', 'SA seulement', 'Chemin relatif (depuis backend/) vers le JSON du compte de service.'],
                  ['GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON', 'SA seulement', 'Contenu JSON inline du compte de service (utile pour les hebergements sans filesystem).'],
                  ['GOOGLE_APPLICATION_CREDENTIALS', 'SA seulement', 'Convention Google : chemin absolu vers le JSON du compte de service.'],
                  ['GOOGLE_CLIENT_ID', 'OAuth seulement', 'Client ID de l\'application OAuth Google.'],
                  ['GOOGLE_CLIENT_SECRET', 'OAuth seulement', 'Client Secret de l\'application OAuth Google.'],
                  ['GOOGLE_CALENDAR_REFRESH_TOKEN', 'OAuth seulement', 'Refresh token OAuth avec scope calendar.events.'],
                  ['GOOGLE_CALENDAR_API_KEY', 'Optionnel', 'Cle API (lecture seule). N\'autorise pas la creation d\'evenements.'],
                ].map(([v, r, d]) => (
                  <tr key={v}>
                    <td className="py-2 pr-3 font-mono text-xs text-orange-600 align-top">{v}</td>
                    <td className="py-2 pr-3 text-xs text-gray-500 whitespace-nowrap align-top">{r}</td>
                    <td className="py-2 text-xs text-gray-600">{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

      </div>
    </div>
  );
}
