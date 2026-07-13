import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { grantConsent } from '@/lib/services/consent-service';

const schema = z.object({
  studentId: z.string(),
  consentType: z.enum(['video_recording', 'data_processing', 'photo_usage']),
  consentVersion: z.string().optional(),
  notes: z.string().optional(),
});

// POST /api/consent/grant
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  const dto = await parseBody(req, schema);
  const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
  return json(await grantConsent(user.orgId as string, user.id, dto, ipAddress));
});
