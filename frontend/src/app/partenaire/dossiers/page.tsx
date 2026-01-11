'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { dossiersAPI } from '@/lib/api';
import Link from 'next/link';
import { FolderOpen, Clock, CheckCircle, XCircle } from 'lucide-react';

export default function PartenaireDossiersPage() {
  const { data: session } = useSession();
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'accepted' | 'refused'>('all');
  
  useEffect(() => {
    loadDossiers();
  }, []);
  
  const loadDossiers = async () => {
    try {
      setLoading(true);
      const response = await dossiersAPI.getMyDossiers();
      if (response.data.success) {
        const dossiers = response.data.dossiers || [];
        // S'assurer que tous les dossiers sont des objets valides
        const validDossiers = Array.isArray(dossiers) ? dossiers.filter((d: any) => d && typeof d === 'object') : [];
        setDossiers(validDossiers);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des dossiers:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const getDossierStatus = (dossier: any) => {
    const userId = (session?.user as any)?._id || (session?.user as any)?.id;
    const transmission = dossier.transmittedTo?.find((t: any) => 
      (t.partenaire?._id?.toString() || t.partenaire?.toString()) === userId
    );
    return transmission?.status || 'pending';
  };
  
  const getStatusLabel = (status: string) => {
    const labels: { [key: string]: string } = {
      pending: 'En attente',
      accepted: 'Accepté',
      refused: 'Refusé'
    };
    return labels[status] || 'En attente';
  };
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'refused':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-yellow-500" />;
    }
  };
  
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
  
  const filteredDossiers = dossiers.filter(d => {
    if (filter === 'all') return true;
    return getDossierStatus(d) === filter;
  });
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Dossiers transmis</h1>
      </div>
      
      {/* Filtres */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg ${filter === 'all' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700'}`}
        >
          Tous ({dossiers.length})
        </button>
        <button
          onClick={() => setFilter('pending')}
          className={`px-4 py-2 rounded-lg ${filter === 'pending' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700'}`}
        >
          En attente ({dossiers.filter(d => getDossierStatus(d) === 'pending').length})
        </button>
        <button
          onClick={() => setFilter('accepted')}
          className={`px-4 py-2 rounded-lg ${filter === 'accepted' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700'}`}
        >
          Acceptés ({dossiers.filter(d => getDossierStatus(d) === 'accepted').length})
        </button>
        <button
          onClick={() => setFilter('refused')}
          className={`px-4 py-2 rounded-lg ${filter === 'refused' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700'}`}
        >
          Refusés ({dossiers.filter(d => getDossierStatus(d) === 'refused').length})
        </button>
      </div>
      
      {/* Liste des dossiers */}
      {filteredDossiers.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <FolderOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">
            {filter === 'all' 
              ? 'Aucun dossier transmis pour le moment'
              : `Aucun dossier avec le statut "${getStatusLabel(filter)}"`
            }
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredDossiers.map((dossier: any) => {
            const status = getDossierStatus(dossier);
            const transmission = dossier.transmittedTo?.find((t: any) => 
              (t.partenaire?._id?.toString() || t.partenaire?.toString()) === 
              ((session?.user as any)?._id || (session?.user as any)?.id)
            );
            const dossierId = safeString(dossier._id) || safeString(dossier.id) || '';
            const dossierHref = dossierId ? `/partenaire/dossiers/${dossierId}` : '#';
            
            return (
              <Link
                key={dossierId || `dossier-${Math.random()}`}
                href={dossierHref}
                className="block bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold">
                        {safeString(dossier.titre) || safeString(dossier.numero) || 'Sans titre'}
                      </h3>
                      {getStatusIcon(status)}
                    </div>
                    {safeString(dossier.numero) && (
                      <p className="text-sm text-gray-600 mb-2">N° {safeString(dossier.numero)}</p>
                    )}
                    {safeString(dossier.description) && (
                      <p className="text-gray-700 mb-2 line-clamp-2">
                        {safeString(dossier.description)}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                      {dossier.user && typeof dossier.user === 'object' && (
                        <p className="text-gray-500">
                          <span className="font-medium">Client:</span> {safeString(dossier.user.firstName)} {safeString(dossier.user.lastName)}
                          {safeString(dossier.user.email) && ` (${safeString(dossier.user.email)})`}
                        </p>
                      )}
                      {dossier.statut && (
                        <p className="text-gray-500">
                          <span className="font-medium">Statut:</span> {safeString(dossier.statut)}
                        </p>
                      )}
                      {dossier.documents && Array.isArray(dossier.documents) && (
                        <p className="text-gray-500">
                          <span className="font-medium">Documents:</span> {dossier.documents.length}
                        </p>
                      )}
                      {transmission?.transmittedAt && (
                        <p className="text-gray-500">
                          <span className="font-medium">Transmis le:</span> {new Date(transmission.transmittedAt).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="ml-4">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      status === 'accepted' ? 'bg-green-100 text-green-800' :
                      status === 'refused' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {getStatusLabel(status)}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

