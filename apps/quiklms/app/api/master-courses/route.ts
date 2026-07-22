import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import * as svc from '@/lib/services/master-course-service';

/**
 * Real schema, replacing `z.object({}).passthrough()` (F-003).
 *
 * This one was not a 500 — it was the **data-integrity** case in the finding.
 * `svc.create` does `title: String(dto.title ?? '')`, so `POST {}` answered
 * **200** and persisted a master course with `title: ""`. Seven such rows were
 * created by probing during the audit. `title` is now the one required field.
 *
 * `modules` and `settings` are deliberately opaque: they are 3-tier authoring
 * `Json` columns (modules → subModules → resources/quizzes) whose shape lives
 * in the studio UI, not in the database. Constraining them here would freeze an
 * authoring format the DB itself does not enforce.
 */
const createMasterCourseSchema = z.object({
  title: z.string().min(1, 'title is required'),
  description: z.string().nullish(),
  category: z.string().nullish(),
  level: z.enum(['Beginner', 'Intermediate', 'Advanced', 'Expert']).optional(),
  thumbnailUrl: z.string().nullish(),
  aiGeneratedThumbnail: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  estimatedDuration: z.number().nullish(),
  modules: z.array(z.unknown()).optional(),
  settings: z.record(z.unknown()).nullish(),
  // Honoured only on the SUPER_ADMIN path; the tenant branches below overwrite it.
  status: z.enum([
    'Draft', 'Published', 'Archived', 'PendingTenantApproval',
    'RejectedByTenantAdmin', 'PendingApproval', 'Rejected', 'Resubmitted',
  ]).optional(),
  selectedTenants: z.array(z.string()).optional(),
});

// POST /api/master-courses — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const dto = (await parseBody(req, createMasterCourseSchema)) as Record<string, unknown>;
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
