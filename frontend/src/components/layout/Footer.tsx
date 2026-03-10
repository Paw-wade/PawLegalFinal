'use client';

import Link from 'next/link';

export function Footer() {
  return (
    <footer className="bg-black text-white py-4 mt-auto">
      <div className="container mx-auto px-4">
        <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-orange-500">ADA Pappers</span>
            <span className="text-gray-400">|</span>
            <span className="text-gray-400">Service d'Accompagnement aux démarches administratives</span>
          </div>
          
          <div className="flex items-center gap-4 flex-wrap">
            <Link href="/" className="text-gray-400 hover:text-primary transition-colors">Accueil</Link>
            <Link href="/services" className="text-gray-400 hover:text-primary transition-colors">Services</Link>
            <Link href="/contact" className="text-gray-400 hover:text-primary transition-colors">Contact</Link>
            <Link href="/faq" className="text-gray-400 hover:text-primary transition-colors">FAQ</Link>
            <Link href="/cgu" className="text-gray-400 hover:text-primary transition-colors">CGU</Link>
            <Link href="/politique-confidentialite" className="text-gray-400 hover:text-primary transition-colors">Confidentialité</Link>
            <span className="text-gray-400">|</span>
            <span className="text-gray-400">contact@adapappers.fr</span>
            <span className="text-gray-400">|</span>
            <span className="text-gray-400">07 68 03 33 58</span>
          </div>

          <div className="text-gray-400">
            &copy; {new Date().getFullYear()} ADA Pappers. Tous droits réservés.
          </div>
        </div>
      </div>
    </footer>
  );
}



