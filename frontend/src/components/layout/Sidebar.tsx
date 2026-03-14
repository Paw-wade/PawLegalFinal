'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { forumAPI } from '@/lib/api';
import {
  LayoutDashboard,
  FolderOpen,
  FileText,
  Calendar,
  MessageSquare,
  Bell,
  Calculator,
  User,
} from 'lucide-react';

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
  { href: '/client/documents', label: 'Documents', icon: FileText },
  { href: '/client/rendez-vous', label: 'Rendez-vous', icon: Calendar },
  { href: '/client/messages', label: 'Messages', icon: MessageSquare },
  { href: '/client/notifications', label: 'Notifications', icon: Bell },
  { href: '/forum', label: 'Forum', icon: MessageSquare },
  { href: '/calculateur', label: 'Calculateur', icon: Calculator },
  { href: '/client/compte', label: 'Mon compte', icon: User },
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [forumUnreadCount, setForumUnreadCount] = useState<number>(0);

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
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`
          w-64 bg-white border-r border-gray-200 h-screen flex flex-col
          fixed top-0 left-0 z-30
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
      >
        <div className="h-16 shrink-0 flex items-center justify-between px-4 border-b border-gray-200">
          <div className="flex items-center min-w-0">
            <Link
              href="/"
              className="font-bold text-orange-500 hover:text-orange-600 transition-colors text-lg tracking-tight"
            >
              Ada Papers
            </Link>
            <span className="hidden md:inline ml-2 text-[10px] text-gray-500">Espace client</span>
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
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

