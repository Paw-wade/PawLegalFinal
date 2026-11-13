'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005/api';

const STANDARD_STATUTS = [
  { value: 'recu', label: 'Recu' },
  { value: 'accepte', label: 'Accepte' },
  { value: 'refuse', label: 'Refuse' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'cloture', label: 'Cloture' },
  { value: 'annule', label: 'Annule' },
  { value: 'en_attente', label: 'En attente' },
  { value: 'en_attente_onboarding', label: 'En attente - Onboarding' },
  { value: 'en_cours_instruction', label: 'En cours d\'instruction' },
  { value: 'pieces_manquantes', label: 'Pieces manquantes' },
  { value: 'dossier_complet', label: 'Dossier complet' },
  { value: 'depose', label: 'Depose' },
  { value: 'reception_confirmee', label: 'Reception confirmee' },
  { value: 'complement_demande', label: 'Complement demande' },
  { value: 'decision_defavorable', label: 'Decision defavorable' },
  { value: 'communication_motifs', label: 'Communication des motifs' },
  { value: 'recours_preparation', label: 'Recours en preparation' },
  { value: 'gain_cause', label: 'Gain de cause' },
  { value: 'rejet', label: 'Rejet' },
  { value: 'decision_favorable', label: 'Decision favorable' },
  { value: 'autre', label: 'Autre' },
];

