'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { emailConsoleAPI } from '@/lib/api';

type EmailTemplate = {
  _id: string;
  code: string;
  name: string;
  description?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  category: 'account' | 'dossier' | 'message' | 'payment' | 'task' | 'system' | 'other';
  isActive: boolean;
  isSystem: boolean;
  variables?: Array<{ name: string; description?: string; example?: string }>;
  updatedAt?: string;
};

type EmailEvent = {
  _id: string;
  eventKey: string;
  label: string;
  description?: string;
  category: string;
  templateCode: string;
  enabled: boolean;
  cooldownSec: number;
};

type EmailLog = {
  _id: string;
  eventKey: string;
  to: string;
  subject: string;
  templateCode: string;
  status: 'sent' | 'failed';
  error?: string;
  createdAt: string;
};

const categories = ['account', 'dossier', 'message', 'payment', 'task', 'system', 'other'];

export default function AdminEmailsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<'templates' | 'events' | 'logs' | 'test'>('templates');
  const [loading, setLoading] = useState(false);
  const [dbWarning, setDbWarning] = useState<string | null>(null);

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [events, setEvents] = useState<EmailEvent[]>([]);
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logsPages, setLogsPages] = useState(1);

  const [search, setSearch] = useState('');
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: '',
    name: '',
    description: '',
    subject: '',
    htmlContent: '',
    textContent: '',
    category: 'other',
    isActive: true,
  });

  const [testTemplateId, setTestTemplateId] = useState('');
  const [testTo, setTestTo] = useState('');
  const [testToName, setTestToName] = useState('');
  const [testVarsRaw, setTestVarsRaw] = useState('{\n  "firstName": "Wade"\n}');
  const [previewSubject, setPreviewSubject] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [directMail, setDirectMail] = useState({
    to: '',
    toName: '',
    subject: '',
    htmlContent: '<p>Message de test</p>',
  });

  const selectedTemplate = useMemo(
    () => templates.find((t) => t._id === testTemplateId) || null,
    [templates, testTemplateId]
  );

  const templatesForTest = useMemo(() => {
    const active = templates.filter((t) => t.isActive);
    return [...active].sort((a, b) => {
      const aTs = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTs = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTs - aTs;
    });
  }, [templates]);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    const role = (session?.user as any)?.role;
    if (!['admin', 'superadmin'].includes(role)) {
      router.push('/client');
      return;
    }
    loadAll();
  }, [status, session, tab, logsPage]);

  const loadAll = async () => {
    try {
      setLoading(true);
      setDbWarning(null);
      try {
        await emailConsoleAPI.initDefaults();
      } catch (e: any) {
        if (e?.response?.status === 503 || e?.response?.data?.code === 'DATABASE_UNAVAILABLE') {
          setDbWarning(e?.response?.data?.message || 'Base de données indisponible.');
          setTemplates([]);
          setEvents([]);
          setLogs([]);
          return;
        }
        // init optionnel si templates déjà présents
      }
      if (tab === 'templates' || tab === 'test') {
        const t = await emailConsoleAPI.getTemplates({ search });
        setTemplates(t.data.templates || []);
      }
      if (tab === 'events') {
        const e = await emailConsoleAPI.getEvents();
        setEvents(e.data.events || []);
      }
      if (tab === 'logs') {
        const l = await emailConsoleAPI.getLogs({ page: logsPage, limit: 50 });
        setLogs(l.data.logs || []);
        setLogsPages(l.data.pages || 1);
      }
    } catch (error: any) {
      if (error?.response?.status === 503 || error?.response?.data?.code === 'DATABASE_UNAVAILABLE') {
        setDbWarning(error?.response?.data?.message || 'Base de données indisponible.');
      }
      console.error('Erreur console emails:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingTemplateId(null);
    setForm({
      code: '',
      name: '',
      description: '',
      subject: '',
      htmlContent: '',
      textContent: '',
      category: 'other',
      isActive: true,
    });
  };

  const saveTemplate = async () => {
    try {
      if (editingTemplateId) {
        await emailConsoleAPI.updateTemplate(editingTemplateId, form);
      } else {
        await emailConsoleAPI.createTemplate(form);
      }
      resetForm();
      await loadAll();
    } catch (error: any) {
      alert(error?.response?.data?.message || 'Erreur lors de la sauvegarde');
    }
  };

  const editTemplate = (t: EmailTemplate) => {
    setEditingTemplateId(t._id);
    setForm({
      code: t.code,
      name: t.name,
      description: t.description || '',
      subject: t.subject,
      htmlContent: t.htmlContent,
      textContent: t.textContent || '',
      category: t.category,
      isActive: t.isActive,
    });
  };

  const toggleEvent = async (ev: EmailEvent) => {
    try {
      await emailConsoleAPI.updateEvent(ev._id, { enabled: !ev.enabled });
      await loadAll();
    } catch (error: any) {
      alert(error?.response?.data?.message || 'Impossible de mettre à jour l’événement');
    }
  };

  const parseVars = () => {
    try {
      return JSON.parse(testVarsRaw || '{}');
    } catch {
      throw new Error('JSON de variables invalide');
    }
  };

  const previewTemplate = async () => {
    try {
      if (!testTemplateId) return alert('Sélectionne un template');
      const vars = parseVars();
      const res = await emailConsoleAPI.previewTemplate(testTemplateId, vars);
      setPreviewSubject(res.data.preview.subject || '');
      setPreviewHtml(res.data.preview.htmlContent || '');
    } catch (error: any) {
      alert(error.message || error?.response?.data?.message || 'Erreur preview');
    }
  };

  const sendTemplateTest = async () => {
    try {
      if (!testTemplateId || !testTo) return alert('Template et email destinataire requis');
      const vars = parseVars();
      const res = await emailConsoleAPI.sendTemplateTest(testTemplateId, testTo, testToName, vars);
      alert(`Email de test envoyé. MessageId: ${res.data.messageId || 'n/a'}`);
      setTab('logs');
    } catch (error: any) {
      const d = error?.response?.data;
      alert(d?.message || d?.error || 'Erreur envoi test');
    }
  };

  const sendDirect = async () => {
    try {
      const res = await emailConsoleAPI.sendDirect(directMail);
      alert(`Email envoyé. MessageId: ${res.data.messageId || 'n/a'}`);
      setTab('logs');
    } catch (error: any) {
      alert(error?.response?.data?.message || 'Erreur envoi direct');
    }
  };

  if (status === 'loading') return <div className="p-8">Chargement...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Console Email</h1>
        <p className="text-muted-foreground">Templates, activations d&apos;événements, journal d&apos;envoi et tests.</p>
      </div>

      {dbWarning && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <strong className="block mb-1">MongoDB requis</strong>
          {dbWarning}
        </div>
      )}

      <div className="bg-white rounded-xl border shadow-sm">
        <div className="flex border-b overflow-x-auto">
          {[
            ['templates', 'Templates'],
            ['events', 'Automations'],
            ['logs', 'Logs'],
            ['test', 'Test envoi'],
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k as any)}
              className={`px-5 py-3 text-sm font-semibold ${tab === k ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {loading && <div className="mb-4 text-sm text-muted-foreground">Chargement...</div>}

          {tab === 'templates' && (
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-3">
                <input className="border rounded p-2" placeholder="Recherche code/nom" value={search} onChange={(e) => setSearch(e.target.value)} />
                <button className="border rounded p-2" onClick={loadAll}>Rafraîchir</button>
              </div>

              <div className="border rounded p-4 space-y-3">
                <h2 className="font-semibold">{editingTemplateId ? 'Modifier template' : 'Nouveau template'}</h2>
                <div className="grid md:grid-cols-2 gap-3">
                  <input className="border rounded p-2" placeholder="Code" value={form.code} onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))} />
                  <input className="border rounded p-2" placeholder="Nom" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
                  <input className="border rounded p-2 md:col-span-2" placeholder="Sujet" value={form.subject} onChange={(e) => setForm((s) => ({ ...s, subject: e.target.value }))} />
                  <input className="border rounded p-2 md:col-span-2" placeholder="Description" value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} />
                  <textarea className="border rounded p-2 md:col-span-2 min-h-[120px]" placeholder="HTML" value={form.htmlContent} onChange={(e) => setForm((s) => ({ ...s, htmlContent: e.target.value }))} />
                  <textarea className="border rounded p-2 md:col-span-2 min-h-[80px]" placeholder="Texte brut (optionnel)" value={form.textContent} onChange={(e) => setForm((s) => ({ ...s, textContent: e.target.value }))} />
                  <select className="border rounded p-2" value={form.category} onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))}>
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((s) => ({ ...s, isActive: e.target.checked }))} />
                    Actif
                  </label>
                </div>
                <div className="flex gap-2">
                  <button className="border rounded px-4 py-2 bg-primary text-white" onClick={saveTemplate}>Enregistrer</button>
                  <button className="border rounded px-4 py-2" onClick={resetForm}>Annuler</button>
                </div>
              </div>

              <div className="space-y-3">
                {templates.map((t) => (
                  <div key={t._id} className="border rounded p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">{t.name} <span className="text-xs text-muted-foreground">({t.code})</span></p>
                        <p className="text-sm text-muted-foreground">{t.subject}</p>
                      </div>
                      <div className="flex gap-2">
                        <button className="border rounded px-3 py-1 text-sm" onClick={() => editTemplate(t)}>Modifier</button>
                        {!t.isSystem && (
                          <button className="border rounded px-3 py-1 text-sm text-red-600" onClick={async () => {
                            if (!confirm('Supprimer ce template ?')) return;
                            await emailConsoleAPI.deleteTemplate(t._id);
                            await loadAll();
                          }}>Supprimer</button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'events' && (
            <div className="space-y-3">
              {events.map((ev) => (
                <div key={ev._id} className="border rounded p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{ev.label} <span className="text-xs text-muted-foreground">({ev.eventKey})</span></p>
                    <p className="text-sm text-muted-foreground">{ev.templateCode} - {ev.description || 'Sans description'}</p>
                  </div>
                  <button
                    className={`px-3 py-1 rounded text-sm ${ev.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}
                    onClick={() => toggleEvent(ev)}
                  >
                    {ev.enabled ? 'Activé' : 'Désactivé'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {tab === 'logs' && (
            <div className="space-y-3">
              {logs.map((l) => (
                <div key={l._id} className="border rounded p-3">
                  <div className="flex justify-between gap-3 text-sm">
                    <div>
                      <p><strong>{l.to}</strong> - {l.subject}</p>
                      <p className="text-muted-foreground">{new Date(l.createdAt).toLocaleString('fr-FR')} - {l.eventKey} - {l.templateCode || 'manual'}</p>
                      {l.error && <p className="text-red-600">{l.error}</p>}
                    </div>
                    <span className={`px-2 h-fit rounded text-xs ${l.status === 'sent' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>{l.status}</span>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <button className="border rounded px-3 py-1" disabled={logsPage <= 1} onClick={() => setLogsPage((p) => p - 1)}>Précédent</button>
                <span className="text-sm">Page {logsPage}/{logsPages}</span>
                <button className="border rounded px-3 py-1" disabled={logsPage >= logsPages} onClick={() => setLogsPage((p) => p + 1)}>Suivant</button>
              </div>
            </div>
          )}

          {tab === 'test' && (
            <div className="space-y-6">
              <div className="border rounded p-4 space-y-3">
                <h2 className="font-semibold">Test via template</h2>
                <select className="border rounded p-2 w-full" value={testTemplateId} onChange={(e) => setTestTemplateId(e.target.value)}>
                  <option value="">Sélectionner un template</option>
                  {templatesForTest.map((t) => <option key={t._id} value={t._id}>{t.name} ({t.code})</option>)}
                </select>
                {selectedTemplate && <p className="text-sm text-muted-foreground">Sujet template: {selectedTemplate.subject}</p>}
                <input className="border rounded p-2 w-full" placeholder="Destinataire email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                <input className="border rounded p-2 w-full" placeholder="Nom destinataire (optionnel)" value={testToName} onChange={(e) => setTestToName(e.target.value)} />
                <textarea className="border rounded p-2 w-full min-h-[120px] font-mono text-sm" value={testVarsRaw} onChange={(e) => setTestVarsRaw(e.target.value)} />
                <div className="flex gap-2">
                  <button className="border rounded px-4 py-2" onClick={previewTemplate}>Prévisualiser</button>
                  <button className="border rounded px-4 py-2 bg-primary text-white" onClick={sendTemplateTest}>Envoyer test template</button>
                </div>
                {(previewSubject || previewHtml) && (
                  <div className="bg-gray-50 rounded p-3 text-sm">
                    <p><strong>Sujet:</strong> {previewSubject}</p>
                    <div className="mt-2"><strong>HTML:</strong></div>
                    <pre className="whitespace-pre-wrap">{previewHtml}</pre>
                  </div>
                )}
              </div>

              <div className="border rounded p-4 space-y-3">
                <h2 className="font-semibold">Envoi direct</h2>
                <input className="border rounded p-2 w-full" placeholder="Destinataire email" value={directMail.to} onChange={(e) => setDirectMail((s) => ({ ...s, to: e.target.value }))} />
                <input className="border rounded p-2 w-full" placeholder="Nom destinataire" value={directMail.toName} onChange={(e) => setDirectMail((s) => ({ ...s, toName: e.target.value }))} />
                <input className="border rounded p-2 w-full" placeholder="Sujet" value={directMail.subject} onChange={(e) => setDirectMail((s) => ({ ...s, subject: e.target.value }))} />
                <textarea className="border rounded p-2 w-full min-h-[120px]" value={directMail.htmlContent} onChange={(e) => setDirectMail((s) => ({ ...s, htmlContent: e.target.value }))} />
                <button className="border rounded px-4 py-2 bg-primary text-white" onClick={sendDirect}>Envoyer email direct</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

