'use client';

import { signOut, useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { collaborativeDraftsAPI, dossierDocumentDraftsAPI, forumAPI, appointmentsAPI, messagesAPI } from '@/lib/api';
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
  LogOut,
  Bot,
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
  badgeKey?: 'forum' | 'prep' | 'rdv' | 'messages';
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
}

const menuGroups: MenuGroup[] = [
  {
    label: 'Gestion',
    items: [
      { href: '/admin', label: 'Tableau de bord', icon: LayoutDashboard },
      { href: '/admin/assistant', label: 'Assistant', icon: Bot },
      { href: '/admin/dossiers', label: 'Dossiers', icon: FolderOpen },
      { href: '/admin/dossiers/tarification', label: 'Dossiers tarification', icon: FolderOpen },
      { href: '/admin/taches', label: 'Tâches', icon: CheckSquare },
      { href: '/admin/rendez-vous', label: 'Rendez-vous', icon: Calendar, badgeKey: 'rdv' },
      { href: '/admin/calendrier', label: 'Calendrier equipe', icon: CalendarRange },
      { href: '/admin/creneaux', label: 'Créneaux', icon: Clock },
    ],
  },
  {
    label: 'Communication',
    items: [
      { href: '/admin/messages', label: 'Messages', icon: MessageSquare, badgeKey: 'messages' },
      { href: '/admin/questionnaires', label: 'Questionnaires', icon: ClipboardList },
      { href: '/admin/notifications', label: 'Notifications', icon: Bell },
      { href: '/admin/sms', label: 'SMS', icon: Smartphone },
      { href: '/admin/emails', label: 'Emails', icon: Mail },
    ],
  },
  {
    label: 'Contenu',
    items: [
      { href: '/admin/documents', label: 'Documents', icon: FileText },
      { href: '/admin/documents/preparation', label: 'Docs en préparation', icon: PenLine, badgeKey: 'prep' },
      { href: '/admin/temoignages', label: 'Témoignages', icon: Star },
      { href: '/admin/dahira', label: 'Données Dahira', icon: BookUser },
      { href: '/admin/carousel', label: 'Carrousel home', icon: Image },
      { href: '/admin/cms', label: 'CMS', icon: FileEdit },
    ],
  },
  {
    label: 'Outils',
    items: [
      { href: '/admin/lexia', label: 'Paw AI', icon: Scale },
      { href: '/forum', label: 'Forum', icon: MessageSquare, badgeKey: 'forum' },
      { href: '/admin/recours', label: 'Ressources', icon: FolderOpen },
      { href: '/admin/utilisateurs', label: 'Utilisateurs', icon: Users },
      { href: '/admin/corbeille', label: 'Corbeille', icon: Trash2 },
      { href: '/admin/compte', label: 'Mon compte', icon: User },
    ],
  },
];

const railShortcuts = [
  { href: '/admin', icon: LayoutDashboard, title: 'Tableau de bord' },
  { href: '/admin/assistant', icon: Bot, title: 'Assistant' },
  { href: '/admin/dossiers', icon: FolderOpen, title: 'Dossiers' },
  { href: '/admin/taches', icon: CheckSquare, title: 'Tâches' },
  { href: '/admin/rendez-vous', icon: Calendar, title: 'Rendez-vous' },
  { href: '/admin/messages', icon: MessageSquare, title: 'Messages' },
  { href: '/admin/documents', icon: FileText, title: 'Documents' },
  { href: '/admin/lexia', icon: Scale, title: 'Paw AI' },
];

