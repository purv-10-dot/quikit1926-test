import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import * as svc from '@/lib/services/master-course-service';

// POST /api/master-courses — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const dto = (await parseBody(req, z.object({}).passthrough())) as Record<string, unknown>;
  const orgId = actor.orgId ?? undefined;

  // Fail CLOSED. A tenant-scoped actor with no orgId used to slip past both
  // branches below and land on the SUPER_ADMIN path, where `dto.status` is
  // honored from the request body as-is and `selectedTenants` is never forced —
  // so a TENANT_ADMIN/SUB_ADMIN could self-publish an unscoped master course.
  // `getAuthContext` currently guarantees a non-null orgId, which makes this
  // unreachable today; it is the guard that keeps it unreachable if that changes.
  if (!orgId && (svc.isSubAdminActor(actor) || svc.isPrimaryTenantAdmin(actor))) {
    throw BadRequest('Tenant ID is required');
  }

  let message = 'Master course created successfully';
  if (svc.isSubAdminActor(actor)) {
    dto.selectedTenants = [orgId];
    dto.status = 'PendingTenantApproval';
    dto.submittedBy = actor.id;
    dto.submittedByTenantId = orgId;
    message = 'Course submitted for Tenant Admin approval';
  } else if (svc.isPrimaryTenantAdmin(actor) && orgId) {
    const approvalEnabled = await svc.isApprovalWorkflowEnabled(orgId);
    dto.selectedTenants = [orgId];
    dto.status = approvalEnabled ? 'PendingApproval' : 'Published';
    dto.submittedBy = actor.id;
    dto.submittedByTenantId = orgId;
    message = approvalEnabled ? 'Course submitted for approval' : 'Course published successfully';
  }

  const course = await svc.create(actor.id, dto);
  return json({ success: true, data: course, message });
});

// GET /api/master-courses — SUPER_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  const data = await svc.enrichCoursesWithPresignedUrls(await svc.findAll());
  return json({ success: true, data });
});
