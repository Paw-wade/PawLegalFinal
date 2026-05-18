import { redirect } from 'next/navigation';
import { PLATFORM_CONSOLE_PATH } from '@/lib/auth/platformSession';

/** Ancienne URL — redirige vers la console plateforme dédiée. */
export default function LegacyPlatformCabinetsRedirect() {
  redirect(PLATFORM_CONSOLE_PATH);
}
