'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard,
  FolderOpen, 
  MessageSquare, 
  FileText, 
  Bell, 
  Calculator,
  Calendar,
  User
} from 'lucide-react';

const menuItems = [
  { href: '/partenaire', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/partenaire/dossiers', label: 'Dossiers transmis', icon: FolderOpen },
  { href: '/partenaire/messages', label: 'Messages', icon: MessageSquare },
  { href: '/partenaire/documents', label: 'Documents', icon: FileText },
  { href: '/partenaire/notifications', label: 'Notifications', icon: Bell },
  { href: '/partenaire/calculateur', label: 'Calculateur', icon: Calculator },
  { href: '/partenaire/rendez-vous', label: 'Rendez-vous', icon: Calendar },
  { href: '/forum', label: 'Forum', icon: MessageSquare },
  { href: '/partenaire/compte', label: 'Mon compte', icon: User },
];

export function PartenaireSidebar() {
  const pathname = usePathname();
  
  return (
    <aside className="w-64 bg-white border-r border-gray-200 h-screen fixed left-0 top-0 z-30 flex flex-col">
      {/* Bande logo alignée avec le header (même hauteur h-16) */}
      <div className="h-16 shrink-0 flex items-center px-4 border-b border-gray-200">
        <Link
          href="/"
          className="font-bold text-orange-500 hover:text-orange-600 transition-colors text-lg tracking-tight"
        >
          ADA Pappers
        </Link>
        <span className="ml-2 text-[10px] text-gray-500">Espace partenaire</span>
      </div>
      <nav className="p-4 space-y-2 flex-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== '/partenaire' && pathname?.startsWith(item.href + '/'));
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-primary text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

