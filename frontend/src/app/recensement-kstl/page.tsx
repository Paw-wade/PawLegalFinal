'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { getApiBaseUrl } from '@/lib/api';
import DahiraMembreCard from '@/components/DahiraMembreCard';

const COMMISSIONS: { nom: string; info: string }[] = [
  {
    nom: 'Culte',
    info: "Organise les dahiras hebdomadaires, les programmes religieux (dont le Kamil) et les grands evenements religieux ; integre les nouveaux membres et propose des activites educatives pour les enfants et les apprenants.",
  },
  {
    nom: 'Enseignements et soutien scolaire',
    info: "Gere les cours, le suivi des eleves, le carnet de liaison, et l'encadrement des enseignants.",
  },
  {
    nom: 'Organisation',
    info: "S'occupe de la logistique des evenements : cuisines, materiel, stockage, transport, et discipline des equipes.",
  },
  {
    nom: 'Communication et audiovisuel',
    info: "Anime les reseaux sociaux (Instagram, WhatsApp, YouTube), assure la couverture audiovisuelle, veille a la charte graphique et suit les performances.",
  },
  {
    nom: 'Finance',
    info: "Gere les cotisations et les collectes (y compris en ligne), assure le suivi financier, l'autofinancement et la diversification des ressources.",
  },
  {
    nom: 'Sociale',
    info: "Accompagne les membres dans leur logement et leurs demarches administratives, organise la distribution de vetements, et anime le Marche Occas' et la caisse de solidarite.",
  },
  {
    nom: 'Kourel',
    info: "Prend en charge les recitations et chants religieux, leurs repetitions, les deplacements, et l'accompagnement des etudiants et des membres.",
  },
  {
    nom: 'Secretariat general',
    info: "Assure la coordination generale du Dahira : fait le lien entre les commissions et le bureau, veille au suivi des decisions, prepare la logistique des grands rassemblements, gere le suivi administratif (documents, comptes rendus, calendrier, courriers) et fait circuler l'information — sans se substituer a aucune commission specialisee.",
  },
];

const ANNEES = Array.from({ length: 30 }, (_, i) => String(new Date().getFullYear() - i));

const STEPS = [
  'Identification',
  'Categorie',
  'Commissions',
  'Engagement',
];

type Etat = 'idle' | 'sending' | 'success' | 'error';

