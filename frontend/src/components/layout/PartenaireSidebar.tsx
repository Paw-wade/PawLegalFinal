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
  Calendar
} from 'lucide-react';

const menuItems = [
  { href: '/partenaire', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/partenaire/dossiers', label: 'Dossiers transmis', icon: FolderOpen },
  { href: '/partenaire/messages', label: 'Messages', icon: MessageSquare },
  { href: '/partenaire/documents', label: 'Documents', icon: FileText },
  { href: '/partenaire/notifications', label: 'Notifications', icon: Bell },
  { href: '/partenaire/calculateur', label: 'Calculateur', icon: Calculator },
  { href: '/partenaire/rendez-vous', label: 'Rendez-vous', icon: Calendar },
];

export function PartenaireSidebar() {
  const pathname = usePathname();
  
  return (
    <aside className="w-64 bg-white border-r border-gray-200 h-screen fixed left-0 top-0 pt-16 z-30">
      <nav className="p-4 space-y-2">
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