const ACTION_TYPES = [
  { value: 'notification_inapp', label: 'Notification in-app' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
];

const DESTINATAIRES = [
  { value: 'client', label: 'Client' },
  { value: 'admin_assigne', label: 'Admin assigne' },
];

type Action = {
  type: 'notification_inapp' | 'email' | 'sms';
  destinataire: 'client' | 'admin_assigne';
  titre: string;
  message: string;
};

type Rule = {
  _id: string;
  statutDeclencheur: string;
  actions: Action[];
  actif: boolean;
  createdAt: string;
};

const emptyAction = (): Action => ({
  type: 'notification_inapp',
  destinataire: 'client',
  titre: '',
  message: '',
});

const VARS_HELP = '{{prenom}}, {{dossier_titre}}, {{statut_label}}, {{dossier_numero}}';

export default function AutomationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [formStatut, setFormStatut] = useState('');
  const [formStatutCustom, setFormStatutCustom] = useState('');
  const [formActif, setFormActif] = useState(true);
  const [formActions, setFormActions] = useState<Action[]>([emptyAction()]);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/admin/login');
  }, [status, router]);

  const fetchRules = useCallback(async () => {
    if (!session?.accessToken) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/automations`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      setRules(data);
    } catch {
      setError('Impossible de charger les regles.');
    } finally {
      setLoading(false);
    }
  }, [session?.accessToken]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  function openCreate() {
    setEditingId(null);
    setFormStatut('');
    setFormStatutCustom('');
    setFormActif(true);
    setFormActions([emptyAction()]);
    setError('');
    setShowForm(true);
  }

  function openEdit(rule: Rule) {
    setEditingId(rule._id);
    const isStandard = STANDARD_STATUTS.some((s) => s.value === rule.statutDeclencheur);
    setFormStatut(isStandard ? rule.statutDeclencheur : '__custom__');
    setFormStatutCustom(isStandard ? '' : rule.statutDeclencheur);
    setFormActif(rule.actif);
    setFormActions(rule.actions.map((a) => ({ ...a })));
    setError('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setError('');
  }

  function updateAction(idx: number, field: keyof Action, value: string) {
    setFormActions((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value } as Action;
      return next;
    });
  }

  function addAction() {
    setFormActions((prev) => [...prev, emptyAction()]);
  }

  function removeAction(idx: number) {
    setFormActions((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const declencheur = formStatut === '__custom__' ? formStatutCustom.trim() : formStatut;
    if (!declencheur) { setError('Choisissez un statut declencheur.'); return; }
    if (formActions.length === 0) { setError('Ajoutez au moins une action.'); return; }
    for (const a of formActions) {
      if (!a.message.trim()) { setError('Le message de chaque action est obligatoire.'); return; }
    }
    setSaving(true);
    try {
      const payload = { statutDeclencheur: declencheur, actions: formActions, actif: formActif };
      if (editingId) {
        await axios.put(`${API}/automations/${editingId}`, payload, {
          headers: { Authorization: `Bearer ${session?.accessToken}` },
        });
      } else {
        await axios.post(`${API}/automations`, payload, {
          headers: { Authorization: `Bearer ${session?.accessToken}` },
        });
      }
      closeForm();
      await fetchRules();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActif(rule: Rule) {
    try {
      await axios.put(`${API}/automations/${rule._id}`, { actif: !rule.actif }, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      });
      await fetchRules();
    } catch {
      setError('Impossible de modifier la regle.');
    }
  }

  async function deleteRule(id: string) {
    if (!confirm('Supprimer cette regle ?')) return;
    try {
      await axios.delete(`${API}/automations/${id}`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      });
      await fetchRules();
    } catch {
      setError('Impossible de supprimer la regle.');
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Automations de statut</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Declenchement automatique de notifications lors d&apos;un changement de statut d&apos;un dossier.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          + Nouvelle regle
        </button>
      </div>

      {error && !showForm && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {rules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          Aucune regle configuree. Cliquez sur &ldquo;+ Nouvelle regle&rdquo; pour commencer.
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule._id}
              className={`rounded-xl border bg-card p-5 ${rule.actif ? 'border-border' : 'border-border/40 opacity-60'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                      {STANDARD_STATUTS.find((s) => s.value === rule.statutDeclencheur)?.label || rule.statutDeclencheur}
                    </span>
                    {!rule.actif && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Inactive</span>
                    )}
                  </div>
                  <div className="mt-2 space-y-1">
                    {rule.actions.map((a, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className={`rounded px-1.5 py-0.5 font-medium ${
                          a.type === 'email' ? 'bg-blue-100 text-blue-700' :
                          a.type === 'sms' ? 'bg-green-100 text-green-700' :
                          'bg-purple-100 text-purple-700'
                        }`}>
                          {ACTION_TYPES.find((t) => t.value === a.type)?.label}
                        </span>
                        <span>vers {DESTINATAIRES.find((d) => d.value === a.destinataire)?.label}</span>
                        {a.titre && <span className="truncate max-w-[200px]">&mdash; {a.titre}</span>}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleActif(rule)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      rule.actif
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {rule.actif ? 'Active' : 'Inactive'}
                  </button>
                  <button
                    onClick={() => openEdit(rule)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => deleteRule(rule._id)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-background shadow-xl overflow-y-auto max-h-[90vh]">
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-foreground">
                  {editingId ? 'Modifier la regle' : 'Nouvelle regle d\'automation'}
                </h2>
                <button onClick={closeForm} className="text-muted-foreground hover:text-foreground text-xl leading-none">&times;</button>
              </div>

              {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Statut declencheur</label>
                  <select
                    value={formStatut}
                    onChange={(e) => setFormStatut(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    required
                  >
                    <option value="">-- Choisir --</option>
                    {STANDARD_STATUTS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                    <option value="__custom__">Statut personnalise...</option>
                  </select>
                  {formStatut === '__custom__' && (
                    <input
                      type="text"
                      value={formStatutCustom}
                      onChange={(e) => setFormStatutCustom(e.target.value)}
                      placeholder="ex: en_revision_consulat"
                      className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="actif"
                    type="checkbox"
                    checked={formActif}
                    onChange={(e) => setFormActif(e.target.checked)}
                    className="rounded border-border"
                  />
                  <label htmlFor="actif" className="text-sm text-foreground">Regle active</label>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-foreground">Actions</label>
                    <button type="button" onClick={addAction} className="text-xs text-primary hover:underline">
                      + Ajouter une action
                    </button>
                  </div>
                  <div className="space-y-4">
                    {formActions.map((action, idx) => (
                      <div key={idx} className="rounded-lg border border-border p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Action {idx + 1}
                          </span>
                          {formActions.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeAction(idx)}
                              className="text-xs text-red-500 hover:underline"
                            >
                              Supprimer
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-muted-foreground mb-1">Type</label>
                            <select
                              value={action.type}
                              onChange={(e) => updateAction(idx, 'type', e.target.value)}
                              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                            >
                              {ACTION_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-muted-foreground mb-1">Destinataire</label>
                            <select
                              value={action.destinataire}
                              onChange={(e) => updateAction(idx, 'destinataire', e.target.value)}
                              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                            >
                              {DESTINATAIRES.map((d) => (
                                <option key={d.value} value={d.value}>{d.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        {action.type !== 'sms' && (
                          <div>
                            <label className="block text-xs text-muted-foreground mb-1">Titre / Objet</label>
                            <input
                              type="text"
                              value={action.titre}
                              onChange={(e) => updateAction(idx, 'titre', e.target.value)}
                              placeholder="ex: Votre dossier {{dossier_titre}} a ete mis a jour"
                              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                          </div>
                        )}
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Message *</label>
                          <textarea
                            value={action.message}
                            onChange={(e) => updateAction(idx, 'message', e.target.value)}
                            rows={3}
                            placeholder={`Bonjour {{prenom}}, votre dossier {{dossier_titre}} est maintenant : {{statut_label}}.`}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Variables disponibles : <code className="bg-muted rounded px-1">{VARS_HELP}</code>
                  </p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Enregistrement...' : editingId ? 'Mettre a jour' : 'Creer la regle'}
                  </button>
                  <button
                    type="button"
                    onClick={closeForm}
                    className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
                  >
                    Annuler
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
