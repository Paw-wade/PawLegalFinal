'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { ClipboardList, LayoutDashboard, LogOut, Server } from 'lucide-react';
import { PLATFORM_SIGNIN_PATH } from '@/lib/auth/platformSession';
import { clsx } from 'clsx';
import { PlatformConsoleBrand } from './PlatformConsoleBrand';

const nav = [
  { href: '/platform', label: 'Tableau de bord', icon: LayoutDashboard, exact: true },
  { href: '/platform/cabinets', label: 'Organisations', icon: Server, exact: false },
  { href: '/platform/demandes-organisations', label: 'Demandes', icon: ClipboardList, exact: false },
];

export function PlatformShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const user = session?.user as { email?: string } | undefined;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-slate-900 text-white shadow-md">
        <div className="max-w-6xl mx-auto px-4">
          <div className="h-14 flex items-center justify-between gap-4">
            <Link href="/platform" className="shrink-0 min-w-0">
              <PlatformConsoleBrand variant="header" />
            </Link>
            <nav className="flex items-center gap-1">
              {nav.map(({ href, label, icon: Icon, exact }) => {
                const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={clsx(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors',
                      active ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden md:inline">{label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="flex items-center gap-3 text-sm shrink-0">
              <span className="hidden lg:inline text-slate-300 truncate max-w-[200px]">{user?.email}</span>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: PLATFORM_SIGNIN_PATH })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-100 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Déconnexion</span>
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
