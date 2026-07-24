/**
 * POST /api/logs/client-error — browser error beacon.
 *
 * Public by design: it fires precisely when the client is broken, which
 * includes "the session is gone", so it cannot require auth. That posture is
 * unchanged from the stub this replaces, as is the response contract —
 * `{ success: true }` on acceptance — because callers fire-and-forget it
 * (`api.post('/logs/client-error', …).catch(() => {})`).
 *
 * What changed: the report is now validated and actually recorded through the
 * structured logger instead of being dropped into a bare `console.warn`.
 */
import { z } from 'zod';
import { route, json, ApiError } from '@/lib/http';
import { logger, redactSensitive } from '@/lib/logger';

/**
 * Abuse guards. This endpoint is unauthenticated, so a caller could otherwise
 * push unbounded volume into the log pipeline (a cost and log-availability
 * problem, not a data breach). No external rate-limit store is involved —
 * these are pure per-request size caps.
 */
const MAX_BODY_CHARS = 16 * 1024; // whole payload
const MAX_MESSAGE_CHARS = 2_000;
const MAX_STACK_CHARS = 8_000; // stack / componentStack
const MAX_URL_CHARS = 2_048;
const MAX_UA_CHARS = 256;

/** Truncate rather than reject: a long stack is still a useful stack. */
function clip(value: string | undefined, max: number): string | undefined {
  if (value === undefined) return undefined;
  return value.length > max ? `${value.slice(0, max)}...[truncated]` : value;
}

/** Narrow an unknown (post-redaction) field back to a string. */
const str = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/**
 * `message` is the documented field, but the app's own error boundaries post
 * the message as `error` (see app/(learner)/learner/certificates/page.tsx), so
 * either satisfies the schema. Unknown keys are kept and logged separately
 * after redaction rather than silently dropped.
 */
const reportSchema = z
  .object({
    message: z.string().optional(),
    error: z.string().optional(),
    stack: z.string().optional(),
    componentStack: z.string().optional(),
    url: z.string().optional(),
    userAgent: z.string().optional(),
    page: z.string().optional(),
  })
  .passthrough()
  .refine((b) => ((b.message ?? b.error) || '').trim().length > 0, {
    message: 'Either "message" or "error" is required',
    path: ['message'],
  });

export const POST = route(async (req, _ctx, requestId) => {
  const raw = await req.text();

  if (raw.length > MAX_BODY_CHARS) {
    throw new ApiError(
      413,
      `Error report exceeds the ${MAX_BODY_CHARS}-character limit`,
      'Payload Too Large',
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new ApiError(400, 'Malformed JSON body', 'Bad Request');
  }

  // ZodError is converted to the standard 400 validation envelope by `route()`.
  const report = reportSchema.parse(parsedJson);

  // Everything below is best-effort. A logging failure must never surface to a
  // browser that is already in a failed state.
  try {
    // Redact the whole free-form body first, so a stray `password` / `token`
    // field a caller happened to include never reaches the log line.
    const {
      message,
      error,
      stack,
      componentStack,
      url,
      userAgent,
      page,
      ...extra
    } = redactSensitive(report) as Record<string, unknown>;

    logger.error('client-error report', {
      requestId,
      route: '/api/logs/client-error',
      source: 'browser',
      // Named `clientMessage` so a hostile payload can never overwrite the
      // record's own `msg` / `level` / `timestamp` fields.
      clientMessage: clip(str(message) ?? str(error), MAX_MESSAGE_CHARS),
      page: clip(str(page), MAX_URL_CHARS),
      url: clip(str(url), MAX_URL_CHARS),
      // The client's own stack is the entire point of the report, so it is kept
      // in production (unlike server-side stacks, which lib/logger.ts hides).
      clientStack: clip(str(stack), MAX_STACK_CHARS),
      componentStack: clip(str(componentStack), MAX_STACK_CHARS),
      userAgent: clip(str(userAgent) ?? req.headers.get('user-agent') ?? undefined, MAX_UA_CHARS),
      referer: clip(req.headers.get('referer') ?? undefined, MAX_URL_CHARS),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
      extra: Object.keys(extra).length > 0 ? extra : undefined,
    });
  } catch {
    // Swallow: the report is lost, the browser is not told about it.
  }

  return json({ success: true });
});
