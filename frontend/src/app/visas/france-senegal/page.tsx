import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import Link from 'next/link';
import CorrespondanceVisa from './CorrespondanceVisa';

const formules = [
  {
    id: 'essentiel',
    nom: 'Essentiel',
    prix: '40 000',
    devise: 'FCFA',
    couleur: 'border-gray-200',
    accentBg: 'bg-gray-50',
    accentText: 'text-gray-700',
    badge: null,
    inclus: [
      'Analyse de votre situation',
      'Checklist personnalisee des documents',
      'Verification du dossier complet',
      'Guide de preparation entretien VFS',
    ],
    exclu: [
      'Redaction de lettre de motivation',
      'Suivi administratif post-depot',
      'Recours en cas de refus',
    ],
  },
  {
    id: 'standard',
    nom: 'Standard',
    prix: '75 000',
    devise: 'FCFA',
    couleur: 'border-orange-400',
    accentBg: 'bg-orange-50',
    accentText: 'text-orange-700',
    badge: 'Populaire',
    inclus: [
      'Analyse de votre situation',
      'Checklist personnalisee des documents',
      'Verification du dossier complet',
      'Guide de preparation entretien VFS',
      'Redaction de la lettre de motivation',
      'Suivi jusqu\'au rendez-vous VFS',
    ],
    exclu: [
      'Recours en cas de refus',
    ],
  },
  {
    id: 'complet',
    nom: 'Complet',
    prix: '120 000',
    devise: 'FCFA',
    couleur: 'border-gray-800',
    accentBg: 'bg-gray-900',
    accentText: 'text-white',
    badge: 'Tout inclus',
    inclus: [
      'Analyse de votre situation',
      'Checklist personnalisee des documents',
      'Verification du dossier complet',
      'Guide de preparation entretien VFS',
      'Redaction de la lettre de motivation',
      'Suivi jusqu\'au rendez-vous VFS',
      'Suivi administratif post-depot',
      'Assistance recours en cas de refus',
    ],
    exclu: [],
  },
];

const etapes = [
  {
    num: '01',
    titre: 'Choisissez votre formule',
    desc: 'Selectionnez la formule adaptee a votre situation et completez le formulaire de prise en charge.',
  },
  {
    num: '02',
    titre: 'Paiement securise',
    desc: 'Reglement par virement Wave, Orange Money ou virement bancaire. Un recu vous est envoye immediatement.',
  },
  {
    num: '03',
    titre: 'Analyse de votre dossier',
    desc: 'Nos juristes analysent votre situation et vous transmettent la checklist de documents adaptee sous 48 h.',
  },
  {
    num: '04',
    titre: 'Constitution du dossier',
    desc: 'Vous rassemblez les documents. Nous les verifions et vous indiquons les eventuels manques.',
  },
  {
    num: '05',
    titre: 'Rendez-vous VFS Global',
    desc: 'Vous deposez votre dossier au centre VFS Global de Dakar avec notre guide de preparation entretien.',
  },
  {
    num: '06',
    titre: 'Suivi et resultat',
    desc: 'Selon la formule, nous assurons le suivi et vous accompagnons en cas de refus ou de demande de complement.',
  },
];

const faq = [
  {
    q: 'Quels types de visas pour la France couvrez-vous ?',
    r: 'Nous accompagnons les demandes de visa court sejour (Schengen - type C), visa long sejour (type D) pour etudes, travail, regroupement familial et visa visiteur. La formule adaptee depend de votre motif de voyage.',
  },
  {
    q: 'Garantissez-vous l\'obtention du visa ?',
    r: 'Non. L\'octroi du visa releve exclusivement de la decision souveraine du consulat de France. Nous garantissons la qualite et la completude de votre dossier, ce qui augmente significativement vos chances d\'obtention.',
  },
  {
    q: 'Quels sont les delais de traitement ?',
    r: 'Comptez 48 h pour la remise de la checklist personnalisee, puis 5 a 10 jours ouvrables pour la verification du dossier. Le delai d\'obtention du visa par le consulat varie de 15 a 90 jours selon le type de visa.',
  },
  {
    q: 'Puis-je commencer sans avoir tous mes documents ?',
    r: 'Oui. Commencez par regler et remplir le formulaire de prise en charge. Nos juristes analyseront votre situation et vous indiqueront exactement quels documents rassembler.',
  },
  {
    q: 'Comment se passe le paiement ?',
    r: 'Paiement integral a la commande par Wave, Orange Money ou virement bancaire. Aucun frais supplementaire n\'est facture apres validation de votre commande.',
  },
];

