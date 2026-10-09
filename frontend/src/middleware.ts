import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Phase 4 — transmet le Host aux Route Handlers (NextAuth, SSR).
 * La résolution cabinet côté API utilise Host / X-Tenant-Slug (backend).
 */
export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const host = request.headers.get('host');
  if (host) {
    requestHeaders.set('x-forwarded-host', host);
  }
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
};
