'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import api from '@/lib/api';
import * as XLSX from 'xlsx';

type Membre = {
  _id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  adresse?: string;
  situationProfessionnelle?: string;
  categorieMembre: 'actif' | 'adherent' | 'sympathisant';
  statutAnciennete: 'nouveau' | '1_3_ans' | 'plus_3_ans';
  dateAdhesionApprox?: string;
  commissions: string[];
  competences?: string;
  disponibilite?: string;
  engagementCommission: boolean;
  consentementDonnees: boolean;
  createdAt: string;
};

const CATEGORIE_LABEL: Record<string, string> = {
  actif: 'Membre actif',
  adherent: 'Membre adherent',
  sympathisant: 'Sympathisant',
};

const ANCIENNETE_LABEL: Record<string, string> = {
  nouveau: 'Nouveau (< 6 mois)',
  '1_3_ans': '1 a 3 ans',
  plus_3_ans: '+ 3 ans (eligible CA)',
};

const ANCIENNETE_COLOR: Record<string, string> = {
  nouveau: 'bg-gray-100 text-gray-700',
  '1_3_ans': 'bg-blue-50 text-blue-700',
  plus_3_ans: 'bg-green-50 text-green-700',
};

const CATEGORIE_COLOR: Record<string, string> = {
  actif: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  adherent: 'bg-amber-50 text-amber-700 border-amber-200',
  sympathisant: 'bg-gray-50 text-gray-600 border-gray-200',
};

