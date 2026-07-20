import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { reviewIncident } from '@/lib/services/quiz-proctoring-service';

// Enums, not free-form strings. `z.string()` let a typo through Zod and into
// Postgres, which rejected it as an opaque 500 "Operation failed". (The legacy
// was wrong the other way: Mongoose skipped the validator here and silently
// persisted garbage into a forensic table used in cheating disputes.)
const schema = z.object({
  disposition: z.enum(['pending', 'dismissed', 'confirmed_violation']),
  action: z.enum(['none', 'warning', 'penalty_applied', 'session_voided']),
  remarks: z.string().optional(),
});

// PATCH /api/quiz-proctoring/:sessionId/incident — TENANT_ADMIN | SUB_ADMIN | MANAGER
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER']);
  const body = await parseBody(req, schema);
  const incident = await reviewIncident(actor, actor.id, params!.sessionId, body);
  return json({ success: true, data: incident });
});
