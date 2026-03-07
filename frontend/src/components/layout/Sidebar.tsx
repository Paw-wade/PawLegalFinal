'use client';

import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';

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
  // Déterminer le rôle
  const userRole = (session?.user as any)?.role || 'client';
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';
  
  // Sélectionner les items de menu selon le rôle
  const menuItems = isAdmin ? adminMenuItems : clientMenuItems;

  // Filtrer les items selon les permissions
  const filteredMenuItems = menuItems.filter(item => {
    if (!item.roles) return true;
    return item.roles.includes(effectiveRole);
  });

  const isActive = (href: string) => {
    if (href === '/client' || href === '/admin') {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Overlay pour mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full bg-white border-r border-gray-200 z-50
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:static lg:z-auto
          w-64 flex flex-col
        `}
      >
        {/* Header de la sidebar */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl font-bold text-primary">ADA Pappers</span>
          </Link>
          <button
            onClick={onClose}
            className="lg:hidden p-2 hover:bg-gray-100 rounded-md transition-colors"
            aria-label="Fermer le menu"
          >
            <span className="text-2xl">×</span>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4">
          <ul className="space-y-1">
            {filteredMenuItems.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => {
                      // Fermer le menu sur mobile après clic
                      if (window.innerWidth < 1024) {
                        onClose();
                      }
                    }}
                    className={`
                      flex items-center gap-3 px-4 py-3 rounded-lg
                      transition-all duration-200
                      ${
                        active
                          ? 'bg-primary text-white shadow-md'
                          : 'text-gray-700 hover:bg-gray-100 hover:text-primary'
                      }
                    `}
                  >
                    <span className="text-xl">{item.icon}</span>
                    <span className="font-medium">{item.label}</span>
                    {active && (
                      <span className="ml-auto w-2 h-2 bg-white rounded-full"></span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer de la sidebar */}
        <div className="p-4 border-t border-gray-200">
          <div className="text-xs text-muted-foreground text-center">
            {isAdmin ? (
              <p className="font-semibold text-gray-600">
                Mode Administrateur
              </p>
            ) : (
              <p className="font-semibold text-gray-600">
                Mode Client
              </p>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

