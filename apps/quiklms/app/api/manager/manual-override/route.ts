import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { manualOverride } from '@/lib/services/manager-service';

/**
 * Real schema, replacing `z.object({}).passthrough()` (F-003).
 *
 * The old line cast the unvalidated body straight to
 * `{ userId: string; action: string; ... }` — a lie the compiler could not
 * check. `userId` is required because `manualOverride` looks the target up by
 * it before anything else, and `action` is an enum because the service ends in
 * `throw new Error('Invalid action')`, i.e. an unrecognised action was a
 * **500** for what is plainly a bad request.
 *
 * `courseId` and `newDueDate` stay optional, matching the service signature.
 * Both branches do need a `courseId` in practice, but tightening that here
 * would go beyond validating what the code declares.
 */
const manualOverrideSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  action: z.enum(['extend_deadline', 'manual_completion']),
  courseId: z.string().optional(),
  newDueDate: z.string().optional(),
});

// PATCH /api/manager/manual-override — MANAGER
export const PATCH = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['MANAGER']);
  const body = await parseBody(req, manualOverrideSchema);
  const result = await manualOverride(user.id, user.orgId as string, body);
  return json({ success: true, data: result, message: 'Manual override applied successfully' });
});
