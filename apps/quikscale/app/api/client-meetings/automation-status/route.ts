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
 * Tells the Client Master form whether an ACTIVE QuikFlow calendar automation
 * exists for the "client created" trigger. When true, the form surfaces the
 * Teams-meeting scheduling model; when false (no workflow, or QuikFlow
 * unreachable/unconfigured) the form behaves exactly as today. The OAuth +
 * workflow state live in QuikFlow, so this proxies there with the shared secret.
 * Always degrades to `calendarAutomation: false` — it must never break the form.
 */
export const GET = auth.view(async ({ orgId }) => {
  try {
    const quikflowUrl = process.env.QUIKFLOW_URL;
    const secret = process.env.INTERNAL_SECRET;
    if (!quikflowUrl || !secret || process.env.QUIKFLOW_EVENTS_ENABLED !== "true") {
      return NextResponse.json({ success: true, data: { calendarAutomation: false } });
    }

    const qs = new URLSearchParams({ orgId, app: "quikscale", event: CLIENT_CREATED_EVENT });
    const res = await fetch(`${quikflowUrl}/api/internal/workflows/active?${qs.toString()}`, {
      headers: { "x-internal-secret": secret },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as
      | { success?: boolean; data?: { active?: boolean } }
      | null;
    const active = res.ok && json?.success ? Boolean(json.data?.active) : false;
    return NextResponse.json({ success: true, data: { calendarAutomation: active } });
  } catch (error: unknown) {
    // Never surface a failure to the form — degrade to "no automation".
    void toErrorMessage(error, "");
    return NextResponse.json({ success: true, data: { calendarAutomation: false } });
  }
});
