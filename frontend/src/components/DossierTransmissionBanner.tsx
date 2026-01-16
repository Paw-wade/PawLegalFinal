'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { dossiersAPI } from '@/lib/api';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface DossierTransmissionBannerProps {
  userRole: 'admin' | 'client' | 'partenaire';
  userId?: string;
}

interface TransmissionBannerItem {
  id: string;
  dossierId: string;
  dossierNumero: string;
  dossierTitre: string;
  message: string;
  link: string;
}

const STORAGE_KEY = 'dossierTransmissionBannerVisible';
const STORAGE_EVENT = 'dossierTransmissionBannerVisibilityChange';

export function DossierTransmissionBanner({ userRole, userId }: DossierTransmissionBannerProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [bannerItems, setBannerItems] = useState<TransmissionBannerItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isVisible, setIsVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  });
  const [processingDossiers, setProcessingDossiers] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Écouter les changements de localStorage
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue !== null) {
        setIsVisible(e.newValue === 'true');
      }
    };

    const handleCustomStorageChange = () => {
      const stored = localStorage.getItem(STORAGE_KEY);
      setIsVisible(stored === null ? true : stored === 'true');
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener(STORAGE_EVENT, handleCustomStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(STORAGE_EVENT, handleCustomStorageChange);
    };
  }, []);

  useEffect(() => {
    if (userRole === 'partenaire' && userId) {
      loadTransmissionNotifications();
      // Recharger toutes les 30 secondes
      const interval = setInterval(loadTransmissionNotifications, 30000);
      return () => clearInterval(interval);
    } else {
      setIsLoading(false);
    }
  }, [userRole, userId, session]);

  const toggleVisibility = (newValue?: boolean) => {
    const valueToSet = newValue !== undefined ? newValue : !isVisible;
    setIsVisible(valueToSet);
    
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, valueToSet.toString());
      window.dispatchEvent(new Event(STORAGE_EVENT));
    }
  };

  const loadTransmissionNotifications = async () => {
    if (userRole !== 'partenaire' || !userId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await dossiersAPI.getMyDossiers();
      
      if (response.data.success) {
        const dossiers = response.data.dossiers || [];
        const userIdStr = userId.toString();
        
        // Filtrer les dossiers transmis avec statut "pending"
        const pendingTransmissions = dossiers.filter((dossier: any) => {
          if (!dossier.transmittedTo || !Array.isArray(dossier.transmittedTo)) {
            return false;
          }
          
          return dossier.transmittedTo.some((trans: any) => {
            const transPartenaireId = trans.partenaire?._id?.toString() || trans.partenaire?.toString();
            return transPartenaireId === userIdStr && trans.status === 'pending';
          });
        });

        const items: TransmissionBannerItem[] = pendingTransmissions.slice(0, 5).map((dossier: any) => {
          const dossierId = dossier._id?.toString() || dossier.id;
          const dossierNumero = dossier.numero || dossier.numeroDossier || 'Sans numéro';
          const dossierTitre = dossier.titre || 'Sans titre';
          
          return {
            id: `transmission-${dossierId}`,
            dossierId: dossierId || '',
            dossierNumero,
            dossierTitre,
            message: `Nouveau dossier transmis : ${dossierNumero} - ${dossierTitre}`,
            link: `/partenaire/dossiers/${dossierId}`
          };
        });

        setBannerItems(items);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des transmissions de dossiers:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccept = async (dossierId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (processingDossiers.has(dossierId)) return;
    
    setProcessingDossiers(prev => new Set(prev).add(dossierId));
    
    try {
      const response = await dossiersAPI.acknowledgeDossier(dossierId, 'accept');
      if (response.data.success) {
        // Recharger les notifications
        await loadTransmissionNotifications();
        // Rediriger vers le dossier
        router.push(`/partenaire/dossiers/${dossierId}`);
      } else {
        alert(response.data.message || 'Erreur lors de l\'acceptation du dossier');
      }
    } catch (error: any) {
      console.error('Erreur lors de l\'acceptation du dossier:', error);
      alert(error.response?.data?.message || 'Erreur lors de l\'acceptation du dossier');
    } finally {
      setProcessingDossiers(prev => {
        const newSet = new Set(prev);
        newSet.delete(dossierId);
        return newSet;
      });
    }
  };

  const handleRefuse = async (dossierId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (processingDossiers.has(dossierId)) return;
    
    const confirmed = window.confirm('Êtes-vous sûr de vouloir refuser ce dossier ?');
    if (!confirmed) return;
    
    setProcessingDossiers(prev => new Set(prev).add(dossierId));
    
    try {
      const response = await dossiersAPI.acknowledgeDossier(dossierId, 'refuse');
      if (response.data.success) {
        // Recharger les notifications
        await loadTransmissionNotifications();
      } else {
        alert(response.data.message || 'Erreur lors du refus du dossier');
      }
    } catch (error: any) {
      console.error('Erreur lors du refus du dossier:', error);
      alert(error.response?.data?.message || 'Erreur lors du refus du dossier');
    } finally {
      setProcessingDossiers(prev => {
        const newSet = new Set(prev);
        newSet.delete(dossierId);
        return newSet;
      });
    }
  };

  // Ne rien afficher si on charge, si ce n'est pas un partenaire, ou s'il n'y a pas d'éléments
  if (isLoading || userRole !== 'partenaire' || bannerItems.length === 0) {
    return null;
  }

  // Si la bannière est fermée, afficher une petite barre pour la rouvrir
  if (!isVisible) {
    return (
      <div className="w-full bg-gradient-to-r from-orange-500/5 via-orange-500/3 to-orange-500/5 border-b border-orange-500/10 shadow-sm">
        <div className="flex items-center justify-center py-2">
          <button
            onClick={() => toggleVisibility(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            aria-label="Afficher la bannière de notifications de transmissions"
          >
            <span>📋</span>
            <span>Nouveaux dossiers transmis ({bannerItems.length})</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-gradient-to-r from-orange-500/10 via-orange-500/5 to-orange-500/10 border-b border-orange-500/20 shadow-sm relative">
      <button
        onClick={() => toggleVisibility(false)}
        className="absolute top-2 right-2 z-10 w-6 h-6 flex items-center justify-center rounded-full bg-white/80 hover:bg-white text-muted-foreground hover:text-foreground transition-all shadow-sm"
        aria-label="Fermer la bannière de notifications de transmissions"
        title="Fermer"
      >
        <span className="text-sm">×</span>
      </button>
      <div className="overflow-hidden pr-10">
        <div className="flex animate-scroll-banner whitespace-nowrap">
          {bannerItems.map((item) => {
            const isProcessing = processingDossiers.has(item.dossierId);
            return (
              <div
                key={item.id}
                className="inline-flex items-center gap-3 px-6 py-3 mx-2 rounded-lg bg-white/50 border border-orange-200 hover:bg-orange-50 transition-all"
              >
                <span className="text-lg">📋</span>
                <span className="text-sm font-medium text-foreground">
                  {item.message}
                </span>
                <div className="flex items-center gap-2">
                  <Link
                    href={item.link}
                    className="px-3 py-1 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                    onClick={(e) => {
                      if (isProcessing) {
                        e.preventDefault();
                      }
                    }}
                  >
                    {isProcessing ? '...' : 'Ouvrir'}
                  </Link>
                  <button
                    onClick={(e) => handleAccept(item.dossierId, e)}
                    disabled={isProcessing}
                    className="px-3 py-1 text-xs font-medium bg-green-500 text-white rounded hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? '...' : '✓ Accepter'}
                  </button>
                  <button
                    onClick={(e) => handleRefuse(item.dossierId, e)}
                    disabled={isProcessing}
                    className="px-3 py-1 text-xs font-medium bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? '...' : '✗ Refuser'}
                  </button>
                </div>
              </div>
            );
          })}
          {/* Dupliquer pour animation continue */}
          {bannerItems.map((item) => {
            const isProcessing = processingDossiers.has(item.dossierId);
            return (
              <div
                key={`${item.id}-dup`}
                className="inline-flex items-center gap-3 px-6 py-3 mx-2 rounded-lg bg-white/50 border border-orange-200 hover:bg-orange-50 transition-all"
              >
                <span className="text-lg">📋</span>
                <span className="text-sm font-medium text-foreground">
                  {item.message}
                </span>
                <div className="flex items-center gap-2">
                  <Link
                    href={item.link}
                    className="px-3 py-1 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                    onClick={(e) => {
                      if (isProcessing) {
                        e.preventDefault();
                      }
                    }}
                  >
                    {isProcessing ? '...' : 'Ouvrir'}
                  </Link>
                  <button
                    onClick={(e) => handleAccept(item.dossierId, e)}
                    disabled={isProcessing}
                    className="px-3 py-1 text-xs font-medium bg-green-500 text-white rounded hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? '...' : '✓ Accepter'}
                  </button>
                  <button
                    onClick={(e) => handleRefuse(item.dossierId, e)}
                    disabled={isProcessing}
                    className="px-3 py-1 text-xs font-medium bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? '...' : '✗ Refuser'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <style jsx>{`
        @keyframes scroll-banner {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .animate-scroll-banner {
          animation: scroll-banner 40s linear infinite;
        }
        .animate-scroll-banner:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}
