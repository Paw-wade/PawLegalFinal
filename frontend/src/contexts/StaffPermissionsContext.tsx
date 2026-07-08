'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { permissionsAPI } from '@/lib/api';
import { isStaffRole } from '@/lib/userRoles';
import type { PermissionEntry, RouteAccess } from '@/lib/permissions';
import { getRouteAccess } from '@/lib/permissions';

type StaffPermissionsContextValue = {
  loading: boolean;
  permissions: PermissionEntry[];
  assignedDossierCount: number;
  hasAssignments: boolean;
  getRouteAccess: (route: string) => RouteAccess;
  canAccessRoute: (route: string) => boolean;
  isScopedRoute: (route: string) => boolean;
  refresh: () => Promise<void>;
};

const StaffPermissionsContext = createContext<StaffPermissionsContextValue>({
  loading: true,
  permissions: [],
  assignedDossierCount: 0,
  hasAssignments: false,
  getRouteAccess: () => 'denied',
  canAccessRoute: () => false,
  isScopedRoute: () => false,
  refresh: async () => {},
});

export function StaffPermissionsProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<PermissionEntry[]>([]);
  const [assignedDossierCount, setAssignedDossierCount] = useState(0);

  const userRole = (session?.user as any)?.role || 'client';

  const load = useCallback(async () => {
    if (status !== 'authenticated' || !session || !isStaffRole(userRole)) {
      setPermissions([]);
      setAssignedDossierCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await permissionsAPI.getMyPermissions();
      const list = response?.data?.permission?.permissions;
      setPermissions(Array.isArray(list) ? list : []);
      setAssignedDossierCount(Number(response?.data?.assignedDossierCount) || 0);
    } catch {
      setPermissions([]);
      setAssignedDossierCount(0);
    } finally {
      setLoading(false);
    }
  }, [session, status, userRole]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasAssignments = assignedDossierCount > 0;

  const routeAccess = useCallback(
    (route: string) => getRouteAccess(route, permissions, userRole, hasAssignments),
    [permissions, userRole, hasAssignments]
  );

  const canAccessRoute = useCallback(
    (route: string) => routeAccess(route) !== 'denied',
    [routeAccess]
  );

  const isScopedRoute = useCallback(
    (route: string) => routeAccess(route) === 'scoped',
    [routeAccess]
  );

  const value = useMemo(
    () => ({
      loading,
      permissions,
      assignedDossierCount,
      hasAssignments,
      getRouteAccess: routeAccess,
      canAccessRoute,
      isScopedRoute,
      refresh: load,
    }),
    [loading, permissions, assignedDossierCount, hasAssignments, routeAccess, canAccessRoute, isScopedRoute, load]
  );

  return <StaffPermissionsContext.Provider value={value}>{children}</StaffPermissionsContext.Provider>;
}

export function useStaffPermissions() {
  return useContext(StaffPermissionsContext);
}
