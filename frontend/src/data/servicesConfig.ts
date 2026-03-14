'use client';

import React from 'react';
import { Scale, HeartHandshake, LayoutDashboard, FileCheck } from 'lucide-react';

export type ServiceConfig = {
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
};

export const servicesConfig: ServiceConfig[] = [
  {
    title: 'Consultation juridique',
    description:
      'Mise en relation avec un avocat spécialisé pour évaluer votre situation et identifier les premiers leviers d’action.',
    icon: Scale,
    color: 'primary',
  },
  {
    title: 'Accompagnement complet',
    description:
      'Accompagnement personnalisé tout au long de vos démarches administratives, de la première demande au suivi des décisions.',
    icon: HeartHandshake,
    color: 'blue',
  },
  {
    title: 'Portail titre de séjour',
    description:
      'Plateforme complète de suivi et de gestion de votre titre de séjour.',
    icon: LayoutDashboard,
    color: 'green',
  },
  {
    title: 'Assistant démarches',
    description:
      'Un accompagnement pas-à-pas pour préparer vos demandes.',
    icon: FileCheck,
    color: 'purple',
  },
];
