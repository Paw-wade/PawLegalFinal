'use client';

import Link from 'next/link';

export function Footer() {
  return (
    <footer className="bg-black text-white py-4 mt-auto">
      <div className="container mx-auto px-4">
        <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-lg relative overflow-hidden shrink-0" style={{ width: 140, height: 65 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-h.png" alt="Ada Papers" style={{ position: 'absolute', width: 292, maxWidth: 'none', height: 'auto', left: -76, top: -49 }} />
            </div>
          </div>
          
          <div className="flex items-center gap-4 flex-wrap">
            <Link href="/" className="text-gray-400 hover:text-primary transition-colors">Accueil</Link>
            <Link href="/nouvelle-demande" className="text-gray-400 hover:text-primary transition-colors">Nouvelle demande</Link>
            <Link href="/contact" className="text-gray-400 hover:text-primary transition-colors">Contact</Link>
            <Link href="/faq" className="text-gray-400 hover:text-primary transition-colors">FAQ</Link>
            <Link href="/cgu" className="text-gray-400 hover:text-primary transition-colors">CGU</Link>
            <Link href="/politique-confidentialite" className="text-gray-400 hover:text-primary transition-colors">Confidentialité</Link>
            <Link href="/mentions-legales" className="text-gray-400 hover:text-primary transition-colors">Mentions légales</Link>
            <span className="text-gray-400">|</span>
            <span className="text-gray-400">contact@adapapers.fr</span>
            <span className="text-gray-400">|</span>
            <span className="text-gray-400">07 63 69 64 81</span>
          </div>

          <div className="text-gray-400">
            &copy; {new Date().getFullYear()} Ada Papers. Tous droits réservés.
          </div>
        </div>
      </div>
    </footer>
  );
}



