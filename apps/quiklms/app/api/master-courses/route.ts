import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles, type AuthUser } from '@/lib/auth/context';
import * as svc from '@/lib/services/master-course-service';

const isSubAdminActor = (u: AuthUser) => u.role === 'SUB_ADMIN' || u.secondaryRole === 'SUB_ADMIN';
const isPrimaryTenantAdmin = (u: AuthUser) => u.role === 'TENANT_ADMIN';

// POST /api/master-courses — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const dto = (await parseBody(req, z.object({}).passthrough())) as Record<string, unknown>;
  const orgId = actor.orgId ?? undefined;

  let message = 'Master course created successfully';
  if (isSubAdminActor(actor)) {
    dto.selectedTenants = [orgId];
    dto.status = 'PendingTenantApproval';
    dto.submittedBy = actor.id;
    dto.submittedByTenantId = orgId;
    message = 'Course submitted for Tenant Admin approval';
  } else if (isPrimaryTenantAdmin(actor) && orgId) {
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
  const data = await svc.findAll();
  return json({ success: true, data });
});
