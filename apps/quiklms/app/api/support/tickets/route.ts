/**
 * Platform support tickets raised from QuikLMS.
 *
 *   GET  — the caller's OWN tickets (Settings → Support Status)
 *   POST — raise a new ticket (floating Support panel)
 *
 * The query itself lives in `@quikit/shared/supportTickets` and is identical in
 * every app; this file only supplies QuikLMS's auth guard and slug.
 *
 * Deliberately NOT permission-gated: a user locked out of a module must still
 * be able to report that they are locked out. `requireAuth` still enforces the
 * central session and the org entitlement gate, so this is not an open
 * endpoint. It is available to EVERY role — learner, parent, teacher and
 * admin alike. Creation is rate-limited inside `createSupportTicket` (10/hour
 * per user, shared across every app).
 *
 * The body uses the platform-wide `{ success, data, meta }` envelope rather
 * than QuikLMS's bare payload shape — the Support widget is a shared component
 * consumed identically by every app, so the contract is the widget's.
 */

import { route, json, BadRequest } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import {
  createSupportTicket,
  listSupportTickets,
  parseSupportListQuery,
} from '@quikit/shared/supportTickets';

const APP_SLUG = 'quiklms';

export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  if (!actor.orgId) throw BadRequest('Tenant ID required');

  const query = parseSupportListQuery(req.nextUrl.searchParams);
  const result = await listSupportTickets({ orgId: actor.orgId, userId: actor.id, ...query });
  if (!result.ok) return json({ success: false, error: result.error }, result.status);

  return json({ success: true, data: result.data.tickets, meta: result.data.meta });
});

export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  if (!actor.orgId) throw BadRequest('Tenant ID required');

  const result = await createSupportTicket({
    orgId: actor.orgId,
    userId: actor.id,
    appSlug: APP_SLUG,
    body: await req.json().catch(() => null),
  });
  if (!result.ok) return json({ success: false, error: result.error }, result.status);

  return json({ success: true, data: result.data }, result.status);
});
