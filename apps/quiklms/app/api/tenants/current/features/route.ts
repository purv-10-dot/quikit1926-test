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
};

// GET /api/tenants/current/features
export const GET = route(async (req) => {
  const actor = await requireAuth(req);

  // SUPER_ADMIN has no tenant — return all features enabled at platform level
  if (!actor.tenantId) {
    return json({
      success: true,
      data: {
        tenantId: null,
        tenantType: null,
        tenantName: 'QuikSkill Platform',
        features: ALL_FEATURES,
        availableRoles: ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER', 'TEACHER', 'PARENT', 'LEARNER'],
        roleLabels: { SUPER_ADMIN: 'Super Admin', TENANT_ADMIN: 'Administrator', SUB_ADMIN: 'Sub Admin', MANAGER: 'Manager', TEACHER: 'Teacher', PARENT: 'Parent', LEARNER: 'Learner' },
        config: {},
        branding: { logo: null, primaryColor: '#3B82F6', secondaryColor: '#1E40AF' },
        localization: { timezone: 'UTC', defaultLanguage: 'en', enabledLanguages: ['en'], locale: 'en', currency: 'USD' },
      },
    });
  }

  const tenant = await findTenant(actor.tenantId);
  return json({ success: true, data: buildTenantFeaturesResponse(tenant) });
});
