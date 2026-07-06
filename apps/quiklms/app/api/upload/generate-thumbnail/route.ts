import { z } from 'zod';
import { route, BadRequest, ApiError } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';

/**
 * POST /api/upload/generate-thumbnail — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
 *
 * STUBBED: the legacy handler called OpenAI DALL-E (and stubbed Stability /
 * Leonardo) to generate course thumbnails. Outbound image-generation is a
 * worker/integration concern; auth/roles + validation are preserved here.
 */
const schema = z.object({
  courseTitle: z.string(),
  courseCategory: z.string().optional(),
  provider: z.string().optional(),
  count: z.number().optional(),
  apiKey: z.string().optional(),
});

export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const dto = await parseBody(req, schema);
  if (dto.provider && dto.provider !== 'openai') {
    throw BadRequest(`${dto.provider} integration coming soon`);
  }
  throw new ApiError(
    501,
    'AI thumbnail generation is not available in this build (OpenAI DALL-E integration pending).',
    'Not Implemented',
  );
});
