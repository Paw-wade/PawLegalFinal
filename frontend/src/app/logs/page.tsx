import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Ancien chemin /logs → journal admin. */
export default function LogsLegacyRedirect() {
  redirect('/admin/logs');
}
