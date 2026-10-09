export type TenantBranding = {
  name?: string;
  logo?: string;
  primaryColor?: string;
  favicon?: string;
};

export type TenantLandingPage = {
  headline?: string;
  subheadline?: string;
  cta?: string;
};

export type TenantOrganization = {
  id: string;
  slug: string;
  status?: string;
  branding?: TenantBranding;
  landingPage?: TenantLandingPage;
  limits?: {
    modules?: string[];
    maxUsers?: number;
    maxStorageGb?: number;
  };
  domains?: string[];
};

export type TenantConfigResponse = {
  success: boolean;
  multiTenant?: boolean;
  organization?: TenantOrganization | null;
  message?: string;
};
