import { NextResponse } from "next/server";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { toErrorMessage } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const auth = withOrgAuthForResource("clientMeetings.clients", "ClientMaster");

const CLIENT_CREATED_EVENT = "clientMaster.created";

/**
 * GET /api/client-meetings/automation-status
 *
 * Tells the Client Master form (a) whether a Microsoft Teams calendar is
 * CONNECTED — which enables the "Create Teams meetings" model + button — and (b)
 * whether an active QuikFlow calendar workflow exists (auto-on-save). OAuth +
 * workflow state live in QuikFlow, so this proxies there with the shared secret.
 * Always degrades to all-false — it must never break the form.
 */
export const GET = auth.view(async ({ orgId }) => {
  const disabled = { calendarConnected: false, calendarAutomation: false };
  try {
    const quikflowUrl = process.env.QUIKFLOW_URL;
    const secret = process.env.INTERNAL_SECRET;
    if (!quikflowUrl || !secret || process.env.QUIKFLOW_EVENTS_ENABLED !== "true") {
      return NextResponse.json({ success: true, data: disabled });
    }
    const headers = { "x-internal-secret": secret };

    const [connRes, wfRes] = await Promise.all([
      fetch(`${quikflowUrl}/api/internal/calendar/connected?${new URLSearchParams({ orgId })}`, {
        headers,
        cache: "no-store",
      }),
      fetch(
        `${quikflowUrl}/api/internal/workflows/active?${new URLSearchParams({ orgId, app: "quikscale", event: CLIENT_CREATED_EVENT })}`,
        { headers, cache: "no-store" },
      ),
    ]);
    const connJson = (await connRes.json().catch(() => null)) as { success?: boolean; data?: { connected?: boolean } } | null;
    const wfJson = (await wfRes.json().catch(() => null)) as { success?: boolean; data?: { active?: boolean } } | null;

    return NextResponse.json({
      success: true,
      data: {
        calendarConnected: connRes.ok && connJson?.success ? Boolean(connJson.data?.connected) : false,
        calendarAutomation: wfRes.ok && wfJson?.success ? Boolean(wfJson.data?.active) : false,
      },
    });
  } catch (error: unknown) {
    void toErrorMessage(error, "");
    return NextResponse.json({ success: true, data: disabled });
  }
});
