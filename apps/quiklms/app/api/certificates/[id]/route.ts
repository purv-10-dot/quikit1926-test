import { z } from 'zod';
import { route, json, NotFound, Forbidden } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { db } from '@/lib/db';
import { findOne, updateTemplate, deleteTemplate } from '@/lib/services/certificates-service';

function isTenantOrSubAdmin(role: string) {
  return ['TENANT_ADMIN', 'SUB_ADMIN'].includes(role);
}

/**
 * Real schema, replacing `z.object({}).passthrough()` (F-003).
 *
 * The field list mirrors `TEMPLATE_WRITABLE` in `certificates-service.ts` — the
 * allow-list `pickTemplateFields` already applies — plus `selectedTenants`,
 * which the service destructures separately. Anything outside it was, and
 * remains, ignored; the difference is that the fields that DO land in the
 * Prisma write are now type-checked instead of forwarded blind.
 *
 * Every field is optional: this is a partial edit. The approval columns stay
 * declared because a ADMIN edit has always been able to set them and
 * dropping them would be a silent behaviour change — but note the handler below
 * OVERWRITES all five for a TENANT_ADMIN/SUB_ADMIN caller, so they cannot be
 * used to self-approve from a tenant session.
 */
const updateTemplateSchema = z.object({
  name: z.string().optional(),
  backgroundImageUrl: z.string().optional(),
  logoImageUrl: z.string().nullish(),
  signatureImageUrl: z.string().nullish(),
  designation: z.string().nullish(),
  signatoryName: z.string().nullish(),
  textPlacements: z.unknown().optional(),
  logoPlacement: z.unknown().optional(),
  signaturePlacement: z.unknown().optional(),
  selectedTenants: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  approvalStatus: z.enum(['pending_approval', 'approved', 'rejected']).optional(),
  approvedBy: z.string().nullish(),
  approvalDate: z.union([z.string(), z.date()]).nullish(),
  rejectionReason: z.string().nullish(),
});

// GET /api/certificates/:id — ADMIN | TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  return json({ success: true, data: await findOne(params!.id, user.orgId) });
});

// PUT /api/certificates/:id — ADMIN | TENANT_ADMIN | SUB_ADMIN
export const PUT = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const orgId = user.orgId;
  const updateData = (await parseBody(req, updateTemplateSchema)) as Record<string, unknown>;

  if (isTenantOrSubAdmin(user.role)) {
    let approvalEnabled = true;
    if (orgId) {
      try {
        const tenant = await db.lmsTenant.findUnique({ where: { id: orgId }, select: { featureConfig: true } });
        approvalEnabled = (tenant?.featureConfig as Record<string, unknown>)?.approvalWorkflowEnabled !== false;
      } catch { /* default */ }
    }
    if (approvalEnabled) {
      updateData.approvalStatus = 'pending_approval'; updateData.isActive = false;
      updateData.approvalDate = null; updateData.approvedBy = null; updateData.rejectionReason = null;
    } else {
      updateData.approvalStatus = 'approved'; updateData.isActive = true;
    }
  }
  const certificate = await updateTemplate(params!.id, updateData, user.orgId);
  return json({ success: true, data: certificate });
});

// DELETE /api/certificates/:id — ADMIN | TENANT_ADMIN | SUB_ADMIN
export const DELETE = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const orgId = user.orgId;

  if (isTenantOrSubAdmin(user.role)) {
    const template = await findOne(params!.id).catch(() => null);
    if (!template) throw NotFound('Certificate template not found');
    const templateTenantId = template.submittedByTenantId?.toString() || template.orgId?.toString();
    if (!templateTenantId || templateTenantId !== orgId?.toString()) {
      throw Forbidden('You can only delete templates you have created');
    }
  }
  await deleteTemplate(params!.id);
  return json({ success: true, message: 'Certificate template deleted successfully' });
});
