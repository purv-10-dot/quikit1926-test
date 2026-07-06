import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { findAll, createMeeting, type CreateMeetingDto } from '@/lib/services/meetings-service';

// GET /api/meetings?scheduledClassId=&status= — any authenticated user
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  const url = new URL(req.url);
  const scheduledClassId = url.searchParams.get('scheduledClassId') || undefined;
  const status = url.searchParams.get('status') || undefined;
  return json(await findAll(actor.tenantId!, { scheduledClassId, status }));
});

const createSchema = z.object({
  scheduledClassId: z.string().optional(),
  title: z.string().optional(),
  scheduledStartTime: z.string(),
  scheduledEndTime: z.string(),
  provider: z.enum(['zoom', 'google_meet', 'teams', 'jitsi', 'manual']).optional(),
  joinUrl: z.string().optional(),
  hostUrl: z.string().optional(),
  password: z.string().optional(),
  recordingEnabled: z.boolean().optional(),
  isInstant: z.boolean().optional(),
});

// POST /api/meetings — TEACHER | TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const dto = await parseBody(req, createSchema);
  return json(await createMeeting(actor.tenantId!, dto as CreateMeetingDto, actor.id));
});
