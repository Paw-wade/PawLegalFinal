'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { tarificationFormules } from '@/data/tarificationConfig';
import type { TarifFormuleId } from '@/data/tarificationConfig';
import { Button } from '@/components/ui/Button';

type Props = {
  dossier: any;
  /** Aperçu admin : pas d’enregistrement des choix */
  readOnly?: boolean;
  backHref: string;
  backLabel?: string;
};

/**
 * Même contenu informatif que l’espace client « Tarification », pour un dossier donné.
 * En readOnly (aperçu admin), les boutons de choix de formule sont désactivés.
 */
export function ClientTarificationPreview({
  dossier,
  readOnly = true,
  backHref,
  backLabel = 'Retour au dossier',
}: Props) {
  const selectedDossierId = dossier?._id || dossier?.id || '';
  const currentFormule = dossier?.formuleTarifaire as TarifFormuleId | undefined;
  const fraisExoneresPourDossier = !!dossier?.fraisExoneres;
  const montantTarificationFixe = Number(dossier?.montantTarificationFixe || 0);
  const hasMontantFixe = montantTarificationFixe > 0;

  const initialIndex = useMemo(() => {
    if (currentFormule === 'premium') return tarificationFormules.findIndex((f) => f.id === 'premium');
    if (currentFormule === 'standard') return tarificationFormules.findIndex((f) => f.id === 'standard');
    return 0;
  }, [currentFormule]);

  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const current = tarificationFormules[selectedIndex] || tarificationFormules[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/10">
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-12">
        {readOnly && (
          <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <strong>Aperçu vue client</strong> — vous voyez la page tarification telle qu’elle est présentée au
            client pour ce dossier. Les actions de choix de formule sont désactivées.
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-sm font-medium text-orange-700 hover:text-orange-900"
          >
            ← {backLabel}
          </Link>
        </div>

        <div className="mb-8">
          <span className="mb-2 inline-block text-xs font-semibold uppercase tracking-wider text-orange-500">
            Espace client (aperçu)
          </span>
          <h1 className="mb-2 text-3xl font-bold text-gray-900 sm:text-4xl">Tarification</h1>
          <p className="max-w-2xl leading-relaxed text-gray-600">
            Choisissez la formule adaptée à votre dossier. Le paiement peut être effectué{' '}
            <strong>en plusieurs fois</strong> (sur demande).
          </p>
        </div>

        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="mb-2 block text-xs font-semibold uppercase text-gray-500">Dossier concerné</p>
          <p className="text-sm font-semibold text-gray-900">
            {(dossier?.titre || 'Sans titre') + (dossier?.numero ? ` — ${dossier.numero}` : '')}
          </p>
          {fraisExoneresPourDossier ? (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
              <p className="font-semibold">Frais exonérés pour ce dossier</p>
              <p className="mt-1 text-emerald-800/90">
                L’administration n’attend pas de choix de formule tarifaire. Vous pouvez ignorer cette page pour ce
                dossier.
              </p>
            </div>
          ) : hasMontantFixe ? (
            <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
              <p className="font-semibold">Montant convenu avec Ada Papers.</p>
              <p className="mt-1 text-blue-800/90">
                Montant à régler:{' '}
                {montantTarificationFixe.toLocaleString('fr-FR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                EUR. Aucun choix de formule n’est requis pour ce dossier.
              </p>
            </div>
          ) : (
            currentFormule && (
              <p className="mt-3 text-sm font-medium text-green-800">
                Formule actuellement enregistrée pour ce dossier :{' '}
                <span className="uppercase">{currentFormule === 'premium' ? 'Premium' : 'Standard'}</span>
                {dossier?.formuleTarifaireChoisieAt && (
                  <span className="font-normal text-gray-600">
                    {' '}
                    (le{' '}
                    {new Date(dossier.formuleTarifaireChoisieAt).toLocaleDateString('fr-FR', {
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

        {dossier && !fraisExoneresPourDossier && (
          <div className="relative mb-6 overflow-hidden rounded-xl bg-gradient-to-r from-orange-200/80 via-orange-300/60 to-orange-200/80 p-[1px] shadow-sm">
            <div className="rounded-[11px] border border-gray-100 bg-white px-4 py-3.5 sm:px-5 sm:py-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 gap-y-1">
                <h2 className="text-base font-bold text-gray-900 sm:text-lg">
                  Modalités de paiement
                  <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide text-orange-600">
                    Tarification ouverte
                  </span>
                </h2>
              </div>
              <p className="mb-3 text-xs leading-snug text-gray-600">
                Règlement par WERO, PayPal ou virement — indiquez la référence du dossier sur le libellé ou le message.
              </p>
              <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
                <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2.5">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-orange-600">WERO</p>
                  <p className="font-mono text-xs font-semibold tabular-nums text-gray-900 select-all">+33 7 68 03 33 58</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2.5">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-orange-600">PayPal</p>
                  <a
                    href="mailto:wadepaw@gmail.com"
                    className="break-all text-xs font-semibold text-orange-600 underline underline-offset-2 hover:text-orange-700"
                  >
                    wadepaw@gmail.com
                  </a>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2.5 sm:min-w-0">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-orange-600">Virement</p>
                  <p className="break-all font-mono text-[11px] font-semibold leading-tight text-gray-900 select-all">
                    FR76 3000 4012 1800 0014 7080 247
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950">
          <p className="mb-1 font-semibold">💡 La formule Premium est la plus choisie par nos clients</p>
          <p className="text-amber-900/90">
            Elle couvre la délégation complète de votre demande. La Plateforme vérifie les pièces, introduit la demande,
            en assure le suivi et les échanges avec l&apos;administration, fait toutes démarches nécessaires à la
            satisfaction rapide de la demande.
          </p>
        </div>

        <div className="grid items-start gap-8 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
          <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/60 p-2">
            {tarificationFormules.map((f, index) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedIndex(index)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                  selectedIndex === index
                    ? 'border border-orange-400 bg-white font-semibold text-orange-700 shadow-sm'
                    : 'border border-transparent bg-transparent text-gray-700 hover:border-gray-200 hover:bg-white'
                }`}
              >
                <span className="block">{f.title}</span>
                {f.badge && (
                  <span className="mt-1 inline-block rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                    {f.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
            <div className="space-y-4">
              <div>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-semibold text-gray-900">{current.title}</h2>
                  {current.badge && (
                    <span className="rounded-md bg-orange-500 px-2 py-1 text-xs font-bold uppercase tracking-wide text-white">
                      {current.badge}
                    </span>
                  )}
                </div>
                <p className="text-sm leading-relaxed text-gray-600">{current.subtitle}</p>
              </div>

              <div className="grid gap-3 text-sm text-gray-700 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">Tarif</p>
                  <p className="font-medium text-gray-900">{current.prix}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">Paiement</p>
                  <p className="font-medium text-gray-900">Possibilité de payer en plusieurs fois</p>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">Inclus</p>
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-gray-700">
                  {current.points.map((point) => (
                    <li key={point} className="leading-relaxed">
                      {point}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-wrap gap-3 border-t border-gray-200 pt-4">
                <Button
                  size="lg"
                  className="min-w-[200px] bg-orange-600 text-white hover:bg-orange-700"
                  disabled={readOnly || !selectedDossierId || fraisExoneresPourDossier || hasMontantFixe}
                  onClick={() => {}}
                >
                  {readOnly ? `Aperçu : ${current.title}` : `Choisir ${current.title}`}
                </Button>
                <Link href={backHref}>
                  <Button variant="outline" size="lg" className="min-w-[160px]">
                    {backLabel}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
