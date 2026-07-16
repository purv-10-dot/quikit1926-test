/**
 * Feature flags — 1:1 port of the legacy FeatureFlagsService.
 * Resolves the FeatureSet from a tenant's tenantType + featureConfig, and builds
 * the full tenant features response used by GET /api/tenants/current/features.
 */
import type { LmsTenant as Tenant } from '@prisma/client';

export interface FeatureSet {
  showCourses: boolean;
  showScormContent: boolean;
  showCompliance: boolean;
  showCourseAssignments: boolean;
  showManagerDashboard: boolean;
  showTeamHierarchy: boolean;
  showBatches: boolean;
  showSchedule: boolean;
  showAttendance: boolean;
  showHomework: boolean;
  showCredits: boolean;
  showPayouts: boolean;
  showVideoClasses: boolean;
  showParentPortal: boolean;
  showMessaging: boolean;
  showCertificates: boolean;
  showAnalytics: boolean;
  showNotifications: boolean;
  showMultiLanguage: boolean;
}

type FeatureConfig = Record<string, boolean | undefined>;

function corporate(config: FeatureConfig): FeatureSet {
  return {
    showCourses: config.enableCourses !== false,
    showScormContent: config.enableScorm !== false,
    showCompliance: config.enableCompliance !== false,
    showCourseAssignments: true,
    showManagerDashboard: config.enableManagerReports !== false,
    showTeamHierarchy: true,
    showBatches: false,
    showSchedule: false,
    showAttendance: false,
    showHomework: false,
    showCredits: false,
    showPayouts: false,
    showVideoClasses: false,
    showParentPortal: false,
    showMessaging: config.enableMessaging !== false,
    showCertificates: config.enableCertificates !== false,
    showAnalytics: config.enableAnalytics !== false,
    showNotifications: true,
    showMultiLanguage: true,
  };
}

function school(config: FeatureConfig): FeatureSet {
  return {
    showCourses: false,
    showScormContent: false,
    showCompliance: false,
    showCourseAssignments: true,
    showManagerDashboard: false,
    showTeamHierarchy: false,
    showBatches: config.enableBatches !== false,
    showSchedule: true,
    showAttendance: config.enableAttendance !== false,
    showHomework: config.enableHomework !== false,
    showCredits: config.enableCredits !== false,
    showPayouts: config.enablePayouts !== false,
    showVideoClasses: config.enableVideoClasses !== false,
    showParentPortal: config.enableParentPortal !== false,
    showMessaging: config.enableMessaging !== false,
    showCertificates: config.enableCertificates !== false,
    showAnalytics: config.enableAnalytics !== false,
    showNotifications: true,
    showMultiLanguage: true,
  };
}

export function getFeatures(tenant: Pick<Tenant, 'tenantType' | 'featureConfig'>): FeatureSet {
  const config = (tenant.featureConfig as FeatureConfig) || {};
  return tenant.tenantType === 'corporate' ? corporate(config) : school(config);
}

export function isFeatureEnabled(
  tenant: Pick<Tenant, 'tenantType' | 'featureConfig'>,
  feature: keyof FeatureSet,
): boolean {
  return getFeatures(tenant)[feature];
}

// Roles available + labels per tenant type (ported from user-role.enum helpers)
const CORPORATE_ROLES = ['TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER', 'LEARNER'];
const SCHOOL_ROLES = ['TENANT_ADMIN', 'TEACHER', 'PARENT', 'LEARNER'];

const ROLE_LABELS: Record<string, Record<string, string>> = {
  corporate: { TENANT_ADMIN: 'Administrator', SUB_ADMIN: 'Sub Admin', MANAGER: 'Manager', LEARNER: 'Employee' },
  school: { TENANT_ADMIN: 'School Admin', TEACHER: 'Teacher', PARENT: 'Parent / Guardian', LEARNER: 'Student' },
};

export function getRolesForTenantType(tenantType: string): string[] {
  return tenantType === 'corporate' ? CORPORATE_ROLES : SCHOOL_ROLES;
}

export function getRoleLabel(role: string, tenantType: string): string {
  return ROLE_LABELS[tenantType]?.[role] || role;
}

/** Full features response for GET /api/tenants/current/features. */
export function buildTenantFeaturesResponse(tenant: Tenant) {
  const availableRoles = getRolesForTenantType(tenant.tenantType);
  const roleLabels: Record<string, string> = {};
  for (const r of availableRoles) roleLabels[r] = getRoleLabel(r, tenant.tenantType);

  return {
    orgId: tenant.id,
    tenantType: tenant.tenantType,
    tenantName: tenant.name,
    features: getFeatures(tenant),
    availableRoles,
    roleLabels,
    config: {
      schoolConfig: tenant.schoolConfig ?? null,
      corporateConfig: tenant.corporateConfig ?? null,
      creditConfig: tenant.creditConfig ?? null,
      payoutConfig: tenant.payoutConfig ?? null,
      videoConfig: tenant.videoConfig ?? null,
      enhancementConfig: tenant.enhancementConfig ?? null,
    },
    branding: {
      logo: tenant.logoUrl ?? undefined,
      primaryColor: tenant.primaryColor,
      secondaryColor: tenant.secondaryColor,
    },
    localization: {
      timezone: tenant.timezone,
      defaultLanguage: tenant.defaultLanguage,
      enabledLanguages: tenant.enabledLanguages,
      locale: tenant.locale,
      currency: tenant.currency,
    },
  };
}
