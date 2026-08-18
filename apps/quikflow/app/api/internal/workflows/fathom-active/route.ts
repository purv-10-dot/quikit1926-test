import { NextResponse } from "next/server";
import { withServiceAuth } from "@/lib/api/withServiceAuth";
import { db } from "@/lib/db";
import { FATHOM_APP_SLUG } from "@/lib/catalog/fathom";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/internal/workflows/fathom-active?orgId= — service-authed probe used
 * by source apps (QuikScale's Meeting Rhythm dashboard) to learn whether an
 * ACTIVE workflow triggers off a Fathom meeting event, so their UI can adapt
 * (e.g. only show "Export Transcript" once QuikFlow will actually produce one).
 *
 * Matches the same trigger.app check `orgsWithFathomWorkflows` uses in the
 * fathom-scan worker — no action-shape requirement, since Fathom workflows
 * commonly use `quikscale.save_transcript` rather than a `calendar.*` action.
 */
export const GET = withServiceAuth(async (req) => {
  const url = new URL(req.url);
  const orgId = url.searchParams.get("orgId");
  if (!orgId) {
    return NextResponse.json({ success: false, error: "orgId is required" }, { status: 400 });
  }

  const rows = await db.wfWorkflow.findMany({
    where: { orgId, status: "Active" },
    select: { trigger: true },
  });

  const active = rows.some((wf) => {
    const trigger = (wf.trigger ?? {}) as Record<string, unknown>;
    return trigger.app === FATHOM_APP_SLUG;
  });

  return NextResponse.json({ success: true, data: { active } });
});
