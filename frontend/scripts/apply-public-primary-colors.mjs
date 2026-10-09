/**
 * Remplace les classes orange « marque » par primary sur les pages publiques.
 * N’altère aucun texte — classes CSS uniquement.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, '..', 'src');

const files = [
  'app/page.tsx',
  'app/services/page.tsx',
  'app/contact/page.tsx',
  'app/faq/page.tsx',
  'app/a-propos/page.tsx',
  'app/calculateur/page.tsx',
  'app/forum/page.tsx',
  'app/forum/[id]/page.tsx',
  'app/cgu/page.tsx',
  'app/mentions-legales/page.tsx',
  'app/politique-confidentialite/page.tsx',
  'app/auth/signin/page.tsx',
  'app/auth/signup/page.tsx',
  'app/auth/forgot-password/page.tsx',
  'app/auth/reset-password/page.tsx',
  'app/auth/activate/page.tsx',
  'app/auth/complete-profile/page.tsx',
  'app/auth/setup-password/page.tsx',
  'components/layout/Header.tsx',
  'components/layout/Footer.tsx',
];

const replacements = [
  ['bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold', 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-md font-semibold'],
  ['bg-orange-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-orange-600 transition-colors shadow-md', 'bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold hover:bg-primary/90 transition-colors shadow-md'],
  ['px-4 py-2.5 rounded-md bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 transition-colors', 'px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors'],
  ['px-4 py-2.5 rounded-md bg-orange-500 text-white text-xs sm:text-sm font-semibold hover:bg-orange-600 transition-colors', 'px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-xs sm:text-sm font-semibold hover:bg-primary/90 transition-colors'],
  ['bg-orange-500 hover:bg-orange-600 text-white', 'bg-primary hover:bg-primary/90 text-primary-foreground'],
  ['text-3xl font-bold text-orange-500 hover:text-orange-600 transition-colors', 'text-3xl font-bold text-primary hover:opacity-90 transition-colors'],
  ['text-xl font-bold text-orange-500', 'text-xl font-bold text-primary'],
  ['truncate text-orange-500', 'truncate text-primary'],
  ['hover:text-orange-500', 'hover:text-primary'],
  ['bg-orange-500 text-white hover:bg-orange-600 shadow-sm font-semibold', 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm font-semibold'],
  ['bg-orange-500 text-white shadow-sm', 'bg-primary text-primary-foreground shadow-sm'],
  ['bg-orange-500 text-white hover:bg-orange-600 active:bg-orange-700', 'bg-primary text-primary-foreground hover:bg-primary/90 active:opacity-80'],
  ['px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 bg-orange-500 text-white hover:bg-orange-600 shadow-sm font-semibold', 'px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm font-semibold'],
  ['inline-flex items-center justify-center px-3 py-1.5 rounded-md bg-orange-500 text-white text-sm font-medium hover:bg-orange-600', 'inline-flex items-center justify-center px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90'],
  ['inline-flex items-center justify-center px-2.5 py-1 rounded-md bg-orange-500 text-white text-[11px] font-medium hover:bg-orange-600', 'inline-flex items-center justify-center px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90'],
  ['inline-flex items-center justify-center px-4 py-2 rounded-md bg-orange-500 text-white text-sm font-medium hover:bg-orange-600', 'inline-flex items-center justify-center px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90'],
  ["filterTheme === null ? 'bg-orange-500 text-white'", "filterTheme === null ? 'bg-primary text-primary-foreground'"],
  ["filterTheme === t.value ? 'bg-orange-500 text-white'", "filterTheme === t.value ? 'bg-primary text-primary-foreground'"],
  ["filterStatus === s.value ? 'bg-orange-500 text-white'", "filterStatus === s.value ? 'bg-primary text-primary-foreground'"],
  ['px-3 py-1.5 rounded-full text-[11px] font-medium text-white bg-orange-500 hover:bg-orange-600 whitespace-nowrap', 'px-3 py-1.5 rounded-full text-[11px] font-medium text-primary-foreground bg-primary hover:bg-primary/90 whitespace-nowrap'],
  ['to-orange-50/60', 'to-primary/5'],
  ['bg-orange-200/20', 'bg-primary/20'],
  ['text-orange-500', 'text-primary'],
  ['hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50/50', 'hover:border-primary hover:text-primary hover:bg-primary/5'],
  ['to-orange-500/10', 'to-primary/10'],
  ['border-orange-500/20', 'border-primary/20'],
  ['? \'w-6 bg-orange-500\'', '? \'w-6 bg-primary\''],
  ['border border-orange-400 text-orange-700', 'border border-primary text-primary'],
  ['border border-orange-200', 'border border-primary/30'],
  ['bg-orange-50 text-orange-500', 'bg-primary/10 text-primary'],
  ['rounded-full bg-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all duration-200 hover:bg-orange-600', 'rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition-all duration-200 hover:bg-primary/90'],
  ['px-4 py-3.5 rounded-xl text-base font-medium bg-orange-500 text-white hover:bg-orange-600', 'px-4 py-3.5 rounded-xl text-base font-medium bg-primary text-primary-foreground hover:bg-primary/90'],
];

for (const rel of files) {
  const file = path.join(src, rel);
  if (!fs.existsSync(file)) {
    console.warn('skip (missing):', rel);
    continue;
  }
  let content = fs.readFileSync(file, 'utf8');
  const before = content;
  for (const [from, to] of replacements) {
    content = content.split(from).join(to);
  }
  if (content !== before) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('updated:', rel);
  }
}
