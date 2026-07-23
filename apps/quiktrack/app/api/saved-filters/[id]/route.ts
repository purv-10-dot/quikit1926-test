import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import {
  getSavedFilter,
  updateSavedFilter,
  deleteSavedFilter,
} from "@/lib/services/savedFilters";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  criteria: z.record(z.unknown()).optional(),
  visibility: z.enum(["private", "org", "space", "user"]).optional(),
  viewerIds: z.array(z.string().min(1)).max(200).optional(),
});

export const GET = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  try {
    const data = await getSavedFilter(orgId, userId, params.id);
    if (!data) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

export const PATCH = withOrgAuth<{ id: string }>(async ({ orgId, userId }, req: NextRequest, { params }) => {
  try {
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const data = await updateSavedFilter(orgId, userId, params.id, parsed.data);
    if (!data) {
      return NextResponse.json({ success: false, error: "Not found or not editable" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

export const DELETE = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  try {
    const ok = await deleteSavedFilter(orgId, userId, params.id);
    if (!ok) {
      return NextResponse.json({ success: false, error: "Not found or not deletable" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { id: params.id } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
