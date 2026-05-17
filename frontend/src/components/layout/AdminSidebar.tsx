'use client';

import { signOut, useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { collaborativeDraftsAPI, dossierDocumentDraftsAPI, forumAPI } from '@/lib/api';
import { canAccessAdminPath, isCabinetStaffRole, isFullAdminRole } from '@/lib/staffAccess';
import {
  LayoutDashboard,
  Users,
  FolderOpen,
  CheckSquare,
  Calendar,
  Clock,
  MessageSquare,
  FileText,
  PenLine,
  Star,
  Bell,
  Smartphone,
  Mail,
  Image,
  FileEdit,
  Scale,
  Trash2,
  User,
  Building2,
} from 'lucide-react';
import { canAccessPlatformConsole } from '@/lib/platformAdmin';

interface AdminSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

interface MenuItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const adminMenuItems: MenuItem[] = [
  { href: '/admin', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/admin/utilisateurs', label: 'Utilisateurs', icon: Users },
  { href: '/admin/dossiers', label: 'Dossiers', icon: FolderOpen },
  { href: '/admin/dossiers/tarification', label: 'Dossiers tarification', icon: FolderOpen },
  { href: '/admin/taches', label: 'Tâches', icon: CheckSquare },
  { href: '/admin/rendez-vous', label: 'Rendez-vous', icon: Calendar },
  { href: '/admin/creneaux', label: 'Créneaux', icon: Clock },
  { href: '/admin/messages', label: 'Messages', icon: MessageSquare },
  { href: '/admin/documents', label: 'Documents', icon: FileText },
  {
    href: '/admin/documents/preparation',
    label: 'Docs en préparation',
    icon: PenLine,
  },
  { href: '/admin/temoignages', label: 'Témoignages', icon: Star },
  { href: '/admin/notifications', label: 'Notifications', icon: Bell },
  { href: '/admin/sms', label: 'SMS', icon: Smartphone },
  { href: '/admin/emails', label: 'Emails', icon: Mail },
  { href: '/admin/carousel', label: 'Carrousel home', icon: Image },
  { href: '/admin/cms', label: 'CMS', icon: FileEdit },
  { href: '/admin/recours', label: 'Documentation', icon: FolderOpen },
  { href: '/admin/lexia', label: 'Paw AI', icon: Scale },
  { href: '/admin/corbeille', label: 'Corbeille', icon: Trash2 },
  { href: '/forum', label: 'Forum', icon: MessageSquare },
  { href: '/admin/compte', label: 'Mon compte', icon: User },
];

export function AdminSidebar({ isOpen = true, onClose }: AdminSidebarProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [forumUnreadCount, setForumUnreadCount] = useState<number>(0);
  const [prepDraftCount, setPrepDraftCount] = useState<number>(0);

  const userRole = (session?.user as any)?.role || 'client';
  const userEmail = (session?.user as any)?.email as string | undefined;

  const filteredMenuItems = adminMenuItems.filter((item) => {
    if (item.href === '/admin/platform/cabinets') {
      return canAccessPlatformConsole(userRole, userEmail);
    }
    if (!item.roles) return true;
    return item.roles.includes(userRole);
  });

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === href;
    if (href === '/admin/dossiers') {
      if (pathname.startsWith('/admin/dossiers/tarification')) return false;
      return pathname === href || pathname.startsWith('/admin/dossiers/');
    }
    if (href === '/admin/documents') {
      if (pathname.startsWith('/admin/documents/preparation')) return false;
      return pathname === href;
    }
    if (href === '/admin/documents/preparation') {
      return pathname.startsWith('/admin/documents/preparation');
    }
    return pathname.startsWith(href);
  };

  const loadPrepDraftCount = useCallback(async () => {
    const role = (session?.user as any)?.role as string | undefined;
    if (!role || !canAccessAdminPath(role, '/admin/documents/preparation')) {
      setPrepDraftCount(0);
      return;
    }
    try {
      // Même logique que la page "Documents en préparation":
      // total = brouillons Word + brouillons éditeur riche.
      const settled = await Promise.allSettled([
        dossierDocumentDraftsAPI.list(),
        collaborativeDraftsAPI.getGlobalList(),
      ]);
      const wordCount =
        settled[0].status === 'fulfilled' && settled[0].value.data?.success
          ? (settled[0].value.data.drafts || []).length
          : 0;
      const collabCount =
        settled[1].status === 'fulfilled' && settled[1].value.data?.success
          ? (settled[1].value.data.drafts || []).length
          : 0;
      setPrepDraftCount(wordCount + collabCount);
    } catch (err: any) {
      if (err?.response?.status !== 404) console.error('Erreur compteur documents en préparation:', err);
      setPrepDraftCount(0);
    }
  }, [session]);

  const loadForumCount = useCallback(async () => {
    try {
      const res = await forumAPI.getUnreadThreadsCount();
      if (res.data?.success && typeof res.data.count === 'number') {
        setForumUnreadCount(res.data.count);
      }
    } catch (err: any) {
      // Endpoint optionnel selon versions backend: ignorer le 404 proprement.
      if (err?.response?.status === 404 || err?.isForumUnreadCountNotFound) {
        setForumUnreadCount(0);
        return;
      }
      console.error('Erreur lors du chargement du nombre de nouvelles discussions forum (admin):', err);
    }
  }, []);

  useEffect(() => {
    loadForumCount();
    loadPrepDraftCount();
  }, [loadForumCount, loadPrepDraftCount, pathname]);

  useEffect(() => {
    const onForumUnreadUpdated = () => loadForumCount();
    const onCollaborativeDraftsUpdated = () => loadPrepDraftCount();
    if (typeof window !== 'undefined') {
      window.addEventListener('forumUnreadUpdated', onForumUnreadUpdated);
      window.addEventListener('collaborativeDraftsUpdated', onCollaborativeDraftsUpdated);
      return () => {
        window.removeEventListener('forumUnreadUpdated', onForumUnreadUpdated);
        window.removeEventListener('collaborativeDraftsUpdated', onCollaborativeDraftsUpdated);
      };
    }
  }, [loadForumCount, loadPrepDraftCount]);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-[60] bg-neutral-900/25 backdrop-blur-[2px] lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — même design que partenaire */}
      <aside
        className={`
          w-64 bg-white border-r border-gray-200 flex flex-col
          fixed top-0 left-0 bottom-0 z-[70] lg:bottom-auto lg:h-screen lg:min-h-screen
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
              {userRole === 'superadmin'
                ? 'Super administration'
                : isFullAdminRole(userRole)
                  ? 'Panneau d&apos;administration'
                  : isCabinetStaffRole(userRole)
                    ? 'Espace équipe'
                    : 'Panneau d&apos;administration'}
            </span>
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

        {/* Navigation — scroll ; déconnexion fixée en bas sur mobile */}
        <nav className="p-4 space-y-2 flex-1 min-h-0 overflow-y-auto">
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
                  {item.href === '/admin/documents/preparation' && prepDraftCount > 0 && (
                    <span className="ml-1 text-[11px] font-semibold bg-slate-100 text-slate-800 px-2 py-0.5 rounded-full">
                      {prepDraftCount > 99 ? '99+' : prepDraftCount}
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

