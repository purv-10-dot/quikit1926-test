import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { revokeConsent } from '@/lib/services/consent-service';

const schema = z.object({
  studentId: z.string(),
  consentType: z.enum(['video_recording', 'data_processing', 'photo_usage']),
  notes: z.string().optional(),
});

// POST /api/consent/revoke
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  const dto = await parseBody(req, schema);
  return json(await revokeConsent(user.tenantId as string, user.id, dto));
});
