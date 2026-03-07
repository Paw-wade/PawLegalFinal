'use client';

import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';

interface AdminSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

interface MenuItem {
  href: string;
  label: string;
  icon: string;
  roles?: string[];
  badge?: string;
}

const adminMenuItems: MenuItem[] = [
  { href: '/admin', label: 'Tableau de bord', icon: '📊' },
  { href: '/admin/utilisateurs', label: 'Utilisateurs', icon: '👥' },
  { href: '/admin/dossiers', label: 'Dossiers', icon: '📁' },
  { href: '/admin/taches', label: 'Tâches', icon: '✅' },
  { href: '/admin/rendez-vous', label: 'Rendez-vous', icon: '📅' },
  { href: '/admin/creneaux', label: 'Créneaux', icon: '⏰' },
  { href: '/admin/messages', label: 'Messages', icon: '💬' },
  { href: '/admin/documents', label: 'Documents', icon: '📄' },
  { href: '/admin/temoignages', label: 'Témoignages', icon: '⭐' },
  { href: '/admin/notifications', label: 'Notifications', icon: '🔔' },
  { href: '/admin/sms', label: 'SMS', icon: '📱' },
  { href: '/admin/cms', label: 'CMS', icon: '✏️' },
  { href: '/admin/logs', label: 'Logs', icon: '📋', roles: ['superadmin'] },
  { href: '/admin/corbeille', label: 'Corbeille', icon: '🗑️' },
  { href: '/forum', label: 'Forum', icon: '🗣️' },
  { href: '/admin/compte', label: 'Mon Compte', icon: '👤' },
];

export function AdminSidebar({ isOpen = true, onClose }: AdminSidebarProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const userRole = (session?.user as any)?.role || 'client';
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';

  // Filtrer les items selon les permissions
  const filteredMenuItems = adminMenuItems.filter(item => {
    if (!item.roles) return true;
    return item.roles.includes(userRole);
  });

  const isActive = (href: string) => {
    if (href === '/admin') {
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
          fixed top-0 left-0 h-full bg-gradient-to-b from-white to-gray-50 border-r border-gray-200 z-50
          transform transition-all duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
          ${isCollapsed ? 'w-20' : 'w-64'}
          flex flex-col shadow-lg
        `}
      >
        {/* Header de la sidebar */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white">
          {!isCollapsed && (
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center shadow-md">
                <span className="text-white font-bold text-sm">AP</span>
              </div>
              <span className="text-lg font-bold text-primary">ADA Pappers</span>
            </Link>
          )}
          {isCollapsed && (
            <Link href="/" className="flex items-center justify-center w-full">
              <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center shadow-md">
                <span className="text-white font-bold text-sm">PL</span>
              </div>
            </Link>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="hidden lg:flex p-2 hover:bg-gray-100 rounded-md transition-colors"
              aria-label={isCollapsed ? "Agrandir le menu" : "Réduire le menu"}
            >
              <span className="text-lg">{isCollapsed ? '→' : '←'}</span>
            </button>
            <button
              onClick={onClose}
              className="lg:hidden p-2 hover:bg-gray-100 rounded-md transition-colors"
              aria-label="Fermer le menu"
            >
              <span className="text-2xl">×</span>
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {filteredMenuItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  // Fermer le menu sur mobile après clic
                  if (window.innerWidth < 1024 && onClose) {
                    onClose();
                  }
                }}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-lg
                  transition-all duration-200 group
                  ${
                    active
                      ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-md'
                      : 'text-gray-700 hover:bg-orange-50 hover:text-orange-600'
                  }
                  ${isCollapsed ? 'justify-center' : ''}
                `}
                title={isCollapsed ? item.label : undefined}
              >
                <span className={`text-xl flex-shrink-0 ${active ? '' : 'group-hover:scale-110 transition-transform'}`}>
                  {item.icon}
                </span>
                {!isCollapsed && (
                  <>
                    <span className="font-medium flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-orange-100 text-orange-800 font-semibold">
                        {item.badge}
                      </span>
                    )}
                    {active && (
                      <span className="w-2 h-2 bg-white rounded-full flex-shrink-0"></span>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer de la sidebar */}
        <div className="p-4 border-t border-gray-200 bg-white">
          {!isCollapsed && (
            <div className="text-xs text-muted-foreground">
              <p className="font-semibold text-gray-600 mb-1">
                {userRole === 'superadmin' ? 'Super Administrateur' : 'Administrateur'}
              </p>
              <p className="text-gray-500">
                {session?.user?.email || 'Non connecté'}
              </p>
            </div>
          )}
          {isCollapsed && (
            <div className="flex justify-center">
              <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-xs">
                  {(session?.user?.name || 'A')[0].toUpperCase()}
                </span>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

