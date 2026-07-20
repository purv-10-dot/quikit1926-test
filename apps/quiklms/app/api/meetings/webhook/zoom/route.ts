import { route, json } from '@/lib/http';
import {
  verifyZoomUrlValidation,
  verifyZoomWebhookSignature,
  handleZoomWebhook,
} from '@/lib/services/meetings-service';

/**
 * POST /api/meetings/webhook/zoom — public by construction (middleware
 * short-circuits every /api path before the auth factory), so the HMAC IS the
 * authentication.
 *
 * SIGNATURE VERIFICATION IS NEW. The NestJS original accepted any POST from
 * anyone: it took an `authHeader` param and never checked it. Because
 * `handleZoomWebhook` resolves meetings by `externalMeetingId` with no orgId,
 * that let an unauthenticated caller end — or attach recording URLs to — any
 * tenant's meeting. Every event is now verified against Zoom's
 * `v0:{timestamp}:{rawBody}` HMAC before it can touch the database.
 *
 * The body is read as TEXT, not `req.json()`: the HMAC covers the exact bytes
 * Zoom signed, and re-serialising a parsed object would not reproduce them.
 */
export const POST = route(async (req) => {
  const raw = await req.text();

  if (!verifyZoomWebhookSignature(raw, req.headers.get('x-zm-signature'), req.headers.get('x-zm-request-timestamp'))) {
    // 401, not 200: a rejected event must be visible to Zoom's retry/disable
    // logic and to us, rather than silently swallowed.
    return json({ success: false, message: 'Invalid webhook signature' }, 401);
  }

  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return json({ success: false, message: 'Malformed webhook body' }, 400);
  }

  const event = body.event as string | undefined;
  const payload = body.payload as Record<string, unknown> | undefined;

  if (event === 'endpoint.url_validation') {
    const plainToken = (payload as { plainToken?: string } | undefined)?.plainToken || '';
    return json(verifyZoomUrlValidation(plainToken), 200);
  }

  if (event && payload) {
    return json(await handleZoomWebhook(event, payload), 200);
  }
  return json({ received: true }, 200);
});