export default function RecensementKSTLPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    photo: '',
    nom: '',
    prenom: '',
    sexe: '',
    email: '',
    telephone: '',
    adresse: '',
    situationProfessionnelle: '',
    niveauEtudes: '',
    intituleFormation: '',
    categorieMembre: '',
    statutAnciennete: '',
    dateAdhesionApprox: '',
    commissions: [] as string[],
    competences: '',
    disponibilite: '',
    engagementCommission: false,
    consentementDonnees: false,
    acceptationReglement: false,
  });
  const [etat, setEtat] = useState<Etat>('idle');
  const [erreurMessage, setErreurMessage] = useState('');
  const [reglementUrl, setReglementUrl] = useState('');
  const [membreId, setMembreId] = useState('');
  const [showCarte, setShowCarte] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const carteRef = useRef<HTMLDivElement>(null);

  const handleDownloadPng = useCallback(async () => {
    if (!carteRef.current) return;
    setDownloading(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(carteRef.current, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        scale: 2,
      });
      const link = document.createElement('a');
      link.download = `carte-membre-dahira.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      // silently ignore
    } finally {
      setDownloading(false);
    }
  }, []);

  useEffect(() => {
    const base = getApiBaseUrl().replace(/\/api$/, '');
    fetch(`${base}/api/dahira/reglement`)
      .then((r) => r.json())
      .then((j) => { if (j?.data?.url) setReglementUrl(j.data.url); })
      .catch(() => {});
  }, []);

  const set = (field: string, value: unknown) => {
    setErreurMessage('');
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 400;
      const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      set('photo', canvas.toDataURL('image/jpeg', 0.82));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const toggleCommission = (c: string) => {
    setErreurMessage('');
    setForm((prev) => ({
      ...prev,
      commissions: prev.commissions.includes(c)
        ? prev.commissions.filter((x) => x !== c)
        : [...prev.commissions, c],
    }));
  };

  const DEV_SKIP_VALIDATION = process.env.NODE_ENV === 'development';

  const validateStep = (): string => {
    if (DEV_SKIP_VALIDATION) return '';
    if (step === 0) {
      if (!form.nom.trim()) return 'Le nom est requis.';
      if (!form.prenom.trim()) return 'Le prenom est requis.';
      if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
        return 'Une adresse email valide est requise.';
    }
    if (step === 1) {
      if (!form.categorieMembre) return 'Veuillez choisir une categorie de membre.';
      if (!form.statutAnciennete) return "Veuillez choisir un statut d'anciennete.";
    }
    if (step === 3) {
      if (!form.engagementCommission) return "Vous devez accepter l'engagement (article 9).";
      if (!form.consentementDonnees) return 'Vous devez accepter le consentement (article 31).';
      if (!form.acceptationReglement) return 'Vous devez vous engager a respecter le reglement interieur.';
    }
    return '';
  };

  const next = () => {
    const err = validateStep();
    if (err) { setErreurMessage(err); return; }
    setErreurMessage('');
    setStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const prev = () => {
    setErreurMessage('');
    setStep((s) => s - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateStep();
    if (err) { setErreurMessage(err); return; }
    setEtat('sending');
    setErreurMessage('');
    try {
      const base = getApiBaseUrl().replace(/\/api$/, '');
      const res = await fetch(`${base}/api/dahira/membres`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        const msgs = json.errors?.map((e: any) => e.msg).join(' - ') || json.message || 'Erreur.';
        setErreurMessage(msgs);
        setEtat('error');
        return;
      }
      if (json.data?.id) setMembreId(json.data.id);
      setEtat('success');
    } catch {
      setErreurMessage('Impossible de contacter le serveur. Veuillez reessayer.');
      setEtat('error');
    }
  };

  // --- Styles communs ---
  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#1a6b3c] focus:outline-none focus:ring-1 focus:ring-[#1a6b3c]';
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1';

  // --- Succes ---
  if (etat === 'success') {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center px-4 py-12">
        <div className="max-w-lg w-full text-center space-y-6">
          <div className="flex justify-center">
            <Image src="/Logo dahira.jpeg" alt="Logo KSTL" width={88} height={88} className="rounded-full" />
          </div>

          <div className="bg-white border border-green-200 rounded-2xl px-6 py-7 shadow-sm space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-gray-900">
                جزاك الله خيراً{' '}
                {form.sexe === 'H' ? 'Seugn ' : form.sexe === 'F' ? 'Soxna ' : ''}
                {form.prenom} {form.nom}
              </h2>
              <p className="text-gray-500 text-sm leading-relaxed">
                Votre recensement a ete transmis au secretariat general du Dahira Sahadatou Mouridina.
              </p>
            </div>

            {membreId && !showCarte && (
              <button
                onClick={() => setShowCarte(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1a6b3c] text-white text-sm font-semibold hover:bg-[#155a33] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 9a6 6 0 11-12 0 6 6 0 0112 0zM9 15v6m-3-3h6" />
                </svg>
                Voir ma carte de membre
              </button>
            )}
          </div>

          {membreId && showCarte && (
            <div className="space-y-4">
              <div className="flex justify-center overflow-x-auto pb-1">
                <div ref={carteRef} className="inline-block">
                  <DahiraMembreCard
                    id={membreId}
                    prenom={form.prenom}
                    nom={form.nom}
                    sexe={form.sexe as 'H' | 'F' | ''}
                    photo={form.photo || undefined}
                    categorieMembre={form.categorieMembre as 'actif' | 'adherent' | 'sympathisant'}
                    dateAdhesionApprox={form.dateAdhesionApprox}
                    anneeCreation={new Date().getFullYear().toString()}
                  />
                </div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={handleDownloadPng}
                  disabled={downloading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1a6b3c] text-white text-sm font-semibold hover:bg-[#155a33] disabled:opacity-60 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {downloading ? 'Generation...' : 'Telecharger ma carte (PNG)'}
                </button>
                <p className="text-xs text-gray-400">
                  Scannez le QR code pour acceder a votre fiche personnelle.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-50 py-10 px-4">
      <div className="max-w-xl mx-auto space-y-6">

        {/* En-tete fixe */}
        <header className="text-center space-y-3">
          <div className="flex justify-center">
            <Image
              src="/Logo dahira.jpeg"
              alt="Dahira Sahadatou Mouridina"
              width={88}
              height={88}
              className="rounded-full shadow-md"
              priority
            />
          </div>
          <div>
            <p className="text-xs font-semibold tracking-widest text-[#9b7d2a] uppercase mb-1">
              Dahira Sahadatou Mouridina
            </p>
            <h1 className="text-xl font-bold text-gray-900">
              Recensement des membres et voeux de commission
            </h1>
          </div>
        </header>

        {/* Bandeau reglement interieur */}
        {reglementUrl && (
          <div className="flex items-center justify-between gap-3 bg-[#1a6b3c]/8 border border-[#1a6b3c]/25 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-[#1a6b3c] text-xl shrink-0">📄</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#1a6b3c]">Reglement interieur</p>
                <p className="text-xs text-gray-500">Consultez le reglement avant de remplir le formulaire</p>
              </div>
            </div>
            <a
              href={reglementUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a6b3c] text-white text-xs font-semibold hover:bg-[#155a33] transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Telecharger
            </a>
          </div>
        )}

        {/* Indicateur d'etapes */}
        <div className="flex items-center gap-0">
          {STEPS.map((label, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <React.Fragment key={label}>
                <div className="flex flex-col items-center flex-shrink-0">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
                      ${done ? 'bg-[#1a6b3c] border-[#1a6b3c] text-white' : active ? 'bg-white border-[#1a6b3c] text-[#1a6b3c]' : 'bg-white border-gray-300 text-gray-400'}`}
                  >
                    {done ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span className={`text-[10px] mt-1 font-medium hidden sm:block ${active ? 'text-[#1a6b3c]' : done ? 'text-[#1a6b3c]/70' : 'text-gray-400'}`}>
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 mb-4 transition-all ${i < step ? 'bg-[#1a6b3c]' : 'bg-gray-200'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Carte de l'etape courante */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">

            {/* --- ETAPE 1 : Identification --- */}
            {step === 0 && (
              <>
                <h2 className="text-base font-semibold text-[#1a6b3c] border-b border-[#1a6b3c]/20 pb-2 mb-2">
                  Section 1 : Identification du membre
                </h2>
                {/* Photo */}
                <div className="flex flex-col items-center gap-3 pb-2">
                  <label className="cursor-pointer group">
                    <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-dashed border-[#1a6b3c]/40 bg-stone-50 flex items-center justify-center group-hover:border-[#1a6b3c] transition-colors">
                      {form.photo ? (
                        <img src={form.photo} alt="Photo" className="w-full h-full object-cover" />
                      ) : (
                        <svg className="w-10 h-10 text-gray-300 group-hover:text-[#1a6b3c]/50 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      )}
                    </div>
                    <span className="block text-center text-xs font-medium text-[#1a6b3c] hover:underline mt-2">
                      {form.photo ? 'Changer la photo' : 'Ajouter une photo · facultatif'}
                    </span>
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
                  </label>
                  {form.photo && (
                    <button type="button" onClick={() => set('photo', '')} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                      Supprimer
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Nom <span className="text-red-500">*</span></label>
                    <input type="text" required maxLength={100} className={inputCls} value={form.nom} onChange={(e) => set('nom', e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Prenom <span className="text-red-500">*</span></label>
                    <input type="text" required maxLength={100} className={inputCls} value={form.prenom} onChange={(e) => set('prenom', e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Sexe</label>
                  <div className="flex gap-6 mt-1">
                    {[{ val: 'H', label: 'Homme' }, { val: 'F', label: 'Femme' }].map(({ val, label }) => (
                      <label key={val} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                        <input
                          type="radio"
                          name="sexe"
                          value={val}
                          checked={form.sexe === val}
                          onChange={() => set('sexe', val)}
                          className="accent-[#1a6b3c] w-4 h-4"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Adresse email <span className="text-red-500">*</span></label>
                  <input type="email" required className={inputCls} placeholder="exemple@email.com" value={form.email} onChange={(e) => set('email', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Telephone</label>
                  <input type="tel" maxLength={30} className={inputCls} placeholder="06 xx xx xx xx" value={form.telephone} onChange={(e) => set('telephone', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Adresse postale</label>
                  <input type="text" maxLength={300} className={inputCls} placeholder="Rue, code postal, ville" value={form.adresse} onChange={(e) => set('adresse', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Situation professionnelle</label>
                  <select className={inputCls} value={form.situationProfessionnelle} onChange={(e) => set('situationProfessionnelle', e.target.value)}>
                    <option value="">-- Selectionnez --</option>
                    <option value="Etudiant">Etudiant</option>
                    <option value="Salarie">Salarie</option>
                    <option value="Independant">Independant</option>
                    <option value="Autre">Autre</option>
                  </select>
                </div>
                {form.situationProfessionnelle === 'Etudiant' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-3 border-l-2 border-[#1a6b3c]/30">
                    <div>
                      <label className={labelCls}>Niveau d&apos;etudes</label>
                      <select className={inputCls} value={form.niveauEtudes} onChange={(e) => set('niveauEtudes', e.target.value)}>
                        <option value="">-- Selectionnez --</option>
                        <option value="Lycee / Bac">Lycee / Bac</option>
                        <option value="BTS">BTS</option>
                        <option value="DUT / BUT">DUT / BUT</option>
                        <option value="Classe preparatoire (CPGE)">Classe preparatoire (CPGE)</option>
                        <option value="Bac+1">Bac+1</option>
                        <option value="Bac+2">Bac+2</option>
                        <option value="Bac+3 (Licence / Licence pro)">Bac+3 (Licence / Licence pro)</option>
                        <option value="Bac+4">Bac+4</option>
                        <option value="Bac+5 (Master / Ingenieur)">Bac+5 (Master / Ingenieur)</option>
                        <option value="Doctorat">Doctorat</option>
                        <option value="Formation professionnelle / Apprentissage">Formation professionnelle / Apprentissage</option>
                        <option value="Autre">Autre</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Intitule de la formation</label>
                      <input type="text" maxLength={200} className={inputCls} placeholder="Ex. : Droit, Informatique, BTS Commerce..." value={form.intituleFormation} onChange={(e) => set('intituleFormation', e.target.value)} />
                    </div>
                  </div>
                )}
              </>
            )}

            {/* --- ETAPE 2 : Categorie & anciennete --- */}
            {step === 1 && (
              <>
                <h2 className="text-base font-semibold text-[#1a6b3c] border-b border-[#1a6b3c]/20 pb-2 mb-2">
                  Section 2 : Categorie et anciennete
                </h2>
                <fieldset>
                  <legend className={labelCls}>Categorie de membre <span className="text-red-500">*</span></legend>
                  <div className="space-y-2 mt-1">
                    {([
                      ['actif', 'Membre actif'],
                      ['adherent', 'Membre adherent'],
                      ['sympathisant', 'Sympathisant'],
                    ] as const).map(([val, label]) => (
                      <label key={val} className="flex items-center gap-3 cursor-pointer group">
                        <input type="radio" name="categorieMembre" value={val} required checked={form.categorieMembre === val} onChange={() => set('categorieMembre', val)} className="w-4 h-4 accent-[#1a6b3c]" />
                        <span className="text-sm text-gray-800 group-hover:text-[#1a6b3c] transition-colors">{label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="pt-2">
                  <legend className={labelCls}>Statut d&apos;anciennete <span className="text-red-500">*</span></legend>
                  <div className="space-y-2 mt-1">
                    {([
                      ['nouveau', 'Nouveau membre (moins de 6 mois)'],
                      ['1_3_ans', 'Membre depuis 1 a 3 ans'],
                      ['plus_3_ans', "Membre depuis plus de 3 ans (eligible au conseil d'administration)"],
                    ] as const).map(([val, label]) => (
                      <label key={val} className="flex items-start gap-3 cursor-pointer group">
                        <input type="radio" name="statutAnciennete" value={val} required checked={form.statutAnciennete === val} onChange={() => set('statutAnciennete', val)} className="w-4 h-4 mt-0.5 accent-[#1a6b3c]" />
                        <span className="text-sm text-gray-800 group-hover:text-[#1a6b3c] transition-colors">{label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <label className={labelCls}>Annee d&apos;adhesion approximative</label>
                  <select className={inputCls} value={form.dateAdhesionApprox} onChange={(e) => set('dateAdhesionApprox', e.target.value)}>
                    <option value="">-- Selectionnez une annee --</option>
                    {ANNEES.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </>
            )}

            {/* --- ETAPE 3 : Commissions --- */}
            {step === 2 && (
              <>
                <h2 className="text-base font-semibold text-[#1a6b3c] border-b border-[#1a6b3c]/20 pb-2 mb-2">
                  Section 3 : Souhait d&apos;integration en commission
                </h2>
                <p className="text-sm text-gray-700 font-medium">
                  Dans quelle(s) commission(s) souhaitez-vous vous impliquer ?
                </p>
                <div className="space-y-2">
                  {COMMISSIONS.map((c, i) => (
                    <div key={c.nom} className="flex items-center gap-3">
                      <label className="flex items-center gap-3 cursor-pointer group flex-1 min-w-0">
                        <input type="checkbox" checked={form.commissions.includes(c.nom)} onChange={() => toggleCommission(c.nom)} className="w-4 h-4 rounded accent-[#1a6b3c] shrink-0" />
                        <span className="text-sm text-gray-800 group-hover:text-[#1a6b3c] transition-colors">
                          <span className="text-[#9b7d2a] font-medium mr-1">{i + 1}.</span>{c.nom}
                        </span>
                      </label>
                      <div className="relative shrink-0">
                        <button
                          type="button"
                          tabIndex={-1}
                          className="peer w-4 h-4 rounded-full border border-gray-300 text-gray-400 hover:text-[#1a6b3c] hover:border-[#1a6b3c] flex items-center justify-center text-[10px] leading-none transition-colors"
                          aria-label={`En savoir plus sur la commission ${c.nom}`}
                        >
                          i
                        </button>
                        <div className="peer-hover:opacity-100 peer-focus:opacity-100 opacity-0 pointer-events-none absolute right-0 bottom-6 z-20 w-64 rounded-lg bg-gray-900 text-white text-xs leading-relaxed px-3 py-2.5 shadow-xl transition-opacity duration-150">
                          {c.info}
                          <div className="absolute right-1.5 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-900" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                  <strong>Article 8 du reglement interieur :</strong> Un membre ne peut cumuler plus de trois responsabilites de commission.
                </div>
                <div>
                  <label className={labelCls}>Competences ou experience <span className="text-gray-400 font-normal">(facultatif)</span></label>
                  <textarea rows={3} maxLength={1000} className={inputCls + ' resize-none'} placeholder="Precisez vos competences en lien avec la ou les commissions choisies..." value={form.competences} onChange={(e) => set('competences', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Disponibilite <span className="text-gray-400 font-normal">(facultatif)</span></label>
                  <input type="text" maxLength={300} className={inputCls} placeholder="Ex. : ponctuelle, reguliere, je peux prendre une responsabilite..." value={form.disponibilite} onChange={(e) => set('disponibilite', e.target.value)} />
                </div>
              </>
            )}

            {/* --- ETAPE 4 : Engagement --- */}
            {step === 3 && (
              <>
                <h2 className="text-base font-semibold text-[#1a6b3c] border-b border-[#1a6b3c]/20 pb-2 mb-2">
                  Section 4 : Engagement
                </h2>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" required checked={form.engagementCommission} onChange={(e) => set('engagementCommission', e.target.checked)} className="w-4 h-4 mt-0.5 accent-[#1a6b3c] flex-shrink-0" />
                  <span className="text-sm text-gray-800">
                    Je m&apos;engage, selon mes disponibilites, a m&apos;impliquer dans au moins une commission.{' '}
                    <span className="text-gray-500">(Article 9 du reglement interieur)</span>
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" required checked={form.consentementDonnees} onChange={(e) => set('consentementDonnees', e.target.checked)} className="w-4 h-4 mt-0.5 accent-[#1a6b3c] flex-shrink-0" />
                  <span className="text-sm text-gray-800">
                    J&apos;accepte que mes informations soient conservees dans le registre des membres du Dahira Sahadatou Mouridina a des fins internes.{' '}
                    <span className="text-gray-500">(Article 31 du reglement interieur)</span>
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" required checked={form.acceptationReglement} onChange={(e) => set('acceptationReglement', e.target.checked)} className="w-4 h-4 mt-0.5 accent-[#1a6b3c] flex-shrink-0" />
                  <span className="text-sm text-gray-800">
                    Je m&apos;engage a respecter le reglement interieur du Dahira Sahadatou Mouridina dans son integralite.
                  </span>
                </label>

                {/* Recapitulatif */}
                <div className="bg-stone-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-600 space-y-1 mt-2">
                  <p className="font-semibold text-gray-700 mb-2">Recapitulatif de votre fiche</p>
                  <p><span className="text-gray-400">Nom :</span> {form.prenom} {form.nom}{form.sexe ? ` (${form.sexe === 'H' ? 'Homme' : 'Femme'})` : ''}</p>
                  <p><span className="text-gray-400">Email :</span> {form.email}</p>
                  {form.telephone && <p><span className="text-gray-400">Tel :</span> {form.telephone}</p>}
                  <p><span className="text-gray-400">Categorie :</span> {
                    { actif: 'Membre actif', adherent: 'Membre adherent', sympathisant: 'Sympathisant' }[form.categorieMembre]
                  }</p>
                  <p><span className="text-gray-400">Anciennete :</span> {
                    { nouveau: '< 6 mois', '1_3_ans': '1 a 3 ans', plus_3_ans: '+ 3 ans' }[form.statutAnciennete]
                  }</p>
                  {form.commissions.length > 0 && (
                    <p><span className="text-gray-400">Commissions :</span> {form.commissions.join(', ')}</p>
                  )}
                </div>
              </>
            )}

            {/* Message d'erreur */}
            {erreurMessage && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                {erreurMessage}
              </p>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-4">
            {step > 0 ? (
              <button
                type="button"
                onClick={prev}
                className="px-5 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                &#8592; Precedent
              </button>
            ) : (
              <div />
            )}

            <span className="text-xs text-gray-400">{step + 1} / {STEPS.length}</span>

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={next}
                className="px-5 py-2.5 rounded-xl bg-[#1a6b3c] text-white text-sm font-semibold hover:bg-[#155a32] transition-colors shadow-sm"
              >
                Suivant &#8594;
              </button>
            ) : (
              <button
                type="submit"
                disabled={etat === 'sending'}
                className="px-5 py-2.5 rounded-xl bg-[#1a6b3c] text-white text-sm font-semibold hover:bg-[#155a32] disabled:opacity-60 transition-colors shadow-sm"
              >
                {etat === 'sending' ? 'Envoi...' : 'Soumettre ma fiche'}
              </button>
            )}
          </div>

          <p className="text-center text-xs text-gray-400 mt-4 pb-2">
            Dahira Sahadatou Mouridina &mdash; Donnees confidentielles
          </p>
        </form>
      </div>
    </main>
  );
}
