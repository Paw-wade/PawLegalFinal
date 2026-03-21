export type TarifFormuleId = 'premium' | 'standard';

export type TarifFormuleConfig = {
  id: TarifFormuleId;
  title: string;
  subtitle: string;
  prix: string;
  badge?: string;
  highlight?: boolean;
  points: string[];
};

export const tarificationFormules: TarifFormuleConfig[] = [
  {
    id: 'premium',
    title: 'Formule Premium',
    subtitle: 'Délégation complète de la demande de titre de séjour',
    prix: '100 €',
    badge: 'La plus choisie',
    highlight: true,
    points: [
      'Préparation du dossier, système d’alertes et rappels.',
      'Accès gratuit au portail de calcul des délais.',
      'Dépôt dématérialisé ou physique et suivi complet de la demande.',
      'Relances de l’administration.',
      'Correspondance avec l’administration.',
      'Saisine du Défenseur des droits.',
      'Correspondance avec le Défenseur des droits.',
      'Demande d’intervention du consulat du Sénégal (le cas échéant).',
      'Introduction d’un référé mesures utiles (le cas échéant).',
      'Introduction d’un référé suspension (le cas échéant).',
      'Introduction d’un recours en annulation (le cas échéant).',
      'Intervention de notre avocat dans la procédure contentieuse (tarif propre à négocier).',
      'Constitution d’un dossier d’aide juridictionnelle.',
      'Suivi en temps réel de l’évolution du dossier.',
    ],
  },
  {
    id: 'standard',
    title: 'Formule standard',
    subtitle: 'Intervention en cas de retard dans la délivrance',
    prix: '50 € par action ou forfait 250 €',
    points: [
      'Accès gratuit au portail de calcul des délais.',
      'Saisine du Défenseur des droits.',
      'Correspondance avec le Défenseur des droits.',
      'Demande d’intervention du consulat du Sénégal (le cas échéant).',
      'Introduction d’un référé mesures utiles (le cas échéant).',
      'Introduction d’un référé suspension (le cas échéant).',
      'Introduction d’un recours en annulation (le cas échéant).',
      'Intervention de notre avocat dans la procédure contentieuse (tarif propre à négocier).',
      'Constitution d’un dossier d’aide juridictionnelle.',
      'Suivi en temps réel de l’évolution du dossier.',
    ],
  },
];
