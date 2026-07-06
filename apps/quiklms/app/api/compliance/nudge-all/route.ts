import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getNudgeUsers, sendNudgeEmails } from '@/lib/services/compliance-service';

const schema = z.object({ userIds: z.array(z.string()).optional() });

// POST /api/compliance/nudge-all — TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['TENANT_ADMIN', 'SUB_ADMIN']);
  const tenantId = user.tenantId as string;

  const body = await parseBody(req, schema);
  const nudgeUsers = await getNudgeUsers(tenantId);
  const userIdsToNudge = body.userIds || nudgeUsers.users.map((u) => u.userId);
  const result = await sendNudgeEmails(tenantId, userIdsToNudge, user.id);

  return json({
    success: result.success,
    data: { sentCount: result.sentCount, totalEligible: nudgeUsers.totalCount },
    message: `Nudge emails sent to ${result.sentCount} users`,
  });
});
