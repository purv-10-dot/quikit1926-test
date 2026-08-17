import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { db } from '@/lib/db';
import { createTemplate, findAll, removeDuplicateIssuedCertificates } from '@/lib/services/certificates-service';

function isTenantOrSubAdmin(role: string) {
  return ['TENANT_ADMIN', 'SUB_ADMIN'].includes(role);
}

/**
 * Real schema, replacing `z.object({}).passthrough()` (F-003).
 *
 * `LmsCertificate.name` and `LmsCertificate.backgroundImageUrl` are the two
 * non-nullable columns without a default, and `createTemplate` forwards the
 * body through an allow-list straight into `db.lmsCertificate.create` — so
 * `POST {}` failed inside Prisma and was reported as a **500**. The field list
 * mirrors `TEMPLATE_WRITABLE` in `certificates-service.ts` plus
 * `selectedTenants`, which the service consumes separately.
 *
 * The four placement fields are opaque `Json` columns (designer coordinates),
 * so they are accepted as any JSON value rather than given a shape the designer
 * would have to keep in sync.
 */
const createTemplateSchema = z.object({
  name: z.string().min(1, 'name is required'),
  backgroundImageUrl: z.string().min(1, 'backgroundImageUrl is required'),
  logoImageUrl: z.string().nullish(),
  signatureImageUrl: z.string().nullish(),
  designation: z.string().nullish(),
  signatoryName: z.string().nullish(),
  textPlacements: z.unknown().optional(),
  logoPlacement: z.unknown().optional(),
  signaturePlacement: z.unknown().optional(),
  isActive: z.boolean().optional(),
  selectedTenants: z.array(z.string()).optional(),
  // Remainder of `TEMPLATE_WRITABLE`. The handler overwrites `approvalStatus`,
  // `isActive`, `orgId`, `submittedBy` and `submittedByTenantId` for a
  // TENANT_ADMIN/SUB_ADMIN caller; they are declared so a ADMIN creating
  // a global template keeps the reach it has today.
  orgId: z.string().nullish(),
  submittedBy: z.string().nullish(),
  submittedByTenantId: z.string().nullish(),
  approvalStatus: z.enum(['pending_approval', 'approved', 'rejected']).optional(),
  approvedBy: z.string().nullish(),
  approvalDate: z.union([z.string(), z.date()]).nullish(),
  rejectionReason: z.string().nullish(),
});

// POST /api/certificates — create template. ADMIN | TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const orgId = user.orgId;

  // Scoped to this tenant — unscoped it swept every issued certificate in every
  // org on every template creation.
  await removeDuplicateIssuedCertificates(orgId ?? undefined).catch(() => {});

  const body = (await parseBody(req, createTemplateSchema)) as Record<string, unknown>;

  let approvalEnabled = true;
  if (isTenantOrSubAdmin(user.role) && orgId) {
    try {
      const tenant = await db.lmsTenant.findUnique({ where: { id: orgId }, select: { featureConfig: true } });
      approvalEnabled = (tenant?.featureConfig as Record<string, unknown>)?.approvalWorkflowEnabled !== false;
    } catch { /* default */ }
  }

  if (isTenantOrSubAdmin(user.role)) {
    if (approvalEnabled) { body.approvalStatus = 'pending_approval'; body.isActive = false; }
    else { body.approvalStatus = 'approved'; body.isActive = true; }
    body.orgId = orgId;
    body.submittedBy = user.id;
    body.submittedByTenantId = orgId;
    body.selectedTenants = [orgId];
  } else {
    body.approvalStatus = 'approved';
    body.isActive = true;
  }

  const certificate = await createTemplate(body);
  return json({
    success: true, data: certificate,
    message: isTenantOrSubAdmin(user.role) && approvalEnabled
      ? 'Certificate template submitted for approval'
      : 'Certificate template created successfully',
  });
});

// GET /api/certificates — list templates. ADMIN | TENANT_ADMIN | SUB_ADMIN | MANAGER | LEARNER
export const GET = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER', 'LEARNER']);
  const certificates = await findAll(user.orgId ?? undefined);
  return json({ success: true, data: certificates });
});
