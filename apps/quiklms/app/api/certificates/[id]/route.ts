import { z } from 'zod';
import { route, json, NotFound, Forbidden } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { prisma } from '@/lib/prisma';
import { findOne, updateTemplate, deleteTemplate } from '@/lib/services/certificates-service';

function isTenantOrSubAdmin(role: string, secondaryRole: string | null) {
  return ['TENANT_ADMIN', 'SUB_ADMIN'].includes(role) || ['TENANT_ADMIN', 'SUB_ADMIN'].includes(secondaryRole || '');
}

// GET /api/certificates/:id — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  return json({ success: true, data: await findOne(params!.id, user.orgId) });
});

// PUT /api/certificates/:id — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const PUT = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const orgId = user.orgId;
  const updateData = (await parseBody(req, z.object({}).passthrough())) as Record<string, unknown>;

  if (isTenantOrSubAdmin(user.role, user.secondaryRole)) {
    let approvalEnabled = true;
    if (orgId) {
      try {
        const tenant = await prisma.lmsTenant.findUnique({ where: { id: orgId }, select: { featureConfig: true } });
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

// DELETE /api/certificates/:id — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const DELETE = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const orgId = user.orgId;

  if (isTenantOrSubAdmin(user.role, user.secondaryRole)) {
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
