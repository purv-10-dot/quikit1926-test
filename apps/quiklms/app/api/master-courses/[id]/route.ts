import { z } from 'zod';
import { route, json, NotFound, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles, type AuthUser } from '@/lib/auth/context';
import * as svc from '@/lib/services/master-course-service';

const isSubAdminActor = (u: AuthUser) => u.role === 'SUB_ADMIN' || u.secondaryRole === 'SUB_ADMIN';
const isPrimaryTenantAdmin = (u: AuthUser) => u.role === 'TENANT_ADMIN';
const isTenantOrSubAdminActor = (u: AuthUser) =>
  u.role === 'TENANT_ADMIN' || u.role === 'SUB_ADMIN' || u.secondaryRole === 'SUB_ADMIN';

// GET /api/master-courses/:id — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const course = await svc.findOne(params!.id);
  const tenantId = actor.tenantId ?? undefined;

  if (isTenantOrSubAdminActor(actor) && tenantId) {
    const isOwnSubmission = course.submittedByTenantId === tenantId;
    const isAssigned = (course.selectedTenants || []).includes(tenantId);
    if (!isOwnSubmission && !isAssigned) throw NotFound('Course not found');
  }
  return json({ success: true, data: course });
});

// PUT /api/master-courses/:id — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const PUT = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const dto = (await parseBody(req, z.object({}).passthrough())) as Record<string, unknown>;
  const id = params!.id;
  const tenantId = actor.tenantId ?? undefined;

  if (isSubAdminActor(actor)) {
    const existing = await svc.findOne(id);
    if (!svc.canTenantAdminEditCourse(existing, String(tenantId))) throw BadRequest('You can only edit your own courses');
    if (!existing.submittedByTenantId) dto.submittedByTenantId = String(tenantId);
    if (!existing.submittedBy) dto.submittedBy = String(actor.id);

    if (existing.status === 'Published' && !existing.parentCourseId) {
      const revision = await svc.createOrUpdateRevisionFromPublished(id, String(tenantId), actor.id, dto);
      return json({ success: true, data: revision, message: 'Course update submitted for Tenant Admin approval' });
    }
    dto.status = 'PendingTenantApproval';
    dto.selectedTenants = [tenantId];
    const course = await svc.update(id, dto);
    return json({ success: true, data: course, message: 'Course submitted for Tenant Admin approval' });
  }

  if (isPrimaryTenantAdmin(actor)) {
    const existing = await svc.findOne(id);
    if (!svc.canTenantAdminEditCourse(existing, String(tenantId))) throw BadRequest('You can only edit your own courses');
    if (!existing.submittedByTenantId) dto.submittedByTenantId = String(tenantId);
    if (!existing.submittedBy) dto.submittedBy = String(actor.id);

    const approvalEnabled = await svc.isApprovalWorkflowEnabled(String(tenantId));
    if (existing.status === 'Published' && !existing.parentCourseId) {
      dto.status = 'Published';
      dto.selectedTenants = [tenantId];
      const updated = await svc.update(id, dto);
      return json({ success: true, data: updated, message: 'Course updated successfully' });
    }
    dto.status = !approvalEnabled
      ? 'Published'
      : existing.status === 'Rejected' ? 'Resubmitted' : 'PendingApproval';
    dto.selectedTenants = [tenantId];
    const course = await svc.update(id, dto);
    return json({ success: true, data: course, message: 'Course resubmitted for approval' });
  }

  const course = await svc.update(id, dto);
  return json({ success: true, data: course, message: 'Master course updated successfully' });
});

// DELETE /api/master-courses/:id — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const DELETE = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  if (isTenantOrSubAdminActor(actor)) {
    const tenantId = actor.tenantId ?? undefined;
    const existing = await svc.findOne(params!.id);
    if (!svc.canTenantAdminEditCourse(existing, String(tenantId))) throw BadRequest('You can only delete your own courses');
  }
  await svc.remove(params!.id);
  return json({ success: true, message: 'Master course deleted successfully' });
});
