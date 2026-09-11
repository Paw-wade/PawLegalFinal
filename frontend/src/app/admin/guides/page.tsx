'use client';

import { useEffect, useState } from 'react';
import { guidesAPI } from '@/lib/api';

type DayCount = { _id: string; count: number };
type RecentUser = {
  user: { _id: string; firstName: string; lastName: string; email: string; role: string } | null;
  viewedAt: string;
};
type Stats = {
  totalViews: number;
  uniqueConnectedUsers: number;
  anonymousViews: number;
  viewsByDay: DayCount[];
  recentUsers: RecentUser[];
};

export default function AdminGuidesStatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    guidesAPI
      .getStats()
      .then((res) => {
        if (res.data?.success) setStats(res.data.stats);
        else setError('Impossible de charger les statistiques.');
      })
      .catch(() => setError('Erreur lors du chargement des statistiques.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-6 text-red-600 font-medium">{error || 'Aucune donnee disponible.'}</div>
    );
  }

  const maxCount = Math.max(...stats.viewsByDay.map((d) => d.count), 1);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">
        Statistiques - Guide du nouvel arrivant
      </h1>

      {/* Cartes resume */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Vues totales</p>
          <p className="text-3xl font-bold text-orange-500">{stats.totalViews}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Utilisateurs connectes</p>
          <p className="text-3xl font-bold text-blue-600">{stats.uniqueConnectedUsers}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Vues anonymes</p>
          <p className="text-3xl font-bold text-gray-700">{stats.anonymousViews}</p>
        </div>
      </div>

      {/* Graphique vues par jour (30 jours) */}
      {stats.viewsByDay.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-700 mb-4">Vues par jour (30 derniers jours)</h2>
          <div className="flex items-end gap-1 h-40">
            {stats.viewsByDay.map((d) => (
              <div key={d._id} className="flex flex-col items-center flex-1 min-w-0 gap-1">
                <span className="text-[10px] text-gray-500">{d.count}</span>
                <div
                  className="w-full bg-orange-400 rounded-t"
                  style={{ height: `${Math.round((d.count / maxCount) * 100)}%`, minHeight: '4px' }}
                  title={`${d._id} : ${d.count} vue${d.count > 1 ? 's' : ''}`}
                />
                <span className="text-[9px] text-gray-400 truncate w-full text-center">
                  {d._id.slice(5)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Liste des utilisateurs connectes */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-700">
            Utilisateurs connectes ayant consulte (50 derniers)
          </h2>
        </div>
        {stats.recentUsers.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-400">Aucun utilisateur connecte pour l'instant.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {stats.recentUsers.map((v, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <div>
                  {v.user ? (
                    <>
                      <p className="text-sm font-medium text-gray-800">
                        {v.user.firstName} {v.user.lastName}
                      </p>
                      <p className="text-xs text-gray-500">{v.user.email}</p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-400 italic">Utilisateur supprime</p>
                  )}
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap ml-4">
                  {new Date(v.viewedAt).toLocaleDateString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
