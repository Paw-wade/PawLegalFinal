export type OrgStatus = 'trial' | 'active' | 'suspended';

export type TenantHealth = {
  mongoOk: boolean;
  dbName: string | null;
  adminCount: number;
  userCount: number;
  latencyMs: number;
  error: string | null;
};

export type ChecklistStep = {
  id: string;
  title: string;
  description: string;
  done?: boolean;
  link?: string;
  records?: { type: string; name: string; value: string }[];
};

export type OrgChecklist = {
  slug: string;
  primaryDomain: string;
  devDomains: string[];
  progress: { done: number; total: number };
  steps: ChecklistStep[];
  health?: TenantHealth | null;
};

export type PlatformOrganization = {
  id: string;
  slug: string;
  status: OrgStatus;
  domains: string[];
  domain: string;
  mongoUri: string;
  hasMongoUri: boolean;
  branding: {
    name?: string;
    logo?: string;
    primaryColor?: string;
    favicon?: string;
  };
  email: {
    from?: string;
    replyTo?: string;
    hasBrevoApiKey?: boolean;
    brevoApiKey?: string;
  };
  landingPage?: Record<string, string>;
  limits?: {
    maxUsers?: number;
    maxStorageGb?: number;
    modules?: string[];
  };
  createdAt?: string;
  updatedAt?: string;
  checklistProgress?: { done: number; total: number };
  primaryDomain?: string;
  health?: TenantHealth | null;
};

export type TenantUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  isActive: boolean;
  profilComplete: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type TenantUsersList = {
  users: TenantUser[];
  total: number;
  page: number;
  limit: number;
  pages: number;
};

export const TENANT_USER_ROLES = [
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

export type PlatformAuditEntry = {
  id: string;
  action: string;
  orgSlug?: string;
  actorEmail: string;
  details?: Record<string, unknown>;
  createdAt: string;
};

export type PlatformDashboard = {
  summary: {
    total: number;
    byStatus: Record<string, number>;
    trialOlderThan30Days: number;
  };
  organizations: {
    organization: PlatformOrganization;
    checklistProgress: { done: number; total: number };
    primaryDomain: string;
  }[];
  recentAudit: PlatformAuditEntry[];
};

export const PLATFORM_MODULE_OPTIONS = [
  'dossiers',
  'messagerie',
  'documents',
  'rendez-vous',
  'calculateur',
  'lexia',
] as const;

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  create: 'Création',
  update: 'Modification',
  suspend: 'Suspension',
  reactivate: 'Réactivation',
  delete_permanent: 'Suppression définitive',
  provision_admin: 'Admin provisionné',
};
