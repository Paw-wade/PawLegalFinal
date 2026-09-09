'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { guidesAdminAPI } from '@/lib/api';

type GuideLink = { label: string; url: string };
type BanqueOption = { nom: string; type: 'formulaire' | 'lien'; url: string; label: string };
type GuideStep = {
  order: number;
  titre: string;
  description: string;
  deadline: string;
  cost: string;
  links: GuideLink[];
  warningNote: string;
  promoNote: string;
  special: '' | 'banque';
  banqueOptions: BanqueOption[];
};
type Guide = { titre: string; intro: string; steps: GuideStep[] };

const emptyStep = (order: number): GuideStep => ({
  order,
  titre: '',
  description: '',
  deadline: '',
  cost: '',
  links: [],
  warningNote: '',
  promoNote: '',
  special: '',
  banqueOptions: [],
});

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-gray-600 mb-1">{children}</label>;
}

function Input({ value, onChange, placeholder, className = '' }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white ${className}`}
    />
  );
}

function Textarea({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white resize-y"
    />
  );
}

function StepEditor({ step, idx, onChange, onRemove, onMoveUp, onMoveDown, isFirst, isLast }: {
  step: GuideStep;
  idx: number;
  onChange: (s: GuideStep) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [open, setOpen] = useState(idx === 0);

  const set = <K extends keyof GuideStep>(key: K, val: GuideStep[K]) =>
    onChange({ ...step, [key]: val });

  const updateLink = (i: number, field: keyof GuideLink, val: string) => {
    const links = [...step.links];
    links[i] = { ...links[i], [field]: val };
    set('links', links);
  };
  const addLink = () => set('links', [...step.links, { label: '', url: '' }]);
  const removeLink = (i: number) => set('links', step.links.filter((_, li) => li !== i));

  const updateBanque = (i: number, field: keyof BanqueOption, val: string) => {
    const opts = [...step.banqueOptions];
    opts[i] = { ...opts[i], [field]: val };
    set('banqueOptions', opts);
  };
  const addBanque = () => set('banqueOptions', [...step.banqueOptions, { nom: '', type: 'lien', url: '', label: '' }]);
  const removeBanque = (i: number) => set('banqueOptions', step.banqueOptions.filter((_, bi) => bi !== i));

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 cursor-pointer select-none" onClick={() => setOpen((o) => !o)}>
        <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${open ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
          {step.order}
        </span>
        <span className="flex-1 text-sm font-semibold text-gray-800 truncate">{step.titre || <em className="text-gray-400 font-normal">Titre de l&apos;étape</em>}</span>
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={onMoveUp} disabled={isFirst} className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30" title="Monter">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
          </button>
          <button type="button" onClick={onMoveDown} disabled={isLast} className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30" title="Descendre">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          <button type="button" onClick={onRemove} className="p-1 rounded text-red-400 hover:text-red-600" title="Supprimer">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </div>

      {open && (
        <div className="px-4 py-4 border-t border-gray-100 space-y-4">
          <div>
            <Label>Titre de l&apos;étape *</Label>
            <Input value={step.titre} onChange={(v) => set('titre', v)} placeholder="ex: Valider le visa VLS-TS" />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea value={step.description} onChange={(v) => set('description', v)} placeholder="Description détaillée de l'étape..." rows={4} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Délai</Label>
              <Input value={step.deadline} onChange={(v) => set('deadline', v)} placeholder="ex: Dans les 3 mois" />
            </div>
            <div>
              <Label>Coût</Label>
              <Input value={step.cost} onChange={(v) => set('cost', v)} placeholder="ex: Gratuit / 103 euros" />
            </div>
          </div>

          <div>
            <Label>Note avertissement</Label>
            <Textarea value={step.warningNote} onChange={(v) => set('warningNote', v)} placeholder="Attention, délai à respecter..." rows={2} />
          </div>

          <div>
            <Label>Note promo</Label>
            <Textarea value={step.promoNote} onChange={(v) => set('promoNote', v)} placeholder="Offre partenaire, bonus..." rows={2} />
          </div>

          <div>
            <Label>Liens utiles</Label>
            <div className="space-y-2">
              {step.links.map((link, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input type="text" value={link.label} onChange={(e) => updateLink(i, 'label', e.target.value)} placeholder="Libelle" className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  <input type="url" value={link.url} onChange={(e) => updateLink(i, 'url', e.target.value)} placeholder="https://..." className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  <button type="button" onClick={() => removeLink(i)} className="text-red-400 hover:text-red-600 p-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
              <button type="button" onClick={addLink} className="text-xs text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Ajouter un lien
              </button>
            </div>
          </div>

          <div>
            <Label>Type special</Label>
            <select
              value={step.special}
              onChange={(e) => set('special', e.target.value as '' | 'banque')}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
            >
              <option value="">Aucun</option>
              <option value="banque">Banque (formulaire/lien parrainage)</option>
            </select>
          </div>

          {step.special === 'banque' && (
            <div>
              <Label>Options bancaires</Label>
              <div className="space-y-3">
                {step.banqueOptions.map((opt, i) => (
                  <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2 bg-gray-50">
                    <div className="flex gap-2 items-center">
                      <input type="text" value={opt.nom} onChange={(e) => updateBanque(i, 'nom', e.target.value)} placeholder="Nom banque (ex: BNP Paribas)" className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white" />
                      <select value={opt.type} onChange={(e) => updateBanque(i, 'type', e.target.value)} className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white">
                        <option value="lien">Lien</option>
                        <option value="formulaire">Formulaire</option>
                      </select>
                      <button type="button" onClick={() => removeBanque(i)} className="text-red-400 hover:text-red-600 p-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                    {opt.type === 'lien' && (
                      <div className="flex gap-2">
                        <input type="text" value={opt.label} onChange={(e) => updateBanque(i, 'label', e.target.value)} placeholder="Libelle bouton" className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white" />
                        <input type="url" value={opt.url} onChange={(e) => updateBanque(i, 'url', e.target.value)} placeholder="https://..." className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white" />
                      </div>
                    )}
                  </div>
                ))}
                <button type="button" onClick={addBanque} className="text-xs text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Ajouter une option bancaire
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function GuideEditorPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [guide, setGuide] = useState<Guide>({ titre: '', intro: '', steps: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/auth/signin'); return; }
    if (status !== 'authenticated') return;
    guidesAdminAPI.getGuide()
      .then((res) => {
        if (res.data?.success) {
          const g = res.data.guide;
          setGuide({
            titre: g.titre || '',
            intro: g.intro || '',
            steps: (g.steps || []).map((s: GuideStep) => ({
              order: s.order,
              titre: s.titre || '',
              description: s.description || '',
              deadline: s.deadline || '',
              cost: s.cost || '',
              links: s.links || [],
              warningNote: s.warningNote || '',
              promoNote: s.promoNote || '',
              special: s.special || '',
              banqueOptions: s.banqueOptions || [],
            })),
          });
        }
      })
      .catch(() => setError('Impossible de charger le guide.'))
      .finally(() => setLoading(false));
  }, [status, router]);

  const updateStep = useCallback((idx: number, s: GuideStep) => {
    setGuide((g) => {
      const steps = [...g.steps];
      steps[idx] = s;
      return { ...g, steps };
    });
  }, []);

  const addStep = () => {
    setGuide((g) => ({
      ...g,
      steps: [...g.steps, emptyStep(g.steps.length + 1)],
    }));
  };

  const removeStep = (idx: number) => {
    setGuide((g) => {
      const steps = g.steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 }));
      return { ...g, steps };
    });
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    setGuide((g) => {
      const steps = [...g.steps];
      const target = idx + dir;
      if (target < 0 || target >= steps.length) return g;
      [steps[idx], steps[target]] = [steps[target], steps[idx]];
      return { ...g, steps: steps.map((s, i) => ({ ...s, order: i + 1 })) };
    });
  };

  const handleSave = async () => {
    if (!guide.titre.trim()) { setError('Le titre est requis.'); return; }
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await guidesAdminAPI.updateGuide(guide);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Erreur lors de la sauvegarde. Veuillez réessayer.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button type="button" onClick={() => router.push('/admin/cms')} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              CMS
            </button>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Guide Nouvel Arrivant</h1>
          <p className="text-sm text-gray-500 mt-0.5">Éditez le contenu affiché sur la page publique du guide.</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <a href="/guides/nouvel-arrivant" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 px-3 py-2 rounded-lg transition-colors">
            Apercu
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
          </a>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white px-4 py-2 rounded-lg transition-colors"
          >
            {saving ? (
              <>
                <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                Enregistrement...
              </>
            ) : saved ? (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Enregistre
              </>
            ) : (
              'Enregistrer'
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      <div className="border border-gray-200 rounded-xl p-5 space-y-4 bg-white">
        <h2 className="text-sm font-semibold text-gray-700">Informations générales</h2>
        <div>
          <Label>Titre *</Label>
          <Input value={guide.titre} onChange={(v) => setGuide((g) => ({ ...g, titre: v }))} placeholder="Guide du nouvel arrivant - Étudiant international en France" />
        </div>
        <div>
          <Label>Introduction</Label>
          <Textarea value={guide.intro} onChange={(v) => setGuide((g) => ({ ...g, intro: v }))} placeholder="Ce guide récapitule les démarches..." rows={3} />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Étapes ({guide.steps.length})</h2>
        </div>
        {guide.steps.map((step, idx) => (
          <StepEditor
            key={idx}
            step={step}
            idx={idx}
            onChange={(s) => updateStep(idx, s)}
            onRemove={() => removeStep(idx)}
            onMoveUp={() => moveStep(idx, -1)}
            onMoveDown={() => moveStep(idx, 1)}
            isFirst={idx === 0}
            isLast={idx === guide.steps.length - 1}
          />
        ))}
        <button
          type="button"
          onClick={addStep}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm font-medium text-gray-400 hover:border-orange-300 hover:text-orange-500 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Ajouter une étape
        </button>
      </div>

      <div className="flex justify-end pb-8">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 text-sm font-semibold bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white px-6 py-2.5 rounded-lg transition-colors"
        >
          {saving ? 'Enregistrement...' : 'Enregistrer le guide'}
        </button>
      </div>
    </div>
  );
}
