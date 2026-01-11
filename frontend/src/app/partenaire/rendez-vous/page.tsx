'use client';

import { useEffect, useState } from 'react';
import { appointmentsAPI } from '@/lib/api';
import { Calendar } from 'lucide-react';

export default function PartenaireRendezVousPage() {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Fonction pour convertir en string de manière sécurisée
  const safeString = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return String(value);
    // Si c'est un objet, ne pas le convertir, retourner une chaîne vide
    if (typeof value === 'object') {
      console.warn('Tentative de convertir un objet en string:', value);
      return '';
    }
    return '';
  };
  
  useEffect(() => {
    loadAppointments();
  }, []);
  
  const loadAppointments = async () => {
    try {
      setLoading(true);
      const response = await appointmentsAPI.getMyAppointments();
      if (response.data.success) {
        setAppointments(response.data.data || []);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des rendez-vous:', error);
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Rendez-vous</h1>
      
      {appointments.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">Aucun rendez-vous pour le moment</p>
        </div>
      ) : (
        <div className="space-y-4">
          {appointments.map((apt: any) => {
            const aptId = safeString(apt._id) || safeString(apt.id) || '';
            const aptMotif = safeString(apt.motif) || 'Rendez-vous';
            const aptHeure = safeString(apt.heure);
            const aptDescription = safeString(apt.description);
            const aptStatut = safeString(apt.statut) || 'En attente';
            const aptDate = apt.date ? new Date(apt.date).toLocaleDateString('fr-FR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            }) : '';
            
            return (
              <div
                key={aptId || `apt-${Math.random()}`}
                className="bg-white rounded-lg shadow p-6"
              >
                <h3 className="font-semibold text-lg mb-2">{aptMotif}</h3>
                {aptDate && (
                  <p className="text-gray-600">
                    {aptDate}{aptHeure ? ` à ${aptHeure}` : ''}
                  </p>
                )}
                {aptDescription && (
                  <p className="text-gray-700 mt-2">{aptDescription}</p>
                )}
                <span className={`inline-block mt-2 px-3 py-1 rounded-full text-sm ${
                  aptStatut === 'confirme' ? 'bg-green-100 text-green-800' :
                  aptStatut === 'annule' ? 'bg-red-100 text-red-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {aptStatut}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