export default function VisaFranceSenegalPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/10">
      <Header variant="home" />

      {/* Hero */}
      <section className="relative py-16 overflow-hidden bg-gradient-to-br from-orange-50 via-background to-background">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700 mb-4">
              Nouveau service
            </span>
            <h1 className="text-4xl sm:text-5xl font-bold text-foreground leading-tight mb-4">
              Visa France depuis le <span className="text-orange-500">Senegal</span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-2xl mx-auto">
              Ada Papers vous accompagne de A a Z dans votre demande de visa pour la France.
              Dossier verifie, lettre de motivation, preparation VFS : nous maximisons vos chances.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <a
                href="#formules"
                className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-orange-600 transition-colors"
              >
                Voir les formules
              </a>
              <a
                href="#comment-ca-marche"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-6 py-3 text-sm font-semibold text-foreground hover:bg-accent transition-colors"
              >
                Comment ca marche
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Stats de confiance */}
      <section className="border-y border-border bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
            {[
              { val: '3 formules', label: 'adaptees a votre budget' },
              { val: '48 h', label: 'pour votre checklist personnalisee' },
              { val: 'VFS Global', label: 'Dakar accompagnement inclus' },
              { val: 'FCFA', label: 'paiement local accepte' },
            ].map((s, i) => (
              <div key={i}>
                <div className="text-xl font-bold text-orange-500">{s.val}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Formules */}
      <section id="formules" className="py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-foreground">Choisissez votre formule</h2>
            <p className="text-muted-foreground mt-2">
              Toutes les formules incluent une analyse juridique personnalisee de votre situation.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
            {formules.map((f) => (
              <div
                key={f.id}
                className={`relative flex flex-col rounded-2xl border-2 ${f.couleur} bg-card overflow-hidden`}
              >
                {f.badge && (
                  <div className={`absolute top-4 right-4 rounded-full px-2.5 py-0.5 text-xs font-bold ${f.id === 'complet' ? 'bg-white text-gray-900' : 'bg-orange-500 text-white'}`}>
                    {f.badge}
                  </div>
                )}
                <div className={`p-6 ${f.id === 'complet' ? f.accentBg : ''}`}>
                  <div className={`text-sm font-semibold uppercase tracking-wide mb-1 ${f.id === 'complet' ? f.accentText : 'text-muted-foreground'}`}>
                    {f.nom}
                  </div>
                  <div className={`text-3xl font-extrabold ${f.id === 'complet' ? f.accentText : 'text-foreground'}`}>
                    {f.prix} <span className="text-base font-semibold">{f.devise}</span>
                  </div>
                </div>
                <div className="flex-1 p-6 flex flex-col gap-4">
                  <ul className="space-y-2">
                    {f.inclus.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                        <span className="mt-0.5 text-green-500 shrink-0">✓</span>
                        {item}
                      </li>
                    ))}
                    {f.exclu.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground line-through">
                        <span className="mt-0.5 text-gray-300 shrink-0">✗</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-4">
                    <Link
                      href={`/nouvelle-demande?visa=france-senegal&formule=${f.id}`}
                      className={`block w-full text-center rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
                        f.id === 'standard'
                          ? 'bg-orange-500 text-white hover:bg-orange-600 shadow-md'
                          : f.id === 'complet'
                          ? 'bg-white text-gray-900 hover:bg-gray-100'
                          : 'border border-border bg-background hover:bg-accent text-foreground'
                      }`}
                    >
                      Demarrer avec {f.nom}
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CorrespondanceVisa />

      {/* Comment ca marche */}
      <section id="comment-ca-marche" className="py-16 bg-secondary/20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-foreground">Comment ca marche ?</h2>
            <p className="text-muted-foreground mt-2">6 etapes simples pour maximiser vos chances d&apos;obtention</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
            {etapes.map((e) => (
              <div key={e.num} className="rounded-xl bg-card border border-border p-6">
                <div className="text-3xl font-black text-orange-200 mb-3">{e.num}</div>
                <h3 className="font-bold text-foreground mb-2">{e.titre}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{e.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tableau comparatif inclus / non inclus */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-foreground text-center mb-10">
              Ce qui est inclus dans toutes les formules
            </h2>
            <div className="rounded-2xl border border-border overflow-hidden">
              {[
                { label: 'Analyse juridique personnalisee de votre situation', inclus: true },
                { label: 'Checklist de documents sur mesure', inclus: true },
                { label: 'Verification de la completude du dossier', inclus: true },
                { label: 'Guide de preparation a l\'entretien VFS Global', inclus: true },
                { label: 'Support par messagerie pendant le traitement', inclus: true },
                { label: 'Conseil sur le centre VFS de Dakar', inclus: true },
              ].map((row, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-5 py-3.5 text-sm ${i % 2 === 0 ? 'bg-background' : 'bg-secondary/20'}`}
                >
                  <span className="text-green-500 shrink-0 text-base">✓</span>
                  <span className="text-foreground">{row.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-16 bg-secondary/20">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold text-foreground text-center mb-10">
              Questions frequentes
            </h2>
            <div className="space-y-4">
              {faq.map((item, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-5">
                  <div className="font-semibold text-foreground mb-2">{item.q}</div>
                  <div className="text-sm text-muted-foreground leading-relaxed">{item.r}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center rounded-2xl border border-orange-200 bg-orange-50 p-10">
            <h2 className="text-2xl font-bold text-foreground mb-3">
              Pret a demarrer votre demande de visa ?
            </h2>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              Choisissez votre formule et deposez votre dossier de prise en charge en moins de 10 minutes.
              Nos juristes vous recontactent sous 48 h.
            </p>
            <a
              href="#formules"
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-8 py-3.5 text-sm font-semibold text-white shadow-md hover:bg-orange-600 transition-colors"
            >
              Voir les formules et demarrer
            </a>
          </div>
        </div>
      </section>

      {/* Mention legale */}
      <section className="pb-8">
        <div className="container mx-auto px-4">
          <p className="max-w-3xl mx-auto text-center text-xs text-muted-foreground leading-relaxed border-t border-border pt-6">
            Ada Papers est un cabinet de conseil juridique. Nos services constituent une aide a la constitution
            de dossier et ne remplacent pas une representation par un avocat. L&apos;octroi du visa releve
            exclusivement de la decision souveraine des autorites consulaires francaises. Les tarifs sont
            exprimes en francs CFA (XOF) et sont dus a la commande, independamment de l&apos;issue de
            la demande de visa. Conformement a la reglementation applicable, aucun remboursement ne sera
            effectue apres le debut de la prestation d&apos;analyse.
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
