'use client';

import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

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

  const userRole = (session?.user as any)?.role || 'client';

  const filteredMenuItems = adminMenuItems.filter(item => {
    if (!item.roles) return true;
    return item.roles.includes(userRole);
  });

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <>
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
          fixed top-0 left-0 z-30
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
              ADA Pappers
            </Link>
            <span className="ml-2 text-[10px] text-gray-500 whitespace-nowrap">
              {userRole === 'superadmin' ? 'Super administration' : 'Panneau d&apos;administration'}
            </span>
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
                  if (window.innerWidth < 1024 && onClose) onClose();
                }}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  active ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span>{item.label}</span>
                {item.badge && (
                  <span className="ml-auto px-2 py-0.5 text-xs rounded-full bg-orange-100 text-orange-800 font-semibold">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

