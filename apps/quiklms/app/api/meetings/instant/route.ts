import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { createInstantMeeting } from '@/lib/services/meetings-service';
import type { MeetingProvider } from '@prisma/client';

const schema = z.object({ provider: z.string().optional(), title: z.string().optional() });

// POST /api/meetings/instant — TEACHER | TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const body = await parseBody(req, schema);
  const provider = (body.provider as MeetingProvider) || 'jitsi';
  return json(await createInstantMeeting(actor.orgId!, actor.id, provider, body.title));
});
