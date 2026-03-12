'use client';

import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { forumAPI } from '@/lib/api';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MenuItem {
  href: string;
  label: string;
  icon: string;
  roles?: string[];
}

const clientMenuItems: MenuItem[] = [
  { href: '/client', label: 'Accueil', icon: '🏠' },
  { href: '/client/dossiers', label: 'Mes Dossiers', icon: '📁' },
  { href: '/client/documents', label: 'Mes Documents', icon: '📄' },
  { href: '/client/rendez-vous', label: 'Mes Rendez-vous', icon: '📅' },
  { href: '/client/messages', label: 'Messagerie', icon: '💬' },
  { href: '/client/notifications', label: 'Notifications', icon: '🔔' },
  { href: '/forum', label: 'Forum', icon: '🗣️' },
  { href: '/calculateur', label: 'Calculateur', icon: '🧮' },
  { href: '/client/compte', label: 'Mon Compte', icon: '👤' },
];

const adminMenuItems: MenuItem[] = [
  { href: '/admin', label: 'Accueil', icon: '🏠' },
  { href: '/admin/utilisateurs', label: 'Utilisateurs', icon: '👥' },
  { href: '/admin/dossiers', label: 'Mes Dossiers', icon: '📁' },
  { href: '/admin/documents', label: 'Documents', icon: '📄' },
  { href: '/admin/rendez-vous', label: 'Rendez-vous', icon: '📅' },
  { href: '/admin/creneaux', label: 'Créneaux', icon: '⏰' },
  { href: '/admin/messages', label: 'Messagerie', icon: '💬' },
  { href: '/admin/notifications', label: 'Notifications', icon: '🔔' },
  { href: '/admin/temoignages', label: 'Témoignages', icon: '⭐' },
  { href: '/admin/logs', label: 'Logs', icon: '📋' },
  { href: '/forum', label: 'Forum', icon: '🗣️' },
  { href: '/admin/compte', label: 'Mon Compte', icon: '👤' },
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [forumUnreadCount, setForumUnreadCount] = useState<number>(0);
  // Déterminer le rôle
  const userRole = (session?.user as any)?.role || 'client';
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';
  
  // Sélectionner les items de menu selon le rôle
  const menuItems = isAdmin ? adminMenuItems : clientMenuItems;

  // Filtrer les items selon les permissions
  const filteredMenuItems = menuItems.filter(item => {
    if (!item.roles) return true;
    return item.roles.includes(userRole);
  });

  const isActive = (href: string) => {
    if (href === '/client' || href === '/admin') {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  useEffect(() => {
    // Charger une seule fois le nombre approximatif de nouvelles discussions forum
    const loadForumCount = async () => {
      try {
        const res = await forumAPI.getUnreadThreadsCount();
        if (res.data?.success && typeof res.data.count === 'number') {
          setForumUnreadCount(res.data.count);
        }
      } catch (err) {
        console.error('Erreur lors du chargement du nombre de nouvelles discussions forum:', err);
      }
    };
    loadForumCount();
  }, []);

  return (
    <>
      {/* Overlay pour mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar — même design que partenaire */}
      <aside
        className={`
          w-64 bg-white border-r border-gray-200 h-screen flex flex-col
          fixed top-0 left-0 z-50
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:static lg:z-auto
        `}
      >
        {/* Bande logo alignée avec le header (même hauteur h-16) */}
        <div className="h-16 shrink-0 flex items-center justify-between px-4 border-b border-gray-200">
          <div className="flex items-center min-w-0">
            <Link
              href="/"
              className="font-bold text-orange-500 hover:text-orange-600 transition-colors text-lg tracking-tight"
            >
              ADA Pappers
            </Link>
            <span className="ml-2 text-[10px] text-gray-500 whitespace-nowrap">Espace client</span>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-2 hover:bg-gray-100 rounded-md transition-colors shrink-0"
            aria-label="Fermer le menu"
          >
            <span className="text-2xl">×</span>
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-2 flex-1 overflow-y-auto">
          {filteredMenuItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (window.innerWidth < 1024) onClose();
                }}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  active ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
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
      </aside>
    </>
  );
}