export function AdminSidebar({ isOpen = true, onClose, collapsed = false, onToggleCollapse }: AdminSidebarProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [forumUnreadCount, setForumUnreadCount] = useState<number>(0);
  const [prepDraftCount, setPrepDraftCount] = useState<number>(0);
  const [rdvPendingCount, setRdvPendingCount] = useState<number>(0);
  const [messagesUnreadCount, setMessagesUnreadCount] = useState<number>(0);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const userRole = (session?.user as any)?.role || 'client';
  const userName = (session?.user as any)?.prenom || (session?.user as any)?.name || 'Admin';
  const userInitials = userName.slice(0, 2).toUpperCase();
  const userRoleLabel =
    userRole === 'superadmin' ? 'Super Admin' :
    userRole === 'admin' ? 'Administrateur' :
    userRole;

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
    if (!role || !staff.includes(role)) { setPrepDraftCount(0); return; }
    try {
      const settled = await Promise.allSettled([
        dossierDocumentDraftsAPI.list(),
        collaborativeDraftsAPI.getGlobalList(),
      ]);
      const wordCount =
        settled[0].status === 'fulfilled' && settled[0].value.data?.success
          ? (settled[0].value.data.drafts || []).length : 0;
      const collabCount =
        settled[1].status === 'fulfilled' && settled[1].value.data?.success
          ? (settled[1].value.data.drafts || []).length : 0;
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
      if (err?.response?.status === 404 || err?.isForumUnreadCountNotFound) {
        setForumUnreadCount(0); return;
      }
      console.error('Erreur lors du chargement du nombre de nouvelles discussions forum (admin):', err);
    }
  }, []);

  const loadRdvPendingCount = useCallback(async () => {
    const role = (session?.user as any)?.role as string | undefined;
    const staff = ['admin', 'superadmin', 'assistant', 'comptable', 'secretaire', 'juriste', 'stagiaire'];
    if (!role || !staff.includes(role)) { setRdvPendingCount(0); return; }
    try {
      const res = await appointmentsAPI.getAllAppointments({ statut: 'en_attente' });
      const list = res.data?.data || res.data?.appointments || [];
      setRdvPendingCount(Array.isArray(list) ? list.length : 0);
    } catch {
      setRdvPendingCount(0);
    }
  }, [session]);

  const loadMessagesUnreadCount = useCallback(async () => {
    const role = (session?.user as any)?.role as string | undefined;
    const staff = ['admin', 'superadmin', 'assistant', 'comptable', 'secretaire', 'juriste', 'stagiaire'];
    if (!role || !staff.includes(role)) { setMessagesUnreadCount(0); return; }
    try {
      const res = await messagesAPI.getUnreadCount();
      const count = res.data?.count ?? res.data?.unreadCount ?? 0;
      setMessagesUnreadCount(typeof count === 'number' ? count : 0);
    } catch {
      setMessagesUnreadCount(0);
    }
  }, [session]);

  const toggleGroup = (label: string) => {
    setCollapsedGroups(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const getGroupBadge = (groupLabel: string): number => {
    switch (groupLabel) {
      case 'Gestion': return rdvPendingCount;
      case 'Communication': return messagesUnreadCount;
      case 'Contenu': return prepDraftCount;
      case 'Outils': return forumUnreadCount;
      default: return 0;
    }
  };

  useEffect(() => {
    loadForumCount();
    loadPrepDraftCount();
    loadRdvPendingCount();
    loadMessagesUnreadCount();
  }, [loadForumCount, loadPrepDraftCount, loadRdvPendingCount, loadMessagesUnreadCount, pathname]);

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

  const handleNavClick = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024 && onClose) onClose();
  };

  return (
    <>
      {/* Overlay mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[60] bg-neutral-900/25 backdrop-blur-[2px] lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar : rail orange + panneau blanc */}
      <aside
        style={{ width: collapsed ? '56px' : '276px' }}
        className={`
          fixed top-0 left-0 bottom-0 z-[70] flex flex-row
          lg:bottom-auto lg:h-screen lg:min-h-screen
          transform transition-all duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
      >
        {/* ---- RAIL (toujours visible) --------------------------------- */}
        <div
          className="w-14 shrink-0 flex flex-col h-full"
          style={{ background: 'linear-gradient(180deg, #EA580C 0%, #F97316 100%)' }}
        >
          {/* Logo */}
          <Link
            href="/"
            title="Ada Papers"
            className="h-16 shrink-0 flex items-center justify-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-icon.png" alt="Ada Papers" className="w-9 h-9 rounded-xl object-cover" />
          </Link>

          {/* Raccourcis */}
          <nav className="flex-1 flex flex-col items-center gap-0.5 px-2 py-1 overflow-hidden">
            {railShortcuts.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.title}
                  onClick={handleNavClick}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center relative transition-colors ${
                    active
                      ? 'bg-white/22 text-white'
                      : 'text-white/65 hover:text-white hover:bg-white/15'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.href === '/admin/messages' && forumUnreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-yellow-300" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Bouton toggle collapse (desktop uniquement) */}
          {onToggleCollapse && (
            <div className="hidden lg:flex justify-center pb-3">
              <button
                onClick={onToggleCollapse}
                aria-label={collapsed ? 'Agrandir le menu' : 'Réduire le menu'}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white/60 bg-white/10 hover:bg-white/22 hover:text-white transition-colors"
              >
                {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>

        {/* ---- PANNEAU (masqué quand collapsed) ----------------------- */}
        {!collapsed && (
          <div className="w-[220px] shrink-0 flex flex-col h-full bg-white border-r border-gray-200">

            {/* En-tête utilisateur */}
            <div className="h-16 shrink-0 flex items-center gap-3 px-4 border-b border-gray-100">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ background: 'linear-gradient(135deg, #F97316, #FBBF24)' }}
              >
                {userInitials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-gray-800 truncate">{userName}</p>
                <p className="text-[10px] text-gray-400 capitalize">{userRoleLabel}</p>
              </div>
              {onClose && (
                <button
                  onClick={onClose}
                  className="lg:hidden ml-auto p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  aria-label="Fermer le menu"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Navigation groupée */}
            <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full">
              {menuGroups.map((group, gi) => {
                const isCollapsed = !!collapsedGroups[group.label];
                const groupBadge = getGroupBadge(group.label);
                return (
                  <div key={group.label}>
                    {gi > 0 && <div className="h-px bg-gray-100 my-1.5 mx-1" />}
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.label)}
                      className="w-full flex items-center justify-between px-3 pt-2 pb-1 group"
                    >
                      <span className="text-[9.5px] font-bold tracking-[.12em] text-gray-400 uppercase">
                        {group.label}
                      </span>
                      <span className="flex items-center gap-1.5">
                        {isCollapsed && groupBadge > 0 && (
                          <span className="text-[9px] font-bold bg-orange-500 text-white rounded-full px-1.5 py-0.5 leading-tight">
                            {groupBadge > 99 ? '99+' : groupBadge}
                          </span>
                        )}
                        <ChevronRight
                          className={`w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}
                        />
                      </span>
                    </button>
                    {!isCollapsed && group.items.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item.href);
                      const badgeCount =
                        item.badgeKey === 'forum' ? forumUnreadCount :
                        item.badgeKey === 'prep' ? prepDraftCount :
                        item.badgeKey === 'rdv' ? rdvPendingCount :
                        item.badgeKey === 'messages' ? messagesUnreadCount : 0;
                      const showBadge = badgeCount > 0;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={handleNavClick}
                          className={`flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[12.5px] font-medium transition-colors relative ${
                            active
                              ? 'bg-orange-50 text-orange-700'
                              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                          }`}
                        >
                          {active && (
                            <span className="absolute left-0 top-[7px] bottom-[7px] w-[3px] bg-orange-500 rounded-r-full" />
                          )}
                          <Icon
                            className={`w-4 h-4 shrink-0 ${active ? 'text-orange-500' : 'text-gray-400'}`}
                          />
                          <span className="truncate">{item.label}</span>
                          {showBadge && (
                            <span className={`ml-auto text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-tight shrink-0 ${
                              item.badgeKey === 'rdv' ? 'bg-orange-500 text-white' :
                              item.badgeKey === 'messages' ? 'bg-blue-500 text-white' :
                              item.badgeKey === 'forum' ? 'bg-orange-500 text-white' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {badgeCount > 99 ? '99+' : badgeCount}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </nav>

            {/* Déconnexion */}
            <div className="shrink-0 border-t border-gray-100 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
              <button
                type="button"
                onClick={async () => {
                  if (typeof window !== 'undefined') {
                    localStorage.removeItem('token');
                    sessionStorage.removeItem('token');
                    try { await signOut({ redirect: false }); } catch {}
                    window.location.href = '/';
                  }
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[12.5px] font-semibold text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                Déconnexion
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
