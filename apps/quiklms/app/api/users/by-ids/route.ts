import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { findUsersByIds } from '@/lib/services/users-service';
import { applyTeacherPrivacy } from '@/lib/privacy';

const schema = z.object({ ids: z.array(z.string()).default([]) });

// POST /api/users/by-ids — staff only (admins/managers/teachers); blocks LEARNER/PARENT
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER', 'TEACHER']);
  const { ids } = await parseBody(req, schema);
  const users = await findUsersByIds(actor.orgId!, ids ?? []);
  return json({ success: true, data: await applyTeacherPrivacy(actor, req, users) });
});
