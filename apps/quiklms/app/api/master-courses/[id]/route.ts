import { z } from 'zod';
import { route, json, NotFound, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import * as svc from '@/lib/services/master-course-service';

/**
 * Real schema, replacing `z.object({}).passthrough()` (F-003). Same columns as
 * `POST /api/master-courses`, all optional — `svc.update` applies each field
 * only `if (dto.x !== undefined)`, and `MasterCourseStudio` sends a different
 * subset depending on which tab the author saved from.
 *
 * `title` is the field that mattered: the service does `String(dto.title)`, so
 * `PUT {title: 7}` returned 200 and renamed the course to `"7"`.
 *
 * `modules` and `settings` stay opaque `Json` blobs — the 3-tier authoring
 * format is defined by the studio, not by the database, and pinning it here
 * would break the next authoring feature.
 *
 * `submittedBy`/`submittedByTenantId` are NOT declared: the handler below
 * backfills them from the session, so a client value would only ever be
 * overwritten or, worse, let a caller forge the submitter on a course that has
 * none yet.
 */
const updateMasterCourseSchema = z.object({
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

// GET /api/master-courses/:id — ADMIN | TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const course = await svc.findOne(params!.id);
  const orgId = actor.orgId ?? undefined;

  if (svc.isTenantOrSubAdminActor(actor) && orgId) {
    const isOwnSubmission = course.submittedByTenantId === orgId;
    const isAssigned = (course.selectedTenants || []).includes(orgId);
    if (!isOwnSubmission && !isAssigned) throw NotFound('Course not found');
  }
  // Presigned enrichment runs AFTER the ownership check, as in the legacy
  // controller (`master-course.controller.ts:280`) — never sign URLs for a course
  // the caller is not allowed to see.
  return json({ success: true, data: await svc.enrichCourseWithPresignedUrls(course) });
});

// PUT /api/master-courses/:id — ADMIN | TENANT_ADMIN | SUB_ADMIN
export const PUT = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const dto = (await parseBody(req, updateMasterCourseSchema)) as Record<string, unknown>;
  const id = params!.id;
  const orgId = actor.orgId ?? undefined;

  if (svc.isSubAdminActor(actor)) {
    const existing = await svc.findOne(id);
    if (!svc.canTenantAdminEditCourse(existing, String(orgId))) throw BadRequest('You can only edit your own courses');
    if (!existing.submittedByTenantId) dto.submittedByTenantId = String(orgId);
    if (!existing.submittedBy) dto.submittedBy = String(actor.id);

    if (existing.status === 'Published' && !existing.parentCourseId) {
      // FORCE PendingTenantApproval — the legacy PUT did this too
      // (`master-course.controller.ts:386-390`), identically to :id/save. This
      // route did not attempt the override at all, so a Sub Admin's edit to a
      // published course inherited whatever the service computed: `Published`
      // (live, unapproved) with the approval workflow off, or `PendingApproval`
      // (skipping Tenant Admin review) with it on. GAP_REPORT §2.5.
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
    return json({ success: true, data: course, message: 'Course resubmitted for approval' });
  }

  const course = await svc.update(id, dto);
  return json({ success: true, data: course, message: 'Master course updated successfully' });
});

// DELETE /api/master-courses/:id — ADMIN | TENANT_ADMIN | SUB_ADMIN
export const DELETE = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  if (svc.isTenantOrSubAdminActor(actor)) {
    const orgId = actor.orgId ?? undefined;
    const existing = await svc.findOne(params!.id);
    if (!svc.canTenantAdminEditCourse(existing, String(orgId))) throw BadRequest('You can only delete your own courses');
  }
  await svc.remove(params!.id);
  return json({ success: true, message: 'Master course deleted successfully' });
});
