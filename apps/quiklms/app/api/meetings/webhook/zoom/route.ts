import { route, json } from '@/lib/http';
import { verifyZoomUrlValidation, handleZoomWebhook } from '@/lib/services/meetings-service';

// POST /api/meetings/webhook/zoom — @Public (no auth). Always responds 200.
// Zoom signs requests; the URL-validation challenge is answered with an HMAC of
// the plainToken using ZOOM_WEBHOOK_SECRET_TOKEN.
export const POST = route(async (req) => {
  let body: Record<string, any> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (body?.event === 'endpoint.url_validation') {
    return json(verifyZoomUrlValidation(body.payload?.plainToken || ''), 200);
  }

  const event = body?.event;
  const payload = body?.payload;
  if (event && payload) {
    return json(await handleZoomWebhook(event, payload), 200);
  }
  return json({ received: true }, 200);
});
