import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles, userHasRole } from '@/lib/auth/context';
import { prisma } from '@/lib/prisma';
import { createTemplate, findAll, removeDuplicateIssuedCertificates } from '@/lib/services/certificates-service';

function isTenantOrSubAdmin(role: string, secondaryRole: string | null) {
  return ['TENANT_ADMIN', 'SUB_ADMIN'].includes(role) || ['TENANT_ADMIN', 'SUB_ADMIN'].includes(secondaryRole || '');
}

// POST /api/certificates — create template. SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const orgId = user.orgId;

  await removeDuplicateIssuedCertificates().catch(() => {});

  const body = (await parseBody(req, z.object({}).passthrough())) as Record<string, unknown>;

  let approvalEnabled = true;
  if (isTenantOrSubAdmin(user.role, user.secondaryRole) && orgId) {
    try {
      const tenant = await prisma.lmsTenant.findUnique({ where: { id: orgId }, select: { featureConfig: true } });
      approvalEnabled = (tenant?.featureConfig as Record<string, unknown>)?.approvalWorkflowEnabled !== false;
    } catch { /* default */ }
  }

  if (isTenantOrSubAdmin(user.role, user.secondaryRole)) {
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
    message: isTenantOrSubAdmin(user.role, user.secondaryRole) && approvalEnabled
      ? 'Certificate template submitted for approval'
      : 'Certificate template created successfully',
  });
});

// GET /api/certificates — list templates. SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN | MANAGER | LEARNER
export const GET = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER', 'LEARNER']);
  void userHasRole;
  const certificates = await findAll(user.orgId ?? undefined);
  return json({ success: true, data: certificates });
});
