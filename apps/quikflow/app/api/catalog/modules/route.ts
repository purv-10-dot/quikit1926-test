import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { MODULE_APP, MODULES } from "@/lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/catalog/modules — module discovery (doc §6.1 · C2). Lists every
 * QuikScale module QuikFlow knows, with capabilities + readability, for the
 * builder's module picker. Pure registry data; org-authed for consistency.
 */
export const GET = withOrgAuth(async () => {
  const data = {
    app: MODULE_APP,
    modules: MODULES.map((m) => ({
      key: m.key,
      label: m.label,
      recordNoun: m.recordNoun,
      capabilities: m.capabilities,
      readable: m.binding.readable,
      counts: { fields: m.fields.length, events: m.events.length, actions: m.actionIds.length },
    })),
  };
  return NextResponse.json({ success: true, data });
});
