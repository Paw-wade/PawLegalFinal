const fs = require('fs');
const path = require('path');

const targets = [
  path.join(__dirname, '..', 'src', 'app', 'admin'),
  path.join(__dirname, '..', 'src', 'app', 'client'),
];

const importLine = "import { getHomePathForRole, isFullAdminRole, isStaffRole } from '@/lib/userRoles';";

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx') || p.endsWith('.ts')) out.push(p);
  }
  return out;
}

function patchContent(file, c) {
  const isUtilisateurs = file.includes(`${path.sep}utilisateurs${path.sep}`) || file.endsWith(`${path.sep}utilisateurs${path.sep}page.tsx`);

  if (isUtilisateurs) {
    c = c.replace(
      /!\(session \|\| \(\(session\.user as any\)\?\.role !== 'admin' && \(session\.user as any\)\?\.role !== 'superadmin'\)\)/g,
      '!session || !isFullAdminRole((session.user as any)?.role)'
    );
    c = c.replace(
      /\(session\.user as any\)\?\.role !== 'admin' && \(session\.user as any\)\?\.role !== 'superadmin'/g,
      '!isFullAdminRole((session.user as any)?.role)'
    );
    c = c.replace(
      /isStaffRole\(\(session\.user as any\)\?\.role\)/g,
      'isFullAdminRole((session.user as any)?.role)'
    );
    c = c.replace(/isStaffRole\(userRole\)/g, 'isFullAdminRole(userRole)');
    return c;
  }

  c = c.replace(/userRole === 'admin' \|\| userRole === 'superadmin'/g, 'isStaffRole(userRole)');
  c = c.replace(/role === 'admin' \|\| role === 'superadmin'/g, 'isStaffRole(role)');
  c = c.replace(
    /\(session\.user as any\)\?\.role === 'admin' \|\| \(session\.user as any\)\?\.role === 'superadmin'/g,
    'isStaffRole((session.user as any)?.role)'
  );
  c = c.replace(
    /\(session\?\.user as any\)\?\.role === 'admin' \|\| \(session\?\.user as any\)\?\.role === 'superadmin'/g,
    'isStaffRole((session?.user as any)?.role)'
  );
  c = c.replace(
    /session\?\.user\?\.role === 'admin' \|\| \(session\?\.user as any\)\?\.role === 'superadmin'/g,
    'isStaffRole((session?.user as any)?.role)'
  );
  c = c.replace(
    /\(\(session\.user as any\)\?\.role !== 'admin' && \(session\.user as any\)\?\.role !== 'superadmin'\)/g,
    '!isStaffRole((session.user as any)?.role)'
  );
  c = c.replace(
    /\(session\.user as any\)\?\.role !== 'admin' && \(session\.user as any\)\?\.role !== 'superadmin'/g,
    '!isStaffRole((session.user as any)?.role)'
  );
  c = c.replace(/role !== 'admin' && role !== 'superadmin'/g, '!isStaffRole(role)');
  c = c.replace(/ur !== 'admin' && ur !== 'superadmin'/g, '!isStaffRole(ur)');
  c = c.replace(/router\.push\('\/client'\)/g, 'router.push(getHomePathForRole(userRole))');
  c = c.replace(/window\.location\.href = '\/client'/g, 'window.location.href = getHomePathForRole(userRole)');

  // client pages: staff should leave client area
  c = c.replace(/const isAdmin = userRole === 'admin' \|\| userRole === 'superadmin'/g, 'const isStaff = isStaffRole(userRole)');
  c = c.replace(/const isAdmin = role === 'admin' \|\| role === 'superadmin'/g, 'const isStaff = isStaffRole(role)');
  c = c.replace(/\bisAdmin\b/g, (m, offset, str) => {
    const before = str.slice(Math.max(0, offset - 80), offset);
    if (before.includes('isStaff')) return m;
    return 'isStaff';
  });

  return c;
}

for (const root of targets) {
  for (const file of walk(root)) {
    if (file.includes('LexiaClient')) continue;
    let c = fs.readFileSync(file, 'utf8');
    const orig = c;
    c = patchContent(file, c);

    if (c !== orig && !c.includes("from '@/lib/userRoles'")) {
      const useClient = c.startsWith("'use client'");
      if (useClient) {
        const idx2 = c.indexOf('\n', c.indexOf('\n') + 1);
        c = c.slice(0, idx2 + 1) + importLine + '\n' + c.slice(idx2 + 1);
      } else {
        c = importLine + '\n' + c;
      }
    }

    if (c !== orig) {
      fs.writeFileSync(file, c, 'utf8');
      console.log('patched', path.relative(path.join(__dirname, '..'), file));
    }
  }
}
