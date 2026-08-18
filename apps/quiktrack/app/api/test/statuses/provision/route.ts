import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";
import {
  ensureTestStatuses,
  ensureTestTemplates,
  missingTemplateKinds,
  missingTestStatusKeys,
} from "@/lib/services/testStatusProvisioning";
import { serverError } from "@/lib/test/gate";

/**
 * GET  /api/test/statuses/provision — what QuikTest config this org is missing
 * POST /api/test/statuses/provision — create it ("Restore missing defaults")
 *
 * Covers BOTH org-wide catalogues, because both broke the same way: the statuses and
 * the four case templates were each seeded with a `CROSS JOIN quikit."Org"`, i.e. a
 * one-shot over the orgs that existed when the migration ran. An org created later
 * had neither — statuses failed loudly on run creation, templates failed quietly by
 * falling back to the STEPS layout.
 *
 * Normally unnecessary: project creation provisions both, and run creation and the
 * templates endpoint each backstop their own. This exists for the case where
 * something was deleted, and so the state is inspectable rather than only
 * discoverable by hitting an error.
 *
 * Admin-gated: it writes org-wide configuration, not project data.
 */

/**
 * Admin gate for both handlers.
 *
 * The GET is gated as well as the POST: it reports which org-wide configuration is
 * MISSING, which is administrative information about the tenant's health, not
 * something an ordinary member needs. `RequirePerm adminOnly` on the page is a
 * client-side guard over the UI — it hides the panel, it does not protect the
 * endpoint, so a direct request would still have answered.
 *
 * NOTE: `GET /api/test/statuses` and `GET /api/test/templates` are deliberately NOT
 * admin-gated. Those return the catalogue itself, which the runner's status picker
 * and the case editor need for every member — gating them would break test
 * execution. Only the "what is missing" report is admin-only.
 */
async function denyNonAdmin(
  userId: string,
  orgId: string,
): Promise<NextResponse | null> {
  if (await hasAdminAccess(userId, orgId)) return null;
  return NextResponse.json(
    { success: false, error: "You don't have access to this." },
    { status: 403 },
  );
}

export const GET = withOrgAuth(async ({ orgId, userId }) => {
  try {
    const denied = await denyNonAdmin(userId, orgId);
    if (denied) return denied;

    const [statuses, templates] = await Promise.all([
      missingTestStatusKeys(orgId),
      missingTemplateKinds(orgId),
    ]);
    return NextResponse.json({
      success: true,
      data: {
        missing: statuses,
        missingTemplates: templates,
        complete: statuses.length === 0 && templates.length === 0,
      },
    });
  } catch (error: unknown) {
    return serverError(error);
  }
});

export const POST = withOrgAuth(async ({ orgId, userId }) => {
  try {
    const denied = await denyNonAdmin(userId, orgId);
    if (denied) return denied;

    // Sequential rather than parallel: both write, and a shared failure is easier
    // to reason about when the order is fixed.
    const statuses = await ensureTestStatuses(orgId);
    const templates = await ensureTestTemplates(orgId);

    return NextResponse.json({
      success: true,
      data: {
        created: statuses.created,
        createdTemplates: templates.created,
        alreadyComplete: statuses.alreadyComplete && templates.alreadyComplete,
      },
    });
  } catch (error: unknown) {
    return serverError(error);
  }
});
