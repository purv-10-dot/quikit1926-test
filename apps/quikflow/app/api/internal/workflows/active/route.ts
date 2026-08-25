import { NextResponse } from "next/server";
import { withServiceAuth } from "@/lib/api/withServiceAuth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** True if a workflow's graph contains a calendar.* action node. */
function hasCalendarAction(graphNodes: unknown): boolean {
  if (!Array.isArray(graphNodes)) return false;
  return graphNodes.some((n) => {
    const node = n as { kind?: string; config?: { actionId?: unknown } };
    const actionId = node?.config?.actionId;
    return node?.kind === "action" && typeof actionId === "string" && actionId.startsWith("calendar.");
  });
}

/**
 * GET /api/internal/workflows/active?orgId=&app=&event= — service-authed probe
 * used by source apps (QuikScale's Client Master form) to learn whether an
 * ACTIVE calendar automation exists for a trigger, so their UI can adapt.
 *
 * Matches the engine's matcher exactly: org-scoped, status "Active", trigger
 * app/event equal — plus (so we report a *meeting* automation, not just any
 * workflow on that trigger) the graph must contain a `calendar.*` action.
 */
export const GET = withServiceAuth(async (req) => {
  const url = new URL(req.url);
  const orgId = url.searchParams.get("orgId");
  const app = url.searchParams.get("app");
  const event = url.searchParams.get("event");
  if (!orgId || !app || !event) {
    return NextResponse.json(
      { success: false, error: "orgId, app and event are required" },
      { status: 400 },
    );
  }

  const rows = await db.wfWorkflow.findMany({
    where: { orgId, status: "Active", deletedAt: null },
    select: { trigger: true, graphNodes: true },
  });

  const count = rows.filter((wf) => {
    const trigger = (wf.trigger ?? {}) as Record<string, unknown>;
    return trigger.app === app && trigger.event === event && hasCalendarAction(wf.graphNodes);
  }).length;

  return NextResponse.json({ success: true, data: { active: count > 0, count } });
});
