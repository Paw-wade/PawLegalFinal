/** URL locale suggérée pour ouvrir un cabinet en dev. */
export function cabinetDevUrl(org: { slug: string; domains?: string[] }, port = '3004'): string {
  const domains = org.domains || [];
  const localhost = domains.find((d) => d.includes('localhost'));
  if (localhost) {
    const host = localhost.includes(':') ? localhost : `${localhost}:${port}`;
    return `http://${host.replace(/^https?:\/\//, '')}`;
  }
  const hint = org.slug.replace(/^cabinet-/, '');
  return `http://${hint}.localhost:${port}`;
}

export function cabinetAdminUrl(org: { slug: string; domains?: string[] }): string {
  return `${cabinetDevUrl(org)}/admin`;
}

export function cabinetSignInUrl(org: { slug: string; domains?: string[] }): string {
  return `${cabinetDevUrl(org)}/auth/signin`;
}

export function suggestedDomainsForSlug(slug: string): string[] {
  const short = slug.replace(/^cabinet-/, '');
  return [`${short}.localhost`, `cabinet-${short}.localhost`, `${short}.adapapers.fr`];
}
