'use client';

import React from 'react';
import { Scale, HandshakeIcon, LayoutDashboard, FileCheck } from 'lucide-react';

export type ServiceConfig = {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
};

const iconClass = 'w-8 h-8';

export const servicesConfig: ServiceConfig[] = [
  {
    title: 'Consultation juridique',
    description:
      'Mise en relation avec un avocat spécialisé pour évaluer votre situation et identifier les premiers leviers d’action.',
    icon: <Scale className={iconClass} />,
    color: 'primary',
  },
  {
    title: 'Accompagnement complet',
    description:
      'Accompagnement personnalisé tout au long de vos démarches administratives, de la première demande au suivi des décisions.',
    icon: <HandshakeIcon className={iconClass} />,
    color: 'blue',
  },
  {
    title: 'Portail titre de séjour',
    description:
      'Plateforme complète de suivi et de gestion de votre titre de séjour, pour anticiper les échéances et sécuriser vos démarches.',
    icon: <LayoutDashboard className={iconClass} />,
    color: 'green',
  },
  {
    title: 'Assistant démarches',
    description:
      'Un accompagnement pas-à-pas pour préparer vos demandes de titres de séjour et de visas, avec une vision claire de chaque étape.',
    icon: <FileCheck className={iconClass} />,
    color: 'purple',
  },
];
