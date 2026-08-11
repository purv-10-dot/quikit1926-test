import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { copyScreen } from "@/lib/services/screens/screen-service";

/** POST /api/screens/[id]/copy — duplicate a screen (name + " (copy)"). */
export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const created = await copyScreen(orgId, userId, params.id);
  if (!created) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: created }, { status: 201 });
});
