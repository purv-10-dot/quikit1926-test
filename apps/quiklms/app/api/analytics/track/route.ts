import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { trackEvent } from '@/lib/services/analytics-service';

const schema = z.object({ eventType: z.string(), eventData: z.any().optional() });

// POST /api/analytics/track — any authenticated user
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  const body = await parseBody(req, schema);
  await trackEvent(actor.tenantId ?? '', body.eventType, body.eventData, actor.id);
  return json({ tracked: true });
});
