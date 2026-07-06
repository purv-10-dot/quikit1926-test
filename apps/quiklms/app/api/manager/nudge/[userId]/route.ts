import { z } from 'zod';
import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { nudgeUser } from '@/lib/services/manager-service';

const schema = z.object({ message: z.string().optional() }).optional();

// POST /api/manager/nudge/:userId — MANAGER
export const POST = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['MANAGER']);
  // Body is optional; tolerate empty/no JSON.
  let message: string | undefined;
  try {
    const raw = await req.text();
    if (raw) message = schema.parse(JSON.parse(raw))?.message;
  } catch {
    /* ignore malformed/empty body — nudge with default message */
  }
  return json(await nudgeUser(user.id, user.tenantId as string, params!.userId, message));
});
