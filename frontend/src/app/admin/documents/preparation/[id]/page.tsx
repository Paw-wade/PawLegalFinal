'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { dossierDocumentDraftsAPI } from '@/lib/api';
import { RichTextEditor } from '@/components/RichTextEditor';
import { ArrowLeft, FileDown, Trash2 } from 'lucide-react';

function isEcheanceDepassee(iso?: string | null) {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d < today;
}

const STAFF_ROLES = ['admin', 'superadmin', 'assistant', 'comptable', 'secretaire', 'juriste', 'stagiaire'] as const;

function isStaffRole(role: string | undefined) {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role);
}

function Button({ children, variant = 'default', className = '', ...props }: any) {
  const base =
    'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  const variants: Record<string, string> = {
    default: 'bg-primary text-white hover:bg-primary/90',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    destructive: 'bg-red-500 text-white hover:bg-red-600',
  };
  return (
    <button type="button" className={`${base} h-10 px-4 ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

function Input({ className = '', ...props }: any) {
  return (
    <input
      className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className}`}
      {...props}
    />
  );
}

function Label({ htmlFor, children, className = '' }: any) {
  return (
    <label htmlFor={htmlFor} className={`text-sm font-medium leading-none ${className}`}>
      {children}
    </label>
  );
}

export default function AdminDocumentPreparationEditPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const { data: session, status } = useSession();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [dueDateInput, setDueDateInput] = useState('');
  const [dossierId, setDossierId] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [dossierLabel, setDossierLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [togglingDone, setTogglingDone] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await dossierDocumentDraftsAPI.getById(id);
      if (!res.data?.success || !res.data.draft) {
        setError('Brouillon introuvable.');
        return;
      }
      const d = res.data.draft;
      setTitle(d.title || '');
      setBody(d.body || '');
      if (d.dueDate) {
        const dt = new Date(d.dueDate);
        setDueDateInput(Number.isNaN(dt.getTime()) ? '' : dt.toISOString().slice(0, 10));
      } else {
        setDueDateInput('');
      }
      const did = d.dossier?._id?.toString();
      setDossierId(did || null);
      setClientName(d.clientName || '');
      const num = d.dossier?.numero;
      const tit = d.dossier?.titre;
      setDossierLabel([num, tit].filter(Boolean).join(' — ') || did || '');
      setCompletedAt(d.completedAt ? new Date(d.completedAt).toISOString() : null);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (status !== 'authenticated' || !session) return;
    if (!isStaffRole((session.user as any)?.role)) {
      router.push('/client');
      return;
    }
    const token = (session.user as any)?.accessToken;
    if (token && typeof window !== 'undefined' && !localStorage.getItem('token')) {
      localStorage.setItem('token', token);
    }
    load();
  }, [session, status, router, load]);

  const save = async () => {
    if (!id || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await dossierDocumentDraftsAPI.update(id, {
        title: title.trim(),
        body,
        dueDate: dueDateInput.trim() ? dueDateInput.trim() : null,
      });
      setSavedAt(new Date().toLocaleTimeString('fr-FR'));
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!id) return;
    try {
      const res = await dossierDocumentDraftsAPI.downloadDocx(id);
      const blob = res.data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[<>:"/\\|?*]+/g, '').slice(0, 80) || 'document'}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Téléchargement impossible.');
    }
  };

  const toggleCompleted = async () => {
    if (!id) return;
    const next = !completedAt;
    setTogglingDone(true);
    setError(null);
    try {
      const res = await dossierDocumentDraftsAPI.update(id, { completed: next });
      const ca = res.data?.draft?.completedAt;
      setCompletedAt(ca ? new Date(ca).toISOString() : null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('dossierDocumentDraftsUpdated'));
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Mise à jour du statut impossible.');
    } finally {
      setTogglingDone(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !confirm('Supprimer ce brouillon ?')) return;
    try {
      await dossierDocumentDraftsAPI.remove(id);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('dossierDocumentDraftsUpdated'));
      }
      router.push('/admin/documents/preparation');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Suppression impossible.');
    }
  };

  const isCompleted = Boolean(completedAt);
  const overdue = isEcheanceDepassee(dueDateInput || null) && !isCompleted;

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/documents/preparation">
          <Button variant="outline" className="gap-2 h-9 px-3">
            <ArrowLeft className="w-4 h-4" />
            Liste
          </Button>
        </Link>
        {dossierId && (
          <Link href={`/admin/dossiers/${dossierId}`}>
            <Button variant="outline" className="h-9 px-3">
              Ouvrir le dossier
            </Button>
          </Link>
        )}
        <div className="flex-1" />
        <Button variant="outline" className="gap-2 h-9 px-3" onClick={handleDownload}>
          <FileDown className="w-4 h-4" />
          Word (.docx)
        </Button>
        <Button variant="destructive" className="gap-2 h-9 px-3" onClick={handleDelete}>
          <Trash2 className="w-4 h-4" />
          Supprimer
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3">{error}</div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-4 md:p-6 shadow-sm space-y-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 gap-y-2">
            <h1 className="text-xl font-bold text-gray-900">Édition — document en préparation</h1>
            {isCompleted ? (
              <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
                Terminé
              </span>
            ) : null}
            {overdue ? (
              <span className="inline-flex rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-800 border border-red-200">
                Échéance dépassée
              </span>
            ) : null}
          </div>
          {dossierLabel && (
            <p className="text-sm text-muted-foreground mt-1">
              Dossier : <span className="text-gray-800">{dossierLabel}</span>
              {clientName ? (
                <>
                  {' '}
                  · Client : <span className="text-gray-800">{clientName}</span>
                </>
              ) : null}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">Titre</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="space-y-2 max-w-xs">
          <Label htmlFor="dueDate">Date d&apos;échéance (optionnel)</Label>
          <Input id="dueDate" type="date" value={dueDateInput} onChange={(e) => setDueDateInput(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label>Contenu (éditeur riche)</Label>
          <RichTextEditor
            value={body}
            onChange={setBody}
            placeholder="Rédigez le document…"
            className="w-full max-h-[min(70vh,720px)]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={saving || !title.trim()}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
          <Button variant="outline" onClick={toggleCompleted} disabled={togglingDone}>
            {togglingDone ? '…' : isCompleted ? 'Rouvrir (non terminé)' : 'Marquer terminé'}
          </Button>
          {savedAt && <span className="text-xs text-muted-foreground">Dernier enregistrement : {savedAt}</span>}
        </div>
      </div>
    </div>
  );
}
