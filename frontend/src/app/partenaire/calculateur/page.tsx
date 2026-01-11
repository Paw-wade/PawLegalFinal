'use client';

import { Calculator, ExternalLink, Info } from 'lucide-react';
import Link from 'next/link';

export default function PartenaireCalculateurPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Calculateur de titres de séjour</h1>
      
      <div className="bg-white rounded-lg shadow p-8 mb-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="bg-blue-100 p-3 rounded-lg">
            <Info className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold mb-2">Outil de calcul pour vos clients</h2>
            <p className="text-gray-600 mb-4">
              Utilisez notre calculateur pour estimer les délais, les coûts et les conditions d'éligibilité 
              pour différents types de titres de séjour. Cet outil vous aide à conseiller vos clients de manière précise.
            </p>
            <Link
              href="/calculateur"
              target="_blank"
              className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-lg hover:bg-primary/90 transition-colors font-semibold"
            >
              <Calculator className="w-5 h-5" />
              Accéder au calculateur
              <ExternalLink className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-3">Fonctionnalités</h3>
          <ul className="space-y-2 text-gray-600">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>Calcul des délais de traitement par type de titre</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>Estimation des coûts administratifs</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>Vérification des conditions d'éligibilité</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>Guide des documents requis</span>
            </li>
          </ul>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-3">Types de titres supportés</h3>
          <ul className="space-y-2 text-gray-600">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>Étudiant</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>Salarié</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>Vie privée et familiale</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>Passeport Talent</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>Et bien plus...</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}


