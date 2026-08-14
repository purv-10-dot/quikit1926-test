import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import * as svc from '@/lib/services/master-course-service';

/**
 * Real schema, replacing `z.object({}).passthrough()` (F-003). Identical to the
 * one on `PUT /api/master-courses/:id` — the two routes run the same approval
 * branches over the same `MasterCourseStudio` payload (`buildApiPayload`), so
 * they must accept the same body.
 *
 * All optional: `svc.update` patches only the keys present, and
 * `createOrUpdateRevisionFromPublished` falls back to the parent course's value
 * for every field the dto omits. `title` is typed because the service does
 * `String(dto.title)` on it, which turned a numeric title into a stringified
 * one instead of an error. `submittedBy`/`submittedByTenantId` are not
 * declared — the handler backfills them from the session.
 */
const saveMasterCourseSchema = z.object({
  title: z.string().optional(),
  description: z.string().nullish(),
  category: z.string().nullish(),
  level: z.enum(['Beginner', 'Intermediate', 'Advanced', 'Expert']).optional(),
  thumbnailUrl: z.string().nullish(),
  aiGeneratedThumbnail: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  estimatedDuration: z.number().nullish(),
  modules: z.array(z.unknown()).optional(),
  settings: z.record(z.unknown()).nullish(),
  status: z.enum([
    'Draft', 'Published', 'Archived', 'PendingTenantApproval',
    'RejectedByTenantAdmin', 'PendingApproval', 'Rejected', 'Resubmitted',
  ]).optional(),
  selectedTenants: z.array(z.string()).optional(),
});

// POST /api/master-courses/:id/save — ADMIN | TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const dto = (await parseBody(req, saveMasterCourseSchema)) as Record<string, unknown>;
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
