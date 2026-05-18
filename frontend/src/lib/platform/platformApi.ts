import api from '@/lib/api';
import type {
  OrgChecklist,
  PlatformAuditEntry,
  PlatformDashboard,
  PlatformOrganization,
  TenantHealth,
  TenantUsersList,
} from './types';

export const platformAPI = {
  health: () =>
    api.get<{
      success: boolean;
      multiTenant: boolean;
      masterDbOk: boolean;
      organizationCount: number;
      byStatus: Record<string, number>;
      cacheTtlMs: number;
    }>('/platform/health'),

  dashboard: () => api.get<{ success: boolean } & PlatformDashboard>('/platform/dashboard'),

  organizations: {
    list: (includeHealth = true) =>
      api.get<{ success: boolean; organizations: PlatformOrganization[] }>(
        `/platform/organizations?includeHealth=${includeHealth ? 'true' : 'false'}`
      ),
    get: (slug: string, reveal = false) =>
      api.get<{
        success: boolean;
        organization: PlatformOrganization;
        health: TenantHealth;
        checklist: OrgChecklist;
      }>(`/platform/organizations/${slug}?reveal=${reveal ? 'true' : 'false'}`),
    create: (data: Record<string, unknown>) =>
      api.post<{ success: boolean; organization: PlatformOrganization; checklist: OrgChecklist }>(
        '/platform/organizations',
        data
      ),
    update: (slug: string, data: Record<string, unknown>) =>
      api.patch<{ success: boolean; organization: PlatformOrganization; cacheCleared?: boolean }>(
        `/platform/organizations/${slug}`,
        data
      ),
    suspend: (slug: string) => api.delete(`/platform/organizations/${slug}`),
    reactivate: (slug: string) =>
      api.post<{ success: boolean; message: string; organization: PlatformOrganization }>(
        `/platform/organizations/${slug}/reactivate`
      ),
    deletePermanent: (slug: string) =>
      api.delete<{ success: boolean; message: string; slug: string }>(
        `/platform/organizations/${slug}/permanent`
      ),
    health: (slug: string) =>
      api.get<{ success: boolean; health: TenantHealth }>(`/platform/organizations/${slug}/health`),
    checklist: (slug: string) =>
      api.get<{ success: boolean; checklist: OrgChecklist }>(
        `/platform/organizations/${slug}/dns-checklist`
      ),
    auditLogs: (slug: string) =>
      api.get<{ success: boolean; logs: PlatformAuditEntry[] }>(
        `/platform/organizations/${slug}/audit-logs`
      ),
    users: (
      slug: string,
      params?: { search?: string; role?: string; page?: number; limit?: number }
    ) => {
      const q = new URLSearchParams();
      if (params?.search) q.set('search', params.search);
      if (params?.role) q.set('role', params.role);
      if (params?.page) q.set('page', String(params.page));
      if (params?.limit) q.set('limit', String(params.limit));
      const qs = q.toString();
      return api.get<{ success: boolean } & TenantUsersList>(
        `/platform/organizations/${slug}/users${qs ? `?${qs}` : ''}`
      );
    },
    provisionAdmin: (
      slug: string,
      data: { email: string; password: string; firstName?: string; lastName?: string; role?: string }
    ) =>
      api.post<{ success: boolean; message: string; created?: boolean }>(
        `/platform/organizations/${slug}/provision-admin`,
        data
      ),
  },
};
