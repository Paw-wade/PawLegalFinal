'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { signOut } from 'next-auth/react';
import { forumAPI } from '@/lib/api';
import { 
  LayoutDashboard,
  FolderOpen, 
  MessageSquare, 
  FileText, 
  Bell, 
  Calculator,
  Calendar,
  User,
  Scale,
} from 'lucide-react';

const menuItems = [
  { href: '/partenaire', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/partenaire/dossiers', label: 'Dossiers transmis', icon: FolderOpen },
  { href: '/partenaire/messages', label: 'Messages', icon: MessageSquare },
  { href: '/partenaire/documents', label: 'Documents', icon: FileText },
  { href: '/partenaire/notifications', label: 'Notifications', icon: Bell },
  { href: '/calculateur', label: 'Calculateur', icon: Calculator },
  { href: '/partenaire/rendez-vous', label: 'Rendez-vous', icon: Calendar },
  { href: '/forum', label: 'Forum', icon: MessageSquare },
  { href: '/lexia', label: 'Ada AI', icon: Scale },
  { href: '/partenaire/compte', label: 'Mon compte', icon: User },
];

interface PartenaireSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function PartenaireSidebar({ isOpen = true, onClose }: PartenaireSidebarProps) {
  const pathname = usePathname();
  const [forumUnreadCount, setForumUnreadCount] = useState<number>(0);

  const loadForumCount = useCallback(async () => {
    try {
      const res = await forumAPI.getUnreadThreadsCount();
      if (res.data?.success && typeof res.data.count === 'number') {
        setForumUnreadCount(res.data.count);
      }
    } catch (err) {
      console.error('Erreur lors du chargement du nombre de nouvelles discussions forum (partenaire):', err);
    }
  }, []);

  useEffect(() => {
    loadForumCount();
  }, [loadForumCount, pathname]);

  useEffect(() => {
    const onForumUnreadUpdated = () => loadForumCount();
    if (typeof window !== 'undefined') {
      window.addEventListener('forumUnreadUpdated', onForumUnreadUpdated);
      return () => window.removeEventListener('forumUnreadUpdated', onForumUnreadUpdated);
    }
  }, [loadForumCount]);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`
          w-64 bg-white border-r border-gray-200 flex flex-col
          fixed top-0 left-0 bottom-0 z-50 lg:bottom-auto lg:h-screen lg:min-h-screen
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
      >
        {/* Bande logo alignée avec le header (même hauteur h-16) */}
        <div className="h-16 shrink-0 flex items-center justify-between px-4 border-b border-gray-200">
          <div className="flex items-center min-w-0">
            <Link
              href="/"
              className="font-bold text-orange-500 hover:text-orange-600 transition-colors text-lg tracking-tight"
            >
              Ada Papers
            </Link>
            <span className="hidden md:inline ml-2 text-[10px] text-gray-500">Espace partenaire</span>
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
        <nav className="p-4 space-y-2 flex-1 min-h-0 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== '/partenaire' && pathname?.startsWith(item.href + '/'));
          
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                if (typeof window !== 'undefined' && window.innerWidth < 1024 && onClose) onClose();
              }}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-primary text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="flex items-center gap-1">
                {item.label}
                {item.href === '/forum' && forumUnreadCount > 0 && (
                  <span className="ml-1 text-[11px] font-semibold bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full">
                    {forumUnreadCount > 99 ? '99+' : forumUnreadCount}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
        </nav>
        {/* Bouton de déconnexion — bandeau bas du tiroir mobile */}
        <div className="shrink-0 border-t border-gray-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] lg:shadow-none">
          <button
            type="button"
            onClick={async () => {
              if (typeof window !== 'undefined') {
                localStorage.removeItem('token');
                sessionStorage.removeItem('token');
                try {
                  // Déconnexion NextAuth (sinon la session peut rester active)
                  await signOut({ redirect: false });
                } catch {
                  // ignore - redirection forcée juste après
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

