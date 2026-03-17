'use client';

import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { forumAPI } from '@/lib/api';
import {
  LayoutDashboard,
  Users,
  FolderOpen,
  CheckSquare,
  Calendar,
  Clock,
  MessageSquare,
  FileText,
  Star,
  Bell,
  Smartphone,
  Image,
  FileEdit,
  ScrollText,
  Trash2,
  User,
} from 'lucide-react';

interface AdminSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

interface MenuItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
  badge?: string;
}

const adminMenuItems: MenuItem[] = [
  { href: '/admin', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/admin/utilisateurs', label: 'Utilisateurs', icon: Users },
  { href: '/admin/dossiers', label: 'Dossiers', icon: FolderOpen },
  { href: '/admin/taches', label: 'Tâches', icon: CheckSquare },
  { href: '/admin/rendez-vous', label: 'Rendez-vous', icon: Calendar },
  { href: '/admin/creneaux', label: 'Créneaux', icon: Clock },
  { href: '/admin/messages', label: 'Messages', icon: MessageSquare },
  { href: '/admin/documents', label: 'Documents', icon: FileText },
  { href: '/admin/temoignages', label: 'Témoignages', icon: Star },
  { href: '/admin/notifications', label: 'Notifications', icon: Bell },
  { href: '/admin/sms', label: 'SMS', icon: Smartphone },
  { href: '/admin/carousel', label: 'Carrousel home', icon: Image },
  { href: '/admin/cms', label: 'CMS', icon: FileEdit },
  { href: '/admin/recours', label: 'Répertoire des recours', icon: FolderOpen, roles: ['admin', 'superadmin'] },
  { href: '/admin/logs', label: 'Logs', icon: ScrollText, roles: ['superadmin'] },
  { href: '/admin/corbeille', label: 'Corbeille', icon: Trash2 },
  { href: '/forum', label: 'Forum', icon: MessageSquare },
  { href: '/admin/compte', label: 'Mon compte', icon: User },
];

export function AdminSidebar({ isOpen = true, onClose }: AdminSidebarProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [forumUnreadCount, setForumUnreadCount] = useState<number>(0);

  const userRole = (session?.user as any)?.role || 'client';

  const filteredMenuItems = adminMenuItems.filter(item => {
    if (!item.roles) return true;
    return item.roles.includes(userRole);
  });

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === href;
    return pathname.startsWith(href);
  };

  useEffect(() => {
    const loadForumCount = async () => {
      try {
        const res = await forumAPI.getUnreadThreadsCount();
        if (res.data?.success && typeof res.data.count === 'number') {
          setForumUnreadCount(res.data.count);
        }
      } catch (err) {
        console.error('Erreur lors du chargement du nombre de nouvelles discussions forum (admin):', err);
      }
    };
    loadForumCount();
  }, []);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — même design que partenaire */}
      <aside
        className={`
          w-64 bg-white border-r border-gray-200 h-screen flex flex-col
          fixed top-0 left-0 z-50
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
            <span className="hidden md:inline ml-2 text-[10px] text-gray-500">
              {userRole === 'superadmin' ? 'Super administration' : 'Panneau d&apos;administration'}
            </span>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden p-2 hover:bg-gray-100 rounded-md transition-colors shrink-0"
              aria-label="Fermer le menu"
            >
              <span className="text-2xl">×</span>
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-2 flex-1 overflow-y-auto">
          {filteredMenuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (typeof window !== 'undefined' && window.innerWidth < 1024 && onClose) onClose();
                }}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  active ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'
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
                {item.badge && (
                  <span className="ml-auto px-2 py-0.5 text-xs rounded-full bg-orange-100 text-orange-800 font-semibold">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        {/* Bouton de déconnexion en bas du menu */}
        <div className="border-t border-gray-200 p-4">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') {
                localStorage.removeItem('token');
                sessionStorage.removeItem('token');
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

