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
    dateNaissance: '',
    lieuNaissance: '',
    nationalite: '',
    sexe: '',
    numeroEtranger: '',
    numeroTitre: '',
    typeTitre: '',
    dateDelivrance: '',
    dateExpiration: '',
    adressePostale: '',
    ville: '',
    codePostal: '',
    pays: 'France',
    partenaireInfo: {
      typeOrganisme: '',
      nomOrganisme: '',
      adresseOrganisme: '',
      contactPrincipal: '',
    },
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
          dateNaissance: u?.dateNaissance ? new Date(u.dateNaissance).toISOString().split('T')[0] : '',
          lieuNaissance: u?.lieuNaissance || '',
          nationalite: u?.nationalite || '',
          sexe: u?.sexe || '',
          numeroEtranger: u?.numeroEtranger || '',
          numeroTitre: u?.numeroTitre || '',
          typeTitre: u?.typeTitre || '',
          dateDelivrance: u?.dateDelivrance ? new Date(u.dateDelivrance).toISOString().split('T')[0] : '',
          dateExpiration: u?.dateExpiration ? new Date(u.dateExpiration).toISOString().split('T')[0] : '',
          adressePostale: u?.adressePostale || '',
          ville: u?.ville || '',
          codePostal: u?.codePostal || '',
          pays: u?.pays || 'France',
          partenaireInfo: {
            typeOrganisme: u?.partenaireInfo?.typeOrganisme || '',
            nomOrganisme: u?.partenaireInfo?.nomOrganisme || '',
            adresseOrganisme: u?.partenaireInfo?.adresseOrganisme || '',
            contactPrincipal: u?.partenaireInfo?.contactPrincipal || '',
          },
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

            <div className="border rounded-lg p-4 bg-muted/20 space-y-4">
              <p className="text-sm font-semibold">Identité du client</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Date de naissance</label>
                  <input
                    type="date"
                    className="w-full border rounded-md px-3 py-2.5 text-sm"
                    value={form.dateNaissance || ''}
                    onChange={(e) => setForm({ ...form, dateNaissance: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Lieu de naissance</label>
                  <input
                    className="w-full border rounded-md px-3 py-2.5 text-sm"
                    value={form.lieuNaissance || ''}
                    onChange={(e) => setForm({ ...form, lieuNaissance: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Nationalité</label>
                  <input
                    className="w-full border rounded-md px-3 py-2.5 text-sm"
                    value={form.nationalite || ''}
                    onChange={(e) => setForm({ ...form, nationalite: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Sexe</label>
                  <select
                    className="w-full border rounded-md px-3 py-2.5 text-sm bg-white"
                    value={form.sexe || ''}
                    onChange={(e) => setForm({ ...form, sexe: e.target.value })}
                  >
                    <option value="">Sélectionner</option>
                    <option value="M">M</option>
                    <option value="F">F</option>
                    <option value="Autre">Autre</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="border rounded-lg p-4 bg-muted/20 space-y-4">
              <p className="text-sm font-semibold">Titre de séjour</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Numéro étranger</label>
                  <input
                    className="w-full border rounded-md px-3 py-2.5 text-sm"
                    value={form.numeroEtranger || ''}
                    onChange={(e) => setForm({ ...form, numeroEtranger: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Numéro titre</label>
                  <input
                    className="w-full border rounded-md px-3 py-2.5 text-sm"
                    value={form.numeroTitre || ''}
                    onChange={(e) => setForm({ ...form, numeroTitre: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Type titre</label>
                  <input
                    className="w-full border rounded-md px-3 py-2.5 text-sm"
                    value={form.typeTitre || ''}
                    onChange={(e) => setForm({ ...form, typeTitre: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Date délivrance</label>
                  <input
                    type="date"
                    className="w-full border rounded-md px-3 py-2.5 text-sm"
                    value={form.dateDelivrance || ''}
                    onChange={(e) => setForm({ ...form, dateDelivrance: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Date expiration</label>
                  <input
                    type="date"
                    className="w-full border rounded-md px-3 py-2.5 text-sm"
                    value={form.dateExpiration || ''}
                    onChange={(e) => setForm({ ...form, dateExpiration: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="border rounded-lg p-4 bg-muted/20 space-y-4">
              <p className="text-sm font-semibold">Adresse</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Adresse postale</label>
                  <input
                    className="w-full border rounded-md px-3 py-2.5 text-sm"
                    value={form.adressePostale || ''}
                    onChange={(e) => setForm({ ...form, adressePostale: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Ville</label>
                  <input
                    className="w-full border rounded-md px-3 py-2.5 text-sm"
                    value={form.ville || ''}
                    onChange={(e) => setForm({ ...form, ville: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Code postal</label>
                  <input
                    className="w-full border rounded-md px-3 py-2.5 text-sm"
                    value={form.codePostal || ''}
                    onChange={(e) => setForm({ ...form, codePostal: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Pays</label>
                  <input
                    className="w-full border rounded-md px-3 py-2.5 text-sm"
                    value={form.pays || ''}
                    onChange={(e) => setForm({ ...form, pays: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {form.role === 'partenaire' && (
              <div className="border rounded-lg p-4 bg-muted/20 space-y-4">
                <p className="text-sm font-semibold">Informations partenaire</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Type d’organisme</label>
                    <select
                      className="w-full border rounded-md px-3 py-2.5 text-sm bg-white"
                      value={form.partenaireInfo?.typeOrganisme || ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          partenaireInfo: { ...(form.partenaireInfo || {}), typeOrganisme: e.target.value },
                        })
                      }
                    >
                      <option value="">Sélectionner</option>
                      <option value="consulat">Consulat</option>
                      <option value="association">Association</option>
                      <option value="avocat">Avocat</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Nom organisme</label>
                    <input
                      className="w-full border rounded-md px-3 py-2.5 text-sm"
                      value={form.partenaireInfo?.nomOrganisme || ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          partenaireInfo: { ...(form.partenaireInfo || {}), nomOrganisme: e.target.value },
                        })
                      }
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Adresse organisme</label>
                    <input
                      className="w-full border rounded-md px-3 py-2.5 text-sm"
                      value={form.partenaireInfo?.adresseOrganisme || ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          partenaireInfo: { ...(form.partenaireInfo || {}), adresseOrganisme: e.target.value },
                        })
                      }
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Contact principal</label>
                    <input
                      className="w-full border rounded-md px-3 py-2.5 text-sm"
                      value={form.partenaireInfo?.contactPrincipal || ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          partenaireInfo: { ...(form.partenaireInfo || {}), contactPrincipal: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            )}
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

