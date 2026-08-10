/**
 * Platform support tickets raised from QuikChat.
 *
 *   GET  — the caller's OWN tickets (Settings → Support Status)
 *   POST — raise a new ticket (floating Support panel)
 *
 * The query itself lives in `@quikit/shared/supportTickets` and is identical in
 * every app; this file only supplies QuikChat's auth guard and slug.
 *
 * No `moduleKey`: a user who has been locked out of a module must still be able
 * to report that they are locked out. `withOrgAuth` still enforces the central
 * session + a selected org, so this is not an open endpoint.
 *
 * The response body uses the platform-wide `{ success, data, meta }` envelope
 * rather than QuikChat's bare `{ error }` shape — the Support widget is a shared
 * component consumed identically by every app, so the contract is the widget's,
 * not this app's.
 */

import { withOrgAuth } from "@/lib/orgAuth";
import {
  createSupportTicket,
  listSupportTickets,
  parseSupportListQuery,
} from "@quikit/shared/supportTickets";

const APP_SLUG = "quikchat";

export const GET = withOrgAuth(async (req, { orgId, userId }) => {
  const query = parseSupportListQuery(new URL(req.url).searchParams);
  const result = await listSupportTickets({ orgId, userId, ...query });
  if (!result.ok) {
    return Response.json({ success: false, error: result.error }, { status: result.status });
  }
  return Response.json({
    success: true,
    data: result.data.tickets,
    meta: result.data.meta,
  });
});

export const POST = withOrgAuth(async (req, { orgId, userId }) => {
  const result = await createSupportTicket({
    orgId,
    userId,
    appSlug: APP_SLUG,
    body: await req.json().catch(() => null),
  });
  if (!result.ok) {
    return Response.json({ success: false, error: result.error }, { status: result.status });
  }
  return Response.json({ success: true, data: result.data }, { status: result.status });
});
