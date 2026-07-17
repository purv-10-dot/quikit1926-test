import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { updateUser } from '@/lib/services/users-service';
import { applyTeacherPrivacy } from '@/lib/privacy';

// PATCH /api/users/:id — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const data = await parseBody(req, z.object({}).passthrough());
  const orgId = actor.role === 'SUPER_ADMIN' ? undefined : actor.orgId ?? undefined;
  const result = await updateUser(params!.id, orgId, data as Record<string, unknown>);
  return json({
    success: true,
    data: await applyTeacherPrivacy(actor, req, result.user),
    emailWelcomeSent: result.emailWelcomeSent,
    message: 'User updated successfully',
  });
});
