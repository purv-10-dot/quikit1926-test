import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasDemoData } from "@/lib/services/demoData";

/** GET /api/demo-data/status — whether this org currently has seeded demo data. */
export const GET = withOrgAuth(async ({ orgId }) => {
  const present = await hasDemoData(orgId);
  return NextResponse.json({ success: true, data: { hasDemoData: present } });
}, { fallbackErrorMessage: "Failed to check demo data status" });
