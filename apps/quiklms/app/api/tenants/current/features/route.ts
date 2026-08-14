import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { findTenant } from '@/lib/services/tenants-service';
import { buildTenantFeaturesResponse } from '@/lib/features';
import type { FeatureSet } from '@/lib/features';

const ALL_FEATURES: FeatureSet = {
  showCourses: true, showScormContent: true, showCompliance: true, showCourseAssignments: true,
  showManagerDashboard: true, showTeamHierarchy: true, showBatches: true, showSchedule: true,
  showAttendance: true, showHomework: true, showCredits: true, showPayouts: true,
  showVideoClasses: true, showParentPortal: true, showMessaging: true, showCertificates: true,
  showAnalytics: true, showNotifications: true, showMultiLanguage: true,
  // Operator superset — matches `requireQuizProctoring`, which also lets the
  // platform operator through so they can support the tenants that do use it.
  showQuizProctoring: true,
};

// GET /api/tenants/current/features
export const GET = route(async (req) => {
  const actor = await requireAuth(req);

  // The platform OPERATOR's org has no Tenant row. Return all features enabled at
  // platform level rather than 404ing on findTenant. Keyed on the `isSuperAdmin`
  // claim, not the role — a founding org admin resolves to ADMIN but must get
  // the feature set their OWN tenant is configured for, not the platform superset
  // (which would light up school-only menus for a corporate org). Mirrors the same
  // change in `requireFeature` and `/api/tenants/current`.
  if (actor.isSuperAdmin === true || !actor.orgId) {
    return json({
      success: true,
      data: {
        orgId: null,
        tenantType: null,
        tenantName: 'QuikSkill Platform',
        features: ALL_FEATURES,
        availableRoles: ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER', 'TEACHER', 'PARENT', 'LEARNER'],
        roleLabels: { ADMIN: 'Super Admin', TENANT_ADMIN: 'Administrator', SUB_ADMIN: 'Sub Admin', MANAGER: 'Manager', TEACHER: 'Teacher', PARENT: 'Parent', LEARNER: 'Learner' },
        config: {},
        branding: { logo: null, primaryColor: '#3B82F6', secondaryColor: '#1E40AF' },
        localization: { timezone: 'UTC', defaultLanguage: 'en', enabledLanguages: ['en'], locale: 'en', currency: 'USD' },
      },
    });
  }

  const tenant = await findTenant(actor.orgId);
  return json({ success: true, data: buildTenantFeaturesResponse(tenant) });
});
