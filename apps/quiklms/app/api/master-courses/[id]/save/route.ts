import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import * as svc from '@/lib/services/master-course-service';

// POST /api/master-courses/:id/save — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const dto = (await parseBody(req, z.object({}).passthrough())) as Record<string, unknown>;
  const id = params!.id;
  const orgId = actor.orgId ?? undefined;

  if (svc.isSubAdminActor(actor)) {
    const existing = await svc.findOne(id);
    if (!svc.canTenantAdminEditCourse(existing, String(orgId))) throw BadRequest('You can only edit your own courses');
    if (!existing.submittedByTenantId) dto.submittedByTenantId = String(orgId);
    if (!existing.submittedBy) dto.submittedBy = String(actor.id);

    if (existing.status === 'Published' && !existing.parentCourseId) {
      // The 5th arg FORCES PendingTenantApproval, reproducing the legacy
      // controller's post-save override (`master-course.controller.ts:305-311`).
      // Passing the status inside the dto — as this route used to — was a no-op:
      // the service computes its own status and never reads dto.status. See
      // GAP_REPORT §2.5: with the approval workflow disabled, a Sub Admin's edit
      // to a published course went live with no approval from anyone.
      const revision = await svc.createOrUpdateRevisionFromPublished(
        id,
        String(orgId),
        actor.id,
        dto,
        'PendingTenantApproval',
      );
      return json({ success: true, data: revision, message: 'Course update submitted for Tenant Admin approval' });
    }
    dto.status = 'PendingTenantApproval';
    dto.selectedTenants = [orgId];
    const course = await svc.update(id, dto);
    return json({ success: true, data: course, message: 'Course submitted for Tenant Admin approval' });
  }

  if (svc.isPrimaryTenantAdmin(actor)) {
    const existing = await svc.findOne(id);
    if (!svc.canTenantAdminEditCourse(existing, String(orgId))) throw BadRequest('You can only edit your own courses');
    if (!existing.submittedByTenantId) dto.submittedByTenantId = String(orgId);
    if (!existing.submittedBy) dto.submittedBy = String(actor.id);

    const approvalEnabled = await svc.isApprovalWorkflowEnabled(String(orgId));
    if (existing.status === 'Published' && !existing.parentCourseId) {
      dto.status = 'Published';
      dto.selectedTenants = [orgId];
      const updated = await svc.update(id, dto);
      return json({ success: true, data: updated, message: 'Course updated successfully' });
    }
    dto.status = !approvalEnabled
      ? 'Published'
      : existing.status === 'Rejected' ? 'Resubmitted' : 'PendingApproval';
    dto.selectedTenants = [orgId];
    const course = await svc.update(id, dto);
    return json({
      success: true,
      data: course,
      message: approvalEnabled ? 'Course submitted for approval' : 'Course published successfully',
    });
  }

  const course = await svc.update(id, dto);
  return json({ success: true, data: course, message: 'Master course saved successfully' });
});
