'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { userAPI } from '@/lib/api';

const ROLE_OPTIONS = [
  'client',
  'admin',
  'superadmin',
  'assistant',
  'comptable',
  'secretaire',
  'juriste',
  'stagiaire',
  'visiteur',
  'partenaire',
] as const;

export default function AdminUserDetailPage() {
  const { data: session, status } = useSession();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const userId = String(params?.id || '');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<any>(null);
  const [form, setForm] = useState<any>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    role: 'client',
    isActive: true,
    profilComplete: false,
  });

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin');
    if (status === 'authenticated') {
      const role = (session?.user as any)?.role;
      if (role !== 'admin' && role !== 'superadmin') router.push('/client');
    }
  }, [status, session, router]);

  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await userAPI.getUserById(userId);
        const u = res.data?.user;
        setUser(u);
        setForm({
          firstName: u?.firstName || '',
          lastName: u?.lastName || '',
          email: u?.email || '',
          phone: u?.phone || '',
          role: u?.role || 'client',
          isActive: u?.isActive !== false,
          profilComplete: Boolean(u?.profilComplete),
        });
      } catch (e: any) {
        setError(e?.response?.data?.message || 'Impossible de charger cet utilisateur');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [userId]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      setMessage(null);
      const payload: any = { ...form };
      await userAPI.updateUser(userId, payload);
      if (password.trim()) {
        await userAPI.updateUserPassword(userId, { newPassword: password.trim() });
        setPassword('');
      }
      setMessage('Utilisateur mis à jour avec succès');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Erreur lors de la mise à jour');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!confirm('Supprimer cet utilisateur ?')) return;
    try {
      setSaving(true);
      setError(null);
      await userAPI.deleteUser(userId);
      router.push('/admin/utilisateurs');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Erreur lors de la suppression');
      setSaving(false);
    }
  };

  if (loading || status === 'loading') {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 rounded bg-muted" />
          <div className="h-40 rounded-xl bg-muted" />
          <div className="h-64 rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-white border rounded-2xl shadow-sm p-5 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                Administration
              </p>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                Fiche utilisateur
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Gérez les informations du compte, les accès et le statut.
              </p>
            </div>
            <button
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
              onClick={() => router.push('/admin/utilisateurs')}
            >
              ← Retour à la liste
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm shadow-sm">
            {error}
          </div>
        )}
        {message && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700 text-sm shadow-sm">
            {message}
          </div>
        )}

        <form onSubmit={onSave} className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 md:px-6 md:py-5 border-b bg-muted/30">
            <h2 className="text-lg font-semibold">Informations du compte</h2>
          </div>

          <div className="p-5 md:p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Prénom</label>
                <input
                  className="w-full border rounded-md px-3 py-2.5 text-sm"
                  placeholder="Prénom"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Nom</label>
                <input
                  className="w-full border rounded-md px-3 py-2.5 text-sm"
                  placeholder="Nom"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Email</label>
                <input
                  className="w-full border rounded-md px-3 py-2.5 text-sm"
                  placeholder="Email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Téléphone</label>
                <input
                  className="w-full border rounded-md px-3 py-2.5 text-sm"
                  placeholder="Téléphone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Rôle</label>
                <select
                  className="w-full border rounded-md px-3 py-2.5 text-sm bg-white"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Nouveau mot de passe</label>
                <input
                  type="password"
                  className="w-full border rounded-md px-3 py-2.5 text-sm"
                  placeholder="Optionnel (min. 8 caractères)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="border rounded-lg p-4 bg-muted/20">
              <p className="text-sm font-semibold mb-3">Options de compte</p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  />
                  Compte actif
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={form.profilComplete}
                    onChange={(e) => setForm({ ...form, profilComplete: e.target.checked })}
                  />
                  Profil complet
                </label>
              </div>
            </div>
          </div>

          <div className="px-5 py-4 md:px-6 border-t bg-white flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center rounded-md bg-primary text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={onDelete}
              className="inline-flex items-center justify-center rounded-md bg-red-600 text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              Supprimer l’utilisateur
            </button>
          </div>
        </form>

        <div className="bg-white border rounded-xl p-4 text-sm text-muted-foreground shadow-sm">
          {user?.createdAt && (
            <p>
              Créé le <strong>{new Date(user.createdAt).toLocaleString('fr-FR')}</strong>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

