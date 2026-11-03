'use client';

import { signOut, useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { collaborativeDraftsAPI, dossierDocumentDraftsAPI, forumAPI } from '@/lib/api';
import {
  LayoutDashboard,
  Users,
  FolderOpen,
  CheckSquare,
  Calendar,
  CalendarRange,
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
  BookUser,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface AdminSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
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
  { href: '/admin/dossiers/tarification', label: 'Dossiers tarification', icon: FolderOpen },
  { href: '/admin/taches', label: 'Tâches', icon: CheckSquare },
  { href: '/admin/rendez-vous', label: 'Rendez-vous', icon: Calendar },
  { href: '/admin/calendrier', label: 'Calendrier equipe', icon: CalendarRange },
  { href: '/admin/creneaux', label: 'Créneaux', icon: Clock },
  { href: '/admin/messages', label: 'Messages', icon: MessageSquare },
  { href: '/admin/questionnaires', label: 'Questionnaires', icon: ClipboardList },
  { href: '/admin/documents', label: 'Documents', icon: FileText },
  {
    href: '/admin/documents/preparation',
    label: 'Docs en préparation',
    icon: PenLine,
    roles: ['admin', 'superadmin', 'assistant', 'comptable', 'secretaire', 'juriste', 'stagiaire'],
  },
  { href: '/admin/temoignages', label: 'Témoignages', icon: Star },
  { href: '/admin/dahira', label: 'Données Dahira', icon: BookUser, roles: ['admin', 'superadmin'] },
  { href: '/admin/notifications', label: 'Notifications', icon: Bell },
  { href: '/admin/sms', label: 'SMS', icon: Smartphone },
  { href: '/admin/emails', label: 'Emails', icon: Mail },
  { href: '/admin/carousel', label: 'Carrousel home', icon: Image },
  { href: '/admin/cms', label: 'CMS', icon: FileEdit },
  { href: '/admin/recours', label: 'Documentation', icon: FolderOpen, roles: ['admin', 'superadmin'] },
  { href: '/admin/lexia', label: 'Paw AI', icon: Scale, roles: ['admin', 'superadmin'] },
  { href: '/admin/corbeille', label: 'Corbeille', icon: Trash2 },
  { href: '/forum', label: 'Forum', icon: MessageSquare },
  { href: '/admin/compte', label: 'Mon compte', icon: User },
];

export function AdminSidebar({ isOpen = true, onClose, collapsed = false, onToggleCollapse }: AdminSidebarProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [forumUnreadCount, setForumUnreadCount] = useState<number>(0);
  const [prepDraftCount, setPrepDraftCount] = useState<number>(0);

  const userRole = (session?.user as any)?.role || 'client';

  // Tous les éléments du menu sont toujours affichés. Le contrôle d'accès
  // par domaine est géré par RouteProtection (message d'accès refusé au clic).
  const filteredMenuItems = adminMenuItems;

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
    const staff = ['admin', 'superadmin', 'assistant', 'comptable', 'secretaire', 'juriste', 'stagiaire'];
    if (!role || !staff.includes(role)) {
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

      {/* Sidebar admin */}
      <aside
        className={`
          bg-white border-r border-gray-200 flex flex-col
          fixed top-0 left-0 bottom-0 z-[70] lg:bottom-auto lg:h-screen lg:min-h-screen
          transform transition-all duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
          ${collapsed ? 'w-16' : 'w-64'}
        `}
      >
        {/* Bande logo */}
        <div className={`h-16 shrink-0 flex items-center border-b border-gray-200 relative ${collapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
          {!collapsed && (
            <div className="flex items-center min-w-0">
              <Link
                href="/"
                className="font-bold text-orange-500 hover:text-orange-600 transition-colors text-lg tracking-tight"
              >
                Ada Papers
              </Link>
              <span className="hidden md:inline ml-2 text-[10px] text-gray-500">
                {userRole === 'superadmin' ? 'Super administration' : "Panneau d'administration"}
              </span>
            </div>
          )}
          {collapsed && (
            <Link href="/" className="font-bold text-orange-500 text-base" title="Ada Papers">A</Link>
          )}
          {onClose && !collapsed && (
            <button
              onClick={onClose}
              className="lg:hidden px-3 py-2 ml-2 min-h-[36px] flex items-center justify-center rounded-full border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
              aria-label="Fermer le menu"
            >
              Fermer
            </button>
          )}
          {/* Bouton toggle collapse - desktop uniquement */}
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              aria-label={collapsed ? 'Agrandir le menu' : 'Reduire le menu'}
              className={`hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white border border-gray-200 items-center justify-center text-gray-400 hover:text-orange-500 hover:border-orange-300 transition-colors shadow-sm z-10`}
            >
              {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden ${collapsed ? 'p-2 space-y-1' : 'p-4 space-y-1'}`}>
          {filteredMenuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            const forumBadge = item.href === '/forum' && forumUnreadCount > 0;
            const prepBadge = item.href === '/admin/documents/preparation' && prepDraftCount > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                onClick={() => {
                  if (typeof window !== 'undefined' && window.innerWidth < 1024 && onClose) onClose();
                }}
                className={`flex items-center rounded-lg transition-colors ${
                  collapsed
                    ? 'justify-center p-2.5 relative'
                    : 'gap-3 px-4 py-2.5'
                } ${active ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!collapsed && (
                  <span className="flex items-center gap-1 truncate text-sm">
                    {item.label}
                    {forumBadge && (
                      <span className="ml-1 text-[11px] font-semibold bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full">
                        {forumUnreadCount > 99 ? '99+' : forumUnreadCount}
                      </span>
                    )}
                    {prepBadge && (
                      <span className="ml-1 text-[11px] font-semibold bg-slate-100 text-slate-800 px-2 py-0.5 rounded-full">
                        {prepDraftCount > 99 ? '99+' : prepDraftCount}
                      </span>
                    )}
                  </span>
                )}
                {collapsed && (forumBadge || prepBadge) && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-orange-500" />
                )}
                {!collapsed && item.badge && (
                  <span className="ml-auto px-2 py-0.5 text-xs rounded-full bg-orange-100 text-orange-800 font-semibold">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Deconnexion */}
        <div className="shrink-0 border-t border-gray-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] lg:shadow-none">
          <button
            type="button"
            onClick={async () => {
              if (typeof window !== 'undefined') {
                localStorage.removeItem('token');
                sessionStorage.removeItem('token');
                try {
                  await signOut({ redirect: false });
                } catch {}
                window.location.href = '/';
              }
            }}
            className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors min-h-[44px] ${collapsed ? 'justify-center' : 'justify-center'}`}
            title={collapsed ? 'Deconnexion' : undefined}
          >
            {!collapsed && <span>Deconnexion</span>}
            {collapsed && (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}

