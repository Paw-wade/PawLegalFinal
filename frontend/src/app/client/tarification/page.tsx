'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { dossiersAPI } from '@/lib/api';
import { tarificationFormules } from '@/data/tarificationConfig';
import type { TarifFormuleId } from '@/data/tarificationConfig';
import { Button } from '@/components/ui/Button';

export default function ClientTarificationPage() {
  const { status } = useSession();
  const router = useRouter();
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDossierId, setSelectedDossierId] = useState<string>('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dossiersAPI.getMyDossiers();
      const list = res.data?.dossiers || res.data?.data || [];
      setDossiers(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error(e);
      setDossiers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (status === 'authenticated') load();
  }, [status, router, load]);

  useEffect(() => {
    if (!dossiers.length) {
      setSelectedDossierId('');
      return;
    }
    setSelectedDossierId((prev) => {
      if (prev && dossiers.some((d) => (d._id || d.id) === prev)) return prev;
      return dossiers[0]._id || dossiers[0].id;
    });
  }, [dossiers]);

  const selectedDossier = dossiers.find((d) => (d._id || d.id) === selectedDossierId);
  const currentFormule = selectedDossier?.formuleTarifaire as TarifFormuleId | undefined;
  const fraisExoneresPourDossier = !!selectedDossier?.fraisExoneres;
  const montantTarificationFixe = Number(selectedDossier?.montantTarificationFixe || 0);
  const hasMontantFixe = montantTarificationFixe > 0;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const handleChoose = async (formule: TarifFormuleId) => {
    if (!selectedDossierId) {
      showToast('Sélectionnez un dossier.');
      return;
    }
    if (fraisExoneresPourDossier) {
      showToast('Les frais de ce dossier ont été exonérés : aucun choix de formule n’est nécessaire.');
      return;
    }
    if (hasMontantFixe) {
      showToast('Le montant de ce dossier est déjà fixé par l’administration : aucun choix de formule n’est nécessaire.');
      return;
    }
    setSaving(true);
    try {
      const res = await dossiersAPI.setDossierFormuleTarifaire(selectedDossierId, formule);
      if (res.data?.success === false) {
        throw new Error(res.data?.message || 'Erreur');
      }
      showToast(
        formule === 'premium'
          ? 'Formule Premium enregistrée pour ce dossier.'
          : 'Formule standard enregistrée pour ce dossier.'
      );
      await load();
    } catch (err: any) {
      showToast(err.response?.data?.message || err.message || 'Impossible d’enregistrer le choix.');
    } finally {
      setSaving(false);
    }
  };

  const current = tarificationFormules[selectedIndex] || tarificationFormules[0];

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">Chargement…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/10">
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-lg bg-gray-900 text-white text-sm shadow-lg max-w-md text-center">
          {toast}
        </div>
      )}
      <main className="w-full max-w-6xl mx-auto px-4 py-8 sm:py-12">
        <div className="mb-8">
          <span className="inline-block text-xs font-semibold uppercase tracking-wider text-orange-500 mb-2">
            Espace client
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">Tarification</h1>
          <p className="text-gray-600 max-w-2xl leading-relaxed">
            Choisissez la formule adaptée à votre dossier. Le paiement peut être effectué{' '}
            <strong>en plusieurs fois</strong> (sur demande).
          </p>
        </div>

        {dossiers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
            <p className="text-gray-700 mb-4">Vous n’avez pas encore de dossier.</p>
            <Link href="/client/dossiers">
              <Button>Créer ou voir mes dossiers</Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <label htmlFor="dossier-tarif" className="block text-xs font-semibold uppercase text-gray-500 mb-2">
                Dossier concerné
              </label>
              <select
                id="dossier-tarif"
                className="w-full max-w-xl rounded-lg border border-gray-300 px-3 py-2.5 text-sm bg-white"
                value={selectedDossierId}
                onChange={(e) => setSelectedDossierId(e.target.value)}
              >
                {dossiers.map((d) => {
                  const id = d._id || d.id;
                  return (
                    <option key={id} value={id}>
                      {(d.titre || 'Sans titre') + (d.numero ? ` — ${d.numero}` : '')}
                    </option>
                  );
                })}
              </select>
              {fraisExoneresPourDossier ? (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
                  <p className="font-semibold">Frais exonérés pour ce dossier</p>
                  <p className="text-emerald-800/90 mt-1">
                    L’administration n’attend pas de choix de formule tarifaire. Vous pouvez ignorer cette page pour ce dossier.
                  </p>
                </div>
              ) : hasMontantFixe ? (
                <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
                  <p className="font-semibold">Montant convenu avec Ada Papers.</p>
                  <p className="text-blue-800/90 mt-1">
                    Montant à régler: {montantTarificationFixe.toLocaleString('fr-FR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    EUR. Aucun choix de formule n’est requis pour ce dossier.
                  </p>
                </div>
              ) : (
                currentFormule && (
                  <p className="mt-3 text-sm text-green-800 font-medium">
                    Formule actuellement enregistrée pour ce dossier :{' '}
                    <span className="uppercase">{currentFormule === 'premium' ? 'Premium' : 'Standard'}</span>
                    {selectedDossier?.formuleTarifaireChoisieAt && (
                      <span className="text-gray-600 font-normal">
                        {' '}
                        (le{' '}
                        {new Date(selectedDossier.formuleTarifaireChoisieAt).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                        )
                      </span>
                    )}
                  </p>
                )
              )}
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 mb-8 text-sm text-amber-950">
              <p className="font-semibold mb-1">💡 La formule Premium est la plus choisie par nos clients</p>
              <p className="text-amber-900/90">
                Elle couvre la délégation complète de votre demande. La Plateforme vérifie les pièces, introduit la demande, en assure le suivi et les échanges avec l'administion, fait toutes démarches nécessaires à la satisfaction rapide de la demande.
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] items-start">
              <div className="space-y-2 border border-gray-200 rounded-xl bg-gray-50/60 p-2">
                {tarificationFormules.map((f, index) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedIndex(index)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      selectedIndex === index
                        ? 'bg-white border border-orange-400 text-orange-700 font-semibold shadow-sm'
                        : 'bg-transparent border border-transparent text-gray-700 hover:bg-white hover:border-gray-200'
                    }`}
                  >
                    <span className="block">{f.title}</span>
                    {f.badge && (
                      <span className="mt-1 inline-block text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                        {f.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 md:p-8">
                <div className="space-y-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h2 className="text-2xl font-semibold text-gray-900">{current.title}</h2>
                      {current.badge && (
                        <span className="text-xs font-bold uppercase tracking-wide text-white bg-orange-500 px-2 py-1 rounded-md">
                          {current.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">{current.subtitle}</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 text-sm text-gray-700">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Tarif</p>
                      <p className="font-medium text-gray-900">{current.prix}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Paiement</p>
                      <p className="font-medium text-gray-900">Possibilité de payer en plusieurs fois</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Inclus</p>
                    <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-700">
                      {current.points.map((point) => (
                        <li key={point} className="leading-relaxed">
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-4 border-t border-gray-200 flex flex-wrap gap-3">
                    <Button
                      size="lg"
                      className="min-w-[200px] bg-orange-600 hover:bg-orange-700 text-white"
                      disabled={saving || !selectedDossierId || fraisExoneresPourDossier || hasMontantFixe}
                      onClick={() => handleChoose(current.id)}
                    >
                      {saving ? 'Enregistrement…' : `Choisir ${current.title}`}
                    </Button>
                    <Link href="/client/dossiers">
                      <Button variant="outline" size="lg" className="min-w-[160px]">
                        Retour aux dossiers
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
