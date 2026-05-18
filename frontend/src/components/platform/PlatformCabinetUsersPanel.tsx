'use client';

import { useCallback, useEffect, useState } from 'react';
import { platformAPI } from '@/lib/platform/platformApi';
import { TENANT_USER_ROLES, type TenantUser } from '@/lib/platform/types';
import { RefreshCw, Search } from 'lucide-react';

type Props = { slug: string; active: boolean };

export function PlatformCabinetUsersPanel({ slug, active }: Props) {
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await platformAPI.organizations.users(slug, {
        search: search || undefined,
        role: roleFilter !== 'all' ? roleFilter : undefined,
        page,
        limit: 50,
      });
      if (res.data?.success) {
        setUsers(res.data.users || []);
        setTotal(res.data.total ?? 0);
        setPages(res.data.pages ?? 1);
      } else {
        setError('Chargement impossible');
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      setError(err?.response?.data?.message || err.message || 'Erreur');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [slug, search, roleFilter, page]);

  useEffect(() => {
    if (!active) return;
    void load();
  }, [active, load]);

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          <strong>{total}</strong> utilisateur{total !== 1 ? 's' : ''} sur ce cabinet
        </p>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      <form onSubmit={onSearchSubmit} className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="search"
            placeholder="Nom, email, téléphone…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-md"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
          className="border rounded-md px-3 py-2 text-sm"
        >
          <option value="all">Tous les rôles</option>
          {TENANT_USER_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button type="submit" className="px-4 py-2 text-sm bg-primary text-white rounded-md hover:bg-primary/90">
          Rechercher
        </button>
      </form>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">{error}</div>
      )}

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Nom</th>
              <th className="text-left px-3 py-2 font-medium">Email</th>
              <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Téléphone</th>
              <th className="text-left px-3 py-2 font-medium">Rôle</th>
              <th className="text-left px-3 py-2 font-medium">Statut</th>
              <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">Inscription</th>
            </tr>
          </thead>
          <tbody>
            {loading && users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                  Chargement…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                  Aucun utilisateur trouvé.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-t hover:bg-gray-50/80">
                  <td className="px-3 py-2">
                    <div className="font-medium">
                      {[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}
                    </div>
                    {!u.profilComplete && (
                      <span className="text-xs text-amber-600">Profil incomplet</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{u.email || '—'}</td>
                  <td className="px-3 py-2 hidden md:table-cell text-gray-600">{u.phone || '—'}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        u.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {u.isActive ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="px-3 py-2 hidden lg:table-cell text-xs text-gray-500">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString('fr-FR') : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1 border rounded-md disabled:opacity-40"
          >
            Précédent
          </button>
          <span className="text-gray-600">
            Page {page} / {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages || loading}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 border rounded-md disabled:opacity-40"
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}
