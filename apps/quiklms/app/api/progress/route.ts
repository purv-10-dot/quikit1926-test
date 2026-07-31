import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { updateProgress } from '@/lib/services/progress-service';

/**
 * Real schema, replacing `z.object({}).passthrough()` (F-003).
 *
 * `courseId` is one third of `LmsProgress`'s compound key
 * (`orgId_learnerId_courseId`). Absent, it reached the upsert as `undefined`
 * and Postgres answered with a **500** — one of the five progress routes the
 * finding calls out. It is required here so the caller gets a field-level 400
 * instead.
 *
 * Everything else stays optional and loosely typed on purpose. `status` is a
 * free string, not the `LmsProgressStatus` enum: the four callers send
 * `'completed'`, `'in_progress'`, `'Completed'` and `'In Progress'`, and
 * `deriveLifecycleStatus` already tolerates every one of them. Declaring the
 * enum would 400 three working clients. `completionPercentage` is accepted and
 * ignored — two players send it and this endpoint derives its own figure — but
 * dropping it from the schema would reject those requests outright.
 *
 * Unknown keys are stripped rather than rejected; the handler reads named
 * fields only, so stripping is exactly what an extra key already gets.
 */
const updateProgressSchema = z.object({
  courseId: z.string().min(1, 'courseId is required'),
  lessonId: z.string().optional(),
  currentPosition: z.union([z.string(), z.number()]).nullish(),
  duration: z.number().nullish(),
  percentRemaining: z.number().nullish(),
  completionPercentage: z.number().nullish(),
  status: z.string().optional(),
  scormStatus: z.string().optional(),
});

// POST /api/progress — update progress (any authenticated learner)
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  const orgId = user.orgId;
  const learnerId = user.id;
  if (!orgId || !learnerId) return json({ success: false, message: 'Tenant ID and Learner ID are required' });

  const body = await parseBody(req, updateProgressSchema) as Record<string, unknown>;
  const progress = await updateProgress({
    orgId, learnerId,
    courseId: body.courseId as string,
    lessonId: body.lessonId as string | undefined,
    currentPosition: body.currentPosition as string | number | undefined,
    duration: body.duration as number | undefined,
    percentRemaining: body.percentRemaining as number | undefined,
    status: body.status as never,
    scormStatus: body.scormStatus as string | undefined,
  });
  return json({ success: true, data: progress });
});
