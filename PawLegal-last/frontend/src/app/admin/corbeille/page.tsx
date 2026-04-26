'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { trashAPI } from '@/lib/api';

function Button({ children, variant = 'default', className = '', disabled = false, ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    danger: 'bg-red-500 text-white hover:bg-red-600 shadow-md font-semibold',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} disabled={disabled} {...props}>{children}</button>;
}

const itemTypeLabels: { [key: string]: string } = {
  message: 'Message',
  document: 'Document',
  dossier: 'Dossier',
  appointment: 'Rendez-vous',
  temoignage: 'Témoignage',
  user: 'Utilisateur',
  task: 'Tâche',
  notification: 'Notification',
  other: 'Autre',
};

const itemTypeColors: { [key: string]: string } = {
  message: 'bg-blue-100 text-blue-800',
  document: 'bg-purple-100 text-purple-800',
  dossier: 'bg-green-100 text-green-800',
  appointment: 'bg-yellow-100 text-yellow-800',
  temoignage: 'bg-pink-100 text-pink-800',
  user: 'bg-indigo-100 text-indigo-800',
  task: 'bg-orange-100 text-orange-800',
  notification: 'bg-gray-100 text-gray-800',
  other: 'bg-gray-100 text-gray-800',
};

export default function AdminCorbeillePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [trashItems, setTrashItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    itemType: '',
    origin: '',
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isRestoring, setIsRestoring] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (session && (session.user as any)?.role !== 'admin' && (session.user as any)?.role !== 'superadmin') {
      router.push('/admin');
    } else if (status === 'authenticated' && ((session.user as any)?.role === 'admin' || (session.user as any)?.role === 'superadmin')) {
      loadTrashItems();
      loadStats();
    }
  }, [session, status, router, pagination.page, filters.itemType, filters.origin]);

  const loadTrashItems = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: any = {
        page: pagination.page,
        limit: pagination.limit,
      };
      if (filters.itemType) params.itemType = filters.itemType;
      if (filters.origin) params.origin = filters.origin;

      const response = await trashAPI.getTrashItems(params);
      
      if (response.data.success) {
        setTrashItems(response.data.items || []);
        setPagination({
          page: response.data.page || 1,
          limit: response.data.limit || 50,
          total: response.data.total || 0,
          totalPages: response.data.totalPages || 0,
        });
      } else {
        setError(response.data.message || 'Erreur lors du chargement de la corbeille');
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement de la corbeille:', err);
      setError(err.response?.data?.message || 'Erreur lors du chargement de la corbeille');
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await trashAPI.getStats();
      if (response.data.success) {
        setStats(response.data.stats);
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement des statistiques:', err);
    }
  };

  const handleRestore = async (itemId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir restaurer cet élément ?')) return;
    
    setIsRestoring(itemId);
    try {
      const response = await trashAPI.restoreItem(itemId);
      if (response.data.success) {
        await loadTrashItems();
        await loadStats();
        alert('Élément restauré avec succès');
      } else {
        alert(response.data.message || 'Erreur lors de la restauration');
      }
    } catch (err: any) {
      console.error('Erreur lors de la restauration:', err);
      alert(err.response?.data?.message || 'Erreur lors de la restauration');
    } finally {
      setIsRestoring(null);
    }
  };

  const handleDeletePermanently = async (itemId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer définitivement cet élément ? Cette action est irréversible.')) return;
    
    setIsDeleting(itemId);
    try {
      const response = await trashAPI.deletePermanently(itemId);
      if (response.data.success) {
        await loadTrashItems();
        await loadStats();
        alert('Élément supprimé définitivement');
      } else {
        alert(response.data.message || 'Erreur lors de la suppression');
      }
    } catch (err: any) {
      console.error('Erreur lors de la suppression:', err);
      alert(err.response?.data?.message || 'Erreur lors de la suppression');
    } finally {
      setIsDeleting(null);
    }
  };

  const handleBatchRestore = async () => {
    if (selectedItems.size === 0) return;
    if (!confirm(`Êtes-vous sûr de vouloir restaurer ${selectedItems.size} élément(s) ?`)) return;
    
    try {
      const promises = Array.from(selectedItems).map(id => trashAPI.restoreItem(id));
      await Promise.all(promises);
      await loadTrashItems();
      await loadStats();
      setSelectedItems(new Set());
      alert(`${selectedItems.size} élément(s) restauré(s) avec succès`);
    } catch (err: any) {
      console.error('Erreur lors de la restauration batch:', err);
      alert('Erreur lors de la restauration de certains éléments');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedItems.size === 0) return;
    if (!confirm(`Êtes-vous sûr de vouloir supprimer définitivement ${selectedItems.size} élément(s) ? Cette action est irréversible.`)) return;
    
    try {
      const promises = Array.from(selectedItems).map(id => trashAPI.deletePermanently(id));
      await Promise.all(promises);
      await loadTrashItems();
      await loadStats();
      setSelectedItems(new Set());
      alert(`${selectedItems.size} élément(s) supprimé(s) définitivement`);
    } catch (err: any) {
      console.error('Erreur lors de la suppression batch:', err);
      alert('Erreur lors de la suppression de certains éléments');
    }
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === trashItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(trashItems.map(item => item._id)));
    }
  };

  const formatDate = (date: string | Date) => {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getDaysUntilAutoDelete = (deletedAt: string | Date) => {
    if (!deletedAt) return null;
    const deleted = new Date(deletedAt);
    const thirtyDaysLater = new Date(deleted);
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
    const now = new Date();
    const diffTime = thirtyDaysLater.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement de la corbeille...</p>
        </div>
      </div>
    );
  }

  if (!session || ((session.user as any)?.role !== 'admin' && (session.user as any)?.role !== 'superadmin')) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <main className="w-full px-4 py-8">
        {/* En-tête */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl flex items-center justify-center shadow-lg">
              <span className="text-3xl">🗑️</span>
            </div>
            <div>
              <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-orange-500 via-orange-600 to-orange-500 bg-clip-text text-transparent">
                Corbeille
              </h1>
              <p className="text-muted-foreground text-lg">Gérez les éléments supprimés (récupérables pendant 30 jours)</p>
            </div>
          </div>
        </div>

        {/* Statistiques */}
        {stats && (
          <div className="grid md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-lg p-6 border-2 border-blue-300">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">📊</span>
                </div>
                <div>
                  <p className="text-sm text-blue-700 font-medium">Total</p>
                  <p className="text-2xl font-bold text-blue-900">{stats.total || 0}</p>
                </div>
              </div>
            </div>

            {stats.byType && stats.byType.map((stat: any) => (
              <div key={stat._id} className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl shadow-lg p-6 border-2 border-gray-300">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-500 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">📦</span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-700 font-medium">{itemTypeLabels[stat._id] || stat._id}</p>
                    <p className="text-2xl font-bold text-gray-900">{stat.count || 0}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Filtres et actions batch */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 mb-6">
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium mb-2">Type d'élément</label>
              <select
                value={filters.itemType}
                onChange={(e) => {
                  setFilters({ ...filters, itemType: e.target.value });
                  setPagination({ ...pagination, page: 1 });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              >
                <option value="">Tous les types</option>
                {Object.entries(itemTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium mb-2">Origine</label>
              <input
                type="text"
                value={filters.origin}
                onChange={(e) => {
                  setFilters({ ...filters, origin: e.target.value });
                  setPagination({ ...pagination, page: 1 });
                }}
                placeholder="Filtrer par origine..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>

            <div className="flex items-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setFilters({ itemType: '', origin: '' });
                  setPagination({ ...pagination, page: 1 });
                }}
              >
                Réinitialiser
              </Button>
            </div>
          </div>

          {/* Actions batch */}
          {selectedItems.size > 0 && (
            <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
              <span className="text-sm font-medium text-gray-700">
                {selectedItems.size} élément(s) sélectionné(s)
              </span>
              <Button
                variant="default"
                onClick={handleBatchRestore}
                className="text-sm"
              >
                Restaurer sélection
              </Button>
              <Button
                variant="danger"
                onClick={handleBatchDelete}
                className="text-sm"
              >
                Supprimer définitivement
              </Button>
            </div>
          )}
        </div>

        {/* Erreur */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Liste des éléments */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-2xl font-bold text-foreground">Éléments supprimés</h2>
          </div>

          {trashItems.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-5xl mb-4">🗑️</div>
              <p className="text-muted-foreground text-lg">La corbeille est vide</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={selectedItems.size === trashItems.length && trashItems.length > 0}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500"
                        />
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Élément</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Supprimé par</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Date de suppression</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Origine</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {trashItems.map((item) => {
                      const daysLeft = getDaysUntilAutoDelete(item.deletedAt);
                      const isSelected = selectedItems.has(item._id);
                      
                      return (
                        <tr 
                          key={item._id} 
                          className={`hover:bg-gray-50 transition-colors ${isSelected ? 'bg-orange-50' : ''}`}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleItemSelection(item._id)}
                              className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${itemTypeColors[item.itemType] || itemTypeColors.other}`}>
                              {itemTypeLabels[item.itemType] || item.itemType}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm">
                              <p className="font-medium text-gray-900">
                                {item.itemData?.titre || item.itemData?.sujet || item.itemData?.nom || item.itemData?.firstName || item.itemData?.title || 'Élément supprimé'}
                              </p>
                              {(item.itemData?.description || item.itemData?.contenu || item.itemData?.message) && (
                                <p className="text-gray-500 text-xs mt-1 line-clamp-1">
                                  {item.itemData.description || item.itemData.contenu || item.itemData.message}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm">
                              {item.deletedBy ? (
                                <>
                                  <p className="font-medium text-gray-900">
                                    {item.deletedBy.firstName} {item.deletedBy.lastName}
                                  </p>
                                  <p className="text-gray-500 text-xs">{item.deletedBy.email}</p>
                                </>
                              ) : (
                                <p className="text-gray-500">-</p>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm">
                              <p className="text-gray-900">{formatDate(item.deletedAt)}</p>
                              {daysLeft !== null && (
                                <p className={`text-xs mt-1 ${daysLeft <= 7 ? 'text-red-600 font-semibold' : daysLeft <= 15 ? 'text-orange-600' : 'text-gray-500'}`}>
                                  {daysLeft > 0 ? `${daysLeft} jour(s) restant(s)` : 'Suppression automatique imminente'}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm text-gray-600">{item.origin || '-'}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRestore(item._id)}
                                disabled={isRestoring === item._id || isDeleting === item._id}
                                className="text-xs"
                              >
                                {isRestoring === item._id ? 'Restauration...' : 'Restaurer'}
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleDeletePermanently(item._id)}
                                disabled={isRestoring === item._id || isDeleting === item._id}
                                className="text-xs"
                              >
                                {isDeleting === item._id ? 'Suppression...' : 'Supprimer'}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="p-6 border-t border-gray-200 flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Affichage de {(pagination.page - 1) * pagination.limit + 1} à {Math.min(pagination.page * pagination.limit, pagination.total)} sur {pagination.total} éléments
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
                      disabled={pagination.page === 1}
                    >
                      ← Précédent
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
                      disabled={pagination.page >= pagination.totalPages}
                    >
                      Suivant →
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

