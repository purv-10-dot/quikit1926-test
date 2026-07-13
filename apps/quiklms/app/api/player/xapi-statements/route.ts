import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { processXAPIStatements } from '@/lib/services/progress-service';

const schema = z.object({ statements: z.array(z.object({ verb: z.object({ id: z.string() }).passthrough() }).passthrough()).default([]) });

// POST /api/player/xapi-statements
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  const orgId = user.orgId;
  const learnerId = user.id;
  if (!orgId || !learnerId) return json({ success: false, message: 'Tenant ID and Learner ID are required' });

  const { statements } = await parseBody(req, schema);
  const result = await processXAPIStatements(orgId, learnerId, statements as { verb: { id: string } }[]);
  return json({ success: true, data: result, message: 'xAPI statements processed successfully' });
});
