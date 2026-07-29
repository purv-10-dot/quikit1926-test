import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';

const schema = z.object({ certificateId: z.string().optional() }).passthrough();

// POST /api/certificates/track-download — best-effort download tracking (no-op)
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  const dto = await parseBody(req, schema);
  // eslint-disable-next-line no-console
  console.log(`[certificates/track-download] user=${actor.id} certificateId=${dto.certificateId ?? 'unknown'}`);
  return json({ success: true });
});
