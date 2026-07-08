/**
 * Replace &apos; with real apostrophes in TSX text (not inside existing JS strings).
 * Run after fixing any '...&apos;...' string literals manually.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src');

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith('.tsx')) files.push(full);
  }
  return files;
}

let count = 0;
for (const file of walk(ROOT)) {
  const original = fs.readFileSync(file, 'utf8');
  if (!original.includes('&apos;')) continue;
  const fixed = original.replace(/&apos;/g, "'");
  fs.writeFileSync(file, fixed, 'utf8');
  count++;
}
console.log(`Replaced &apos; in ${count} TSX file(s).`);