function dateFr(s: string) {
  return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

export default function AdminDahiraPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [membres, setMembres] = useState<Membre[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterAnc, setFilterAnc] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const FORM_URL = 'https://adapapers.fr/recensement-kstl';

  const handleCopyLink = () => {
    navigator.clipboard.writeText(FORM_URL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin');
    if (status === 'authenticated') {
      const role = (session?.user as any)?.role;
      if (role !== 'admin' && role !== 'superadmin') router.push('/client');
    }
  }, [status, session, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    setLoading(true);
    api
      .get('/dahira/membres')
      .then((r) => setMembres(r.data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [status]);

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette fiche ?')) return;
    setDeletingId(id);
    try {
      await api.delete(`/dahira/membres/${id}`);
      setMembres((prev) => prev.filter((m) => m._id !== id));
    } catch {
      alert('Impossible de supprimer la fiche.');
    } finally {
      setDeletingId(null);
    }
  };

  const exportExcel = () => {
    const rows = filtered.map((m) => ({
      'Nom': m.nom,
      'Prenom': m.prenom,
      'Email': m.email,
      'Telephone': m.telephone || '',
      'Adresse': m.adresse || '',
      'Situation professionnelle': m.situationProfessionnelle || '',
      "Niveau d'etudes": (m as any).niveauEtudes || '',
      'Intitule formation': (m as any).intituleFormation || '',
      'Categorie': CATEGORIE_LABEL[m.categorieMembre] || m.categorieMembre,
      'Anciennete': ANCIENNETE_LABEL[m.statutAnciennete] || m.statutAnciennete,
      "Annee d'adhesion": m.dateAdhesionApprox || '',
      'Commissions': (m.commissions || []).join(', '),
      'Competences': m.competences || '',
      'Disponibilite': m.disponibilite || '',
      'Engagement art.9': m.engagementCommission ? 'Oui' : 'Non',
      'Consentement art.31': m.consentementDonnees ? 'Oui' : 'Non',
      'Date inscription': dateFr(m.createdAt),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);

    // Largeurs de colonnes
    ws['!cols'] = [
      { wch: 16 }, // Nom
      { wch: 16 }, // Prenom
      { wch: 28 }, // Email
      { wch: 16 }, // Telephone
      { wch: 30 }, // Adresse
      { wch: 22 }, // Situation
      { wch: 22 }, // Niveau etudes
      { wch: 24 }, // Formation
      { wch: 18 }, // Categorie
      { wch: 20 }, // Anciennete
      { wch: 14 }, // Annee adhesion
      { wch: 40 }, // Commissions
      { wch: 35 }, // Competences
      { wch: 25 }, // Disponibilite
      { wch: 16 }, // Engagement
      { wch: 18 }, // Consentement
      { wch: 16 }, // Date inscription
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Membres Sahadatou Mouridina');

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `recensement-sahadatou-mouridina-${date}.xlsx`);
  };

  const filtered = membres.filter((m) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      m.nom.toLowerCase().includes(q) ||
      m.prenom.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      (m.commissions || []).some((c) => c.toLowerCase().includes(q));
    const matchCat = !filterCat || m.categorieMembre === filterCat;
    const matchAnc = !filterAnc || m.statutAnciennete === filterAnc;
    return matchSearch && matchCat && matchAnc;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <Image src="/Logo dahira.jpeg" alt="KSTL" width={56} height={56} className="rounded-full shadow-sm flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold tracking-widest text-[#9b7d2a] uppercase">Dahira Sahadatou Mouridina</p>
            <h1 className="text-xl font-bold text-gray-900">Donnees de recensement</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopyLink}
              className="px-4 py-2 rounded-lg border border-[#1a6b3c] text-[#1a6b3c] text-sm font-semibold hover:bg-[#1a6b3c]/5 transition-colors"
            >
              {copied ? 'Lien copie !' : 'Copier le lien du formulaire'}
            </button>
            <button
              onClick={exportExcel}
              className="px-4 py-2 rounded-lg bg-[#1a6b3c] text-white text-sm font-semibold hover:bg-[#155a32] transition-colors"
            >
              Exporter Excel
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total', value: membres.length, color: 'text-gray-900' },
            { label: 'Membres actifs', value: membres.filter((m) => m.categorieMembre === 'actif').length, color: 'text-emerald-700' },
            { label: 'Adherents', value: membres.filter((m) => m.categorieMembre === 'adherent').length, color: 'text-amber-700' },
            { label: 'Eligibles CA', value: membres.filter((m) => m.statutAnciennete === 'plus_3_ans').length, color: 'text-blue-700' },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm text-center">
              <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filtres */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap gap-3">
          <input
            type="search"
            placeholder="Rechercher (nom, email, commission...)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-[#1a6b3c] focus:ring-1 focus:ring-[#1a6b3c]"
          />
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-[#1a6b3c]"
          >
            <option value="">Toutes categories</option>
            <option value="actif">Actif</option>
            <option value="adherent">Adherent</option>
            <option value="sympathisant">Sympathisant</option>
          </select>
          <select
            value={filterAnc}
            onChange={(e) => setFilterAnc(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-[#1a6b3c]"
          >
            <option value="">Toutes anciennetes</option>
            <option value="nouveau">Nouveau</option>
            <option value="1_3_ans">1 a 3 ans</option>
            <option value="plus_3_ans">+ 3 ans</option>
          </select>
          <span className="self-center text-xs text-gray-400">{filtered.length} resultat(s)</span>
        </div>

        {/* Liste */}
        {loading ? (
          <p className="text-sm text-gray-500 text-center py-12">Chargement...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-12">Aucune fiche enregistree.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((m) => {
              const isOpen = expanded === m._id;
              return (
                <div key={m._id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : m._id)}
                    className="w-full text-left px-5 py-4 flex flex-wrap items-center gap-3"
                  >
                    <span className={`inline-block rotate-0 transition-transform text-gray-400 ${isOpen ? 'rotate-90' : ''}`}>&#9656;</span>
                    {(m as any).photo ? (
                      <img src={(m as any).photo} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-gray-200" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[#1a6b3c]/10 flex items-center justify-center flex-shrink-0 text-[#1a6b3c] text-xs font-bold">
                        {m.prenom[0]}{m.nom[0]}
                      </div>
                    )}
                    <span className="font-semibold text-gray-900 text-sm min-w-[160px]">
                      {m.nom} {m.prenom}
                    </span>
                    <span className="text-xs text-gray-500 flex-1 min-w-0 truncate">{m.email}</span>
                    <Badge className={CATEGORIE_COLOR[m.categorieMembre]}>
                      {CATEGORIE_LABEL[m.categorieMembre]}
                    </Badge>
                    <Badge className={`border-transparent ${ANCIENNETE_COLOR[m.statutAnciennete]}`}>
                      {ANCIENNETE_LABEL[m.statutAnciennete]}
                    </Badge>
                    <span className="text-xs text-gray-400 ml-auto">{dateFr(m.createdAt)}</span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-100 px-5 py-4 space-y-4 text-sm">
                      {(m as any).photo && (
                        <div className="flex justify-center">
                          <img src={(m as any).photo} alt={`${m.prenom} ${m.nom}`} className="w-24 h-24 rounded-full object-cover border-2 border-[#1a6b3c]/20 shadow-sm" />
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-gray-700">
                        {[
                          ['Telephone', m.telephone],
                          ['Adresse', m.adresse],
                          ['Situation pro.', m.situationProfessionnelle],
                          ['Niveau d\'etudes', (m as any).niveauEtudes],
                          ['Formation', (m as any).intituleFormation],
                          ['Annee d\'adhesion', m.dateAdhesionApprox],
                          ['Disponibilite', m.disponibilite],
                        ]
                          .filter(([, v]) => v)
                          .map(([k, v]) => (
                            <div key={k as string} className="flex gap-2">
                              <span className="text-gray-400 shrink-0 w-36">{k as string}</span>
                              <span>{v as string}</span>
                            </div>
                          ))}
                      </div>

                      {m.commissions?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Commissions souhaitees</p>
                          <div className="flex flex-wrap gap-1.5">
                            {m.commissions.map((c) => (
                              <span key={c} className="bg-[#1a6b3c]/10 text-[#1a6b3c] text-xs font-medium px-2.5 py-1 rounded-full">
                                {c}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {m.competences && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Competences</p>
                          <p className="text-gray-700 text-sm">{m.competences}</p>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 pt-1">
                        {m.engagementCommission && (
                          <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5">
                            Engagement art. 9 accepte
                          </span>
                        )}
                        {m.consentementDonnees && (
                          <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5">
                            Consentement art. 31 accepte
                          </span>
                        )}
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          disabled={deletingId === m._id}
                          onClick={() => handleDelete(m._id)}
                          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors"
                        >
                          {deletingId === m._id ? 'Suppression...' : 'Supprimer cette fiche'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
