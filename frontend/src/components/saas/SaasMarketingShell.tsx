'use client';

import Image from 'next/image';
import Link from 'next/link';

type Props = {
  children: React.ReactNode;
  /** Contenu à droite du header (navigation landing, etc.) */
  headerExtra?: React.ReactNode;
};

export function SaasMarketingShell({ children, headerExtra }: Props) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-8">
          <Link href="/saas" className="flex items-center gap-2 shrink-0">
            <Image
              src="/ada-papers-logo.png"
              alt="Ada Papers"
              width={36}
              height={36}
              className="h-9 w-9"
            />
            <span className="font-semibold text-slate-900">Ada Papers</span>
          </Link>
          {headerExtra ? <div className="flex items-center gap-4">{headerExtra}</div> : null}
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-slate-200 bg-white py-8 mt-auto">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-center text-sm text-slate-500 sm:flex-row md:px-8">
          <p>© {new Date().getFullYear()} Ada Papers — Plateforme de gestion juridique</p>
          <div className="flex flex-wrap justify-center gap-6">
            <Link href="/saas" className="hover:text-orange-600 transition-colors">
              Plateforme
            </Link>
            <Link href="/devenir-cabinet" className="hover:text-orange-600 transition-colors">
              Demander un espace
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
