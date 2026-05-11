'use client';

import React from 'react';
import { Scale, HeartHandshake, LayoutDashboard, Building2 } from 'lucide-react';

export type ServiceConfig = {
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  duree?: string;
  prix?: string;
  points?: string[];
  isPortal?: boolean;
  /** Lien CTA dédié (ex. création de dossier thématique) */
  ctaHref?: string;
  ctaLabel?: string;
};

export const servicesConfig: ServiceConfig[] = [
  {
    title: 'Consultation juridique',
    description:
      'Mise en relation avec un avocat spécialisé pour évaluer votre situation et identifier les premiers leviers d’action.',
    icon: Scale,
    color: 'primary',
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
    title: 'Accompagnement complet',
    description:
      'Accompagnement personnalisé tout au long de vos démarches administratives, de la première demande au suivi des décisions.',
    icon: HeartHandshake,
    color: 'blue',
    duree: 'Selon le dossier',
    prix: 'Sur dossier',
    points: [
      'Accompagnement personnalisé sur la durée',
      'Demande de titre de séjour',
      'Demande de visa',
      "Correspondance avec l'administration concernée",
      'Recours gracieux et hiérarchique',
      'Recours contentieux (en lien avec un avocat)',
      'Intervention du Consulat du Sénégal',
      'Saisine du Défenseur des droits',
    ],
  },
  {
    title: 'Portail titre de séjour',
    description:
      'Plateforme complète de suivi et de gestion de votre titre de séjour, pour anticiper les échéances et sécuriser vos démarches.',
    icon: LayoutDashboard,
    color: 'green',
    duree: "Jusqu'au terme de renouvellement",
    prix: 'Accès gratuit',
    isPortal: true,
    points: [
      'Tableau de bord dédié à votre titre',
      'Assistant de préparation au renouvellement',
      'Suivi des échéances en temps réel',
      'Alertes et rappels automatisés',
    ],
  },
  {
    title: 'Constitution de société',
    description:
      'Structuration de votre projet entrepreneurial : choix de la forme juridique, formalités d’immatriculation et accompagnement au Sénégal ou en France, en lien avec des professionnels du droit des affaires.',
    icon: Building2,
    color: 'primary',
    duree: 'Selon la complexité',
    prix: 'Sur devis',
    ctaHref: '/dossiers/create?rubrique=constitution_societe',
    ctaLabel: 'Créer une demande',
    points: [
      'Analyse du projet et de la forme juridique adaptée',
      'Préparation des pièces et des actes constitutifs',
      'Parcours dédié : Sénégal ou France',
      'Mise en relation avec un avocat en droit des affaires si nécessaire',
    ],
  },
];
