'use client';

import { useEffect, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { dossiersAPI } from '@/lib/api';
import { ClientTarificationPreview } from '@/components/admin/ClientTarificationPreview';
import {
  adminIdFromSession,
  getLinkedClientUserId,
  startDossierClientImpersonation,
  stopDossierClientImpersonation,
} from '@/lib/dossierImpersonation';

export default function AdminDossierTarificationClientPreviewPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const dossierId = params?.id as string;
  const [dossier, setDossier] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const loadedKey = useRef<string | null>(null);

  useEffect(() => {
    if (status === 'loading') return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (status === 'unauthenticated' && !token) {
      router.push('/auth/signin');
      return;
    }
    const role = (session?.user as any)?.role;
    if (status === 'authenticated' && role !== 'admin' && role !== 'superadmin') {
      router.push('/');
      return;
    }
  }, [status, session, router]);

  useEffect(() => {
    if (!dossierId || status === 'loading') return;
    const role = (session?.user as any)?.role;
    if (status === 'authenticated' && role !== 'admin' && role !== 'superadmin') return;

    const key = `${dossierId}:${status}`;
    if (loadedKey.current === key) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        stopDossierClientImpersonation();
        const resAdmin = await dossiersAPI.getDossierById(dossierId);
        if (cancelled) return;
        if (!resAdmin.data?.success || !resAdmin.data?.dossier) {
          setErr(resAdmin.data?.message || 'Dossier introuvable');
          setDossier(null);
          return;
        }
        const d0 = resAdmin.data.dossier;
        const clientId = getLinkedClientUserId(d0);
        const adminId = adminIdFromSession(session);
        if (clientId && adminId) {
          startDossierClientImpersonation(clientId, adminId);
          const resClient = await dossiersAPI.getDossierById(dossierId);
          if (cancelled) return;
          if (resClient.data?.success && resClient.data?.dossier) {
            setDossier(resClient.data.dossier);
          } else {
            setDossier(d0);
            setErr(resClient.data?.message || null);
          }
        } else {
          setDossier(d0);
        }
        loadedKey.current = key;
      } catch (e: any) {
        if (!cancelled) setErr(e?.response?.data?.message || e?.message || 'Erreur de chargement');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dossierId, status, session]);

  useEffect(() => {
    return () => {
      stopDossierClientImpersonation();
    };
  }, []);

  if (status === 'loading' || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Chargement…
      </div>
    );
  }

  if (err || !dossier) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-800">{err || 'Dossier introuvable'}</p>
        <Link href="/admin/dossiers" className="mt-4 inline-block text-sm font-medium text-orange-700 underline">
          Retour aux dossiers
        </Link>
      </div>
    );
  }

  const noClientUser = !getLinkedClientUserId(dossier);

  return (
    <>
      {noClientUser && (
        <div className="mx-auto max-w-6xl px-4 pt-4">
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Aucun compte client lié à ce dossier : les données sont affichées en vue <strong>administrateur</strong>{' '}
            (pas d&apos;impersonation possible).
          </div>
        </div>
      )}
      <ClientTarificationPreview
        dossier={dossier}
        readOnly
        backHref={`/admin/dossiers/${dossierId}`}
        backLabel="Retour au dossier (admin)"
      />
    </>
  );
}

