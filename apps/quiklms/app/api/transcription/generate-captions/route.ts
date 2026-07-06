import { z } from 'zod';
import { route, BadRequest, ApiError } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';

/**
 * POST /api/transcription/generate-captions — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
 *
 * STUBBED: the legacy handler downloads the lesson's audio/video, runs OpenAI
 * Whisper transcription, writes a .vtt to S3, and patches the lesson's captions
 * array. Whisper transcription + large media download is a worker-side concern
 * (Phase 4) and must not run inside a request handler. Validation + auth/roles
 * are preserved; the heavy work returns 501 until the worker lands.
 */
const schema = z.object({
  courseId: z.string(),
  moduleId: z.string().optional(),
  lessonId: z.string(),
  language: z.string().optional(),
  isMasterCourse: z.boolean().optional(),
});

export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const dto = await parseBody(req, schema);

  if (!dto.courseId || !dto.lessonId) throw BadRequest('courseId and lessonId are required');
  if (!dto.isMasterCourse && !dto.moduleId) throw BadRequest('moduleId is required for tenant courses');

  throw new ApiError(
    501,
    'Caption generation runs in the transcription worker (Phase 4) and is not available via this route.',
    'Not Implemented',
  );
});
