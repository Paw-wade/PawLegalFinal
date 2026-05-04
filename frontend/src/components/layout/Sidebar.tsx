'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { signOut } from 'next-auth/react';
import { forumAPI, documentsAPI, dossiersAPI } from '@/lib/api';
import { normalizeMontantTarificationFixe } from '@/lib/montantTarification';
import {
  LayoutDashboard,
  FolderOpen,
  FileText,
  Calendar,
  MessageSquare,
  Bell,
  Calculator,
  User,
  Scale,
} from 'lucide-react';

/** Icône cercle + € (équivalent visuel à CircleDollarSign pour la tarification en euros) */
function CircleEuroIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <text
        x="12"
        y="16.5"
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        fontSize="12"
        fontWeight="600"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
      >
        €
      </text>
    </svg>
  );
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MenuItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
}

const clientMenuItems: MenuItem[] = [
  { href: '/client', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/client/dossiers', label: 'Mes dossiers', icon: FolderOpen },
  { href: '/client/tarification', label: 'Tarification', icon: CircleEuroIcon },
  { href: '/client/documents', label: 'Documents', icon: FileText },
  { href: '/client/rendez-vous', label: 'Rendez-vous', icon: Calendar },
  { href: '/client/messages', label: 'Messages', icon: MessageSquare },
  { href: '/client/notifications', label: 'Notifications', icon: Bell },
  { href: '/forum', label: 'Forum', icon: MessageSquare },
  { href: '/lexia', label: 'Ada AI', icon: Scale },
  { href: '/calculateur', label: 'Calculateur', icon: Calculator },
  { href: '/client/compte', label: 'Mon compte', icon: User },
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [forumUnreadCount, setForumUnreadCount] = useState<number>(0);
  const [forumRepliesCount, setForumRepliesCount] = useState<number>(0);
  const [documentsPendingCount, setDocumentsPendingCount] = useState<number>(0);
  const [tarificationPendingCount, setTarificationPendingCount] = useState<number>(0);

  const isActive = (href: string) => {
    if (href === '/client' || href === '/admin') {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  const loadForumCount = useCallback(async () => {
    try {
      const res = await forumAPI.getUnreadThreadsCount();
      if (res.data?.success && typeof res.data.count === 'number') {
        setForumUnreadCount(res.data.count);
      }
      if (typeof res.data?.newRepliesCount === 'number') {
        setForumRepliesCount(res.data.newRepliesCount);
      }
    } catch (err) {
      console.error('Erreur lors du chargement du nombre de nouvelles discussions forum:', err);
    }
  }, []);

  useEffect(() => {
    loadForumCount();
  }, [loadForumCount, pathname]);

  useEffect(() => {
    const onForumUnreadUpdated = () => {
      loadForumCount();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('forumUnreadUpdated', onForumUnreadUpdated);
      return () => window.removeEventListener('forumUnreadUpdated', onForumUnreadUpdated);
    }
  }, [loadForumCount]);

  const refreshDocumentsCount = async () => {
    try {
      const res = await documentsAPI.getMyDocuments();
      const docs = res.data?.documents;
      if (res.data?.success && Array.isArray(docs)) {
        setDocumentsPendingCount(docs.length);
      } else if (res.data?.success && typeof res.data.count === 'number') {
        setDocumentsPendingCount(res.data.count);
      } else {
        setDocumentsPendingCount(0);
      }
    } catch (err) {
      console.error('Erreur lors du chargement du nombre de documents existants:', err);
      setDocumentsPendingCount(0);
    }
  };

  const refreshTarificationCount = async () => {
    try {
      const res = await dossiersAPI.getMyDossiers();
      const list = res.data?.dossiers || res.data?.data || [];
      if (!Array.isArray(list)) {
        setTarificationPendingCount(0);
        return;
      }

      const pending = list.filter((dossier: any) => {
        if (!dossier || dossier.fraisExoneres) return false;
        const fixedAmount = normalizeMontantTarificationFixe(dossier?.montantTarificationFixe);
        // Badge si un paiement est attendu:
        // - montant fixe demandé par l'administration
        // - ou formule non encore choisie.
        return fixedAmount > 0 || !dossier?.formuleTarifaire;
      }).length;

      setTarificationPendingCount(pending);
    } catch (err) {
      console.error('Erreur lors du chargement du badge tarification:', err);
      setTarificationPendingCount(0);
    }
  };

  useEffect(() => {
    refreshDocumentsCount();
    refreshTarificationCount();
  }, []);

  useEffect(() => {
    refreshTarificationCount();
  }, [pathname]);

  useEffect(() => {
    const handler = () => {
      refreshDocumentsCount();
    };
    window.addEventListener('documentsUpdated', handler);
    return () => window.removeEventListener('documentsUpdated', handler);
    // refreshDocumentsCount est stable ici car il ne dépend pas de props/state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = () => refreshTarificationCount();
    window.addEventListener('tarificationUpdated', handler);
    return () => window.removeEventListener('tarificationUpdated', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 top-14 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`
          w-[min(16rem,85vw)] max-w-64 bg-white border-r border-gray-200 flex flex-col
          fixed top-0 left-0 z-50 bottom-0 lg:bottom-auto lg:h-screen lg:min-h-screen
          pt-[env(safe-area-inset-top,0)] lg:pt-0
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
      >
        <div className="h-14 lg:h-16 shrink-0 flex items-center justify-between px-4 border-b border-gray-200">
          <div className="flex items-center min-w-0">
            <Link
              href="/"
              className="font-bold text-orange-500 hover:text-orange-600 transition-colors text-base lg:text-lg tracking-tight"
            >
              Ada Papers
            </Link>
            <span className="hidden md:inline ml-2 text-[10px] text-gray-500">Espace client</span>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden px-3 py-2 ml-2 min-h-[36px] flex items-center justify-center rounded-full border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
              aria-label="Fermer le menu"
            >
              Fermer
            </button>
          )}
        </div>

        {/* Navigation — scroll seul ; déconnexion reste fixée en bas du tiroir mobile */}
        <nav className="p-3 sm:p-4 space-y-1 flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {clientMenuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (typeof window !== 'undefined' && window.innerWidth < 1024 && onClose) onClose();
                }}
                className={`flex items-center gap-3 px-4 py-3 min-h-[48px] rounded-xl transition-colors ${
                  active ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100 active:bg-gray-200'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="flex items-center gap-1">
                  {item.label}
                  {item.href === '/client/documents' && documentsPendingCount > 0 && (
                    <span className="ml-1 text-[11px] font-semibold bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full">
                      {documentsPendingCount > 99 ? '99+' : documentsPendingCount}
                    </span>
                  )}
                  {item.href === '/client/tarification' && tarificationPendingCount > 0 && (
                    <span className="ml-1 text-[11px] font-semibold bg-red-100 text-red-800 px-2 py-0.5 rounded-full">
                      {tarificationPendingCount > 99 ? '99+' : tarificationPendingCount}
                    </span>
                  )}
                  {item.href === '/forum' && forumUnreadCount > 0 && (
                    <span className="ml-1 text-[11px] font-semibold bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full">
                      {forumUnreadCount > 99 ? '99+' : forumUnreadCount}
                    </span>
                  )}
                  {item.href === '/forum' && forumRepliesCount > 0 && (
                    <span className="ml-1 text-[11px] font-semibold bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                      {forumRepliesCount > 99 ? '99+' : forumRepliesCount}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </nav>
        {/* Bouton de déconnexion — toujours visible en bas du menu (tiroir mobile = bandeau fixe) */}
        <div className="shrink-0 border-t border-gray-200 bg-white p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] lg:shadow-none">
          <button
            type="button"
            onClick={async () => {
              // Nettoyer les tokens et recharger vers la home
              if (typeof window !== 'undefined') {
                localStorage.removeItem('token');
                sessionStorage.removeItem('token');
                try {
                  // Déconnexion NextAuth (important : juste vider les tokens ne suffit pas)
                  await signOut({ redirect: false });
                } catch {
                  // Si signOut échoue, on force quand même la redirection
                }
                window.location.href = '/';
              }
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors min-h-[44px]"
          >
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>
    </>
  );
}

