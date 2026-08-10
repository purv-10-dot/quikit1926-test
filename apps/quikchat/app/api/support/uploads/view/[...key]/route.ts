/**
 * Attachment viewer.
 *
 * Rows store the GCS object KEY, never a URL — bucket objects are private and
 * signed URLs expire in minutes, so a persisted URL would be dead on arrival.
 * This route re-signs on every request and redirects.
 *
 * Tenant isolation: the key layout is `support/<orgId>/<yyyy-mm>/<file>` and
 * `handleSupportAttachmentView` rejects anything whose org segment isn't the
 * caller's, with a 404 rather than a 403 so the route is not an existence
 * oracle for other tenants' keys.
 */

import { withOrgAuth } from "@/lib/orgAuth";
import { handleSupportAttachmentView } from "@quikit/shared/supportAttachments";

export const GET = withOrgAuth(async (_req, { orgId }, params) => {
  // Next passes a catch-all segment as a string[], but this wrapper's params
  // are typed `Record<string, string>` — so the value is narrowed to `string`
  // at compile time while being an array at runtime. Handle both rather than
  // trusting either: `String(["a","b"])` would silently yield "a,b".
  const raw = (params as Record<string, string | string[]>).key;
  const segments = (Array.isArray(raw) ? raw : String(raw ?? "").split("/")).filter(Boolean);

  const result = await handleSupportAttachmentView({ orgId, keySegments: segments });
  if (!result.ok) {
    return Response.json({ success: false, error: result.error }, { status: result.status });
  }
  return Response.redirect(result.data);
});
