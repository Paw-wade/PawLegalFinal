export type ServiceConfig = {
  id: string;
  titre: string;
  description: string;
  duree?: string;
  prix?: string;
  points: string[];
  isPortal?: boolean;
};

export const servicesConfig: ServiceConfig[] = [
  {
    id: 'consultation',
    titre: 'Consultation juridique',
    description:
      'Mise en relation avec un avocat spécialisé pour évaluer votre situation et identifier les premiers leviers d’action.',
    duree: '01h',
    prix: "À convenir avec l'avocat",
    points: [
      'Analyse approfondie de votre situation',
      'Conseils personnalisés et concrets',
      'Évaluation des différentes options',
      'Recommandations stratégiques',
    ],
  },
  {
    id: 'accompagnement-complet',
    titre: 'Accompagnement complet',
    description:
      'Accompagnement personnalisé tout au long de vos démarches administratives, de la première demande au suivi des décisions.',
    duree: 'Selon le dossier',
    prix: 'Sur dossier',
    points: [
      'Accompagnement personnalisé sur la durée',
      'Demande de titre de séjour',
      'Demande de visa',
      "Correspondance avec l’administration concernée",
      'Recours gracieux et hiérarchique',
      'Recours contentieux (en lien avec un avocat)',
      'Intervention du Consulat du Sénégal',
      'Saisine du Défenseur des droits',
    ],
  },
  {
    id: 'portail-titre-sejour',
    titre: 'Portail de gestion du cycle de vie et de renouvellement du titre de séjour',
    description:
      'Plateforme complète de suivi et de gestion de votre titre de séjour, pour anticiper les échéances et sécuriser vos démarches.',
    duree: "Jusqu'au terme de renouvellement",
    prix: 'Accès gratuit',
    points: [
      'Tableau de bord dédié à votre titre',
      'Assistant de préparation au renouvellement',
      'Suivi des échéances en temps réel',
      'Alertes et rappels automatisés',
    ],
    isPortal: true,
  },
  {
    id: 'assistant-demarches',
    titre: 'Assistant démarches titres de séjour',
    description:
      'Un accompagnement pas-à-pas pour préparer vos demandes de titres de séjour et de visas, avec une vision claire de chaque étape.',
    duree: 'Selon votre dossier',
    prix: 'Inclus dans la plateforme',
    points: [
      'Checklist personnalisée des pièces à fournir',
      'Rappels d’échéances de dépôt',
      'Suivi de l’état de vos démarches',
      'Modèles de courriers administratifs',
    ],
  },
];

