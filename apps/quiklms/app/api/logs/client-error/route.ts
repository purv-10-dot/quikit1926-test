import { route, json } from '@/lib/http';

// POST /api/logs/client-error — swallow client-side error reports (no-op)
export const POST = route(async (req) => {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  // eslint-disable-next-line no-console
  console.warn('[logs/client-error]', body);
  return json({ success: true });
});
