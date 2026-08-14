import { NextResponse } from "next/server";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { toErrorMessage } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const withOrgAuth = withOrgAuthForModule("clientMeetings.dashboard");

/**
 * GET /api/client-meetings/transcript-workflow-status
 *
 * Tells the Meeting Rhythm dashboard whether an Active QuikFlow workflow
 * triggers off a Fathom meeting event, so the "Export Transcript" button only
 * shows once QuikFlow will actually produce a transcript to export. Workflow
 * state lives in QuikFlow, so this proxies there with the shared secret.
 * Always degrades to false — it must never break the dashboard.
 */
export const GET = withOrgAuth(async ({ orgId }) => {
  try {
    const quikflowUrl = process.env.QUIKFLOW_URL;
    const secret = process.env.INTERNAL_SECRET;
    if (!quikflowUrl || !secret || process.env.QUIKFLOW_EVENTS_ENABLED !== "true") {
      return NextResponse.json({ success: true, data: { hasWorkflow: false } });
    }

    const res = await fetch(
      `${quikflowUrl}/api/internal/workflows/fathom-active?${new URLSearchParams({ orgId })}`,
      { headers: { "x-internal-secret": secret }, cache: "no-store" },
    );
    const json = (await res.json().catch(() => null)) as { success?: boolean; data?: { active?: boolean } } | null;

    return NextResponse.json({
      success: true,
      data: { hasWorkflow: res.ok && json?.success ? Boolean(json.data?.active) : false },
    });
  } catch (error: unknown) {
    void toErrorMessage(error, "");
    return NextResponse.json({ success: true, data: { hasWorkflow: false } });
  }
});
