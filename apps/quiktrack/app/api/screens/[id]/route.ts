import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import {
  getScreen,
  updateScreenMeta,
  replaceScreenConfig,
  deleteScreen,
} from "@/lib/services/screens/screen-service";

/** GET /api/screens/[id] — a screen with its tabs + ordered fields. */
export const GET = withOrgAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const screen = await getScreen(orgId, params.id);
  if (!screen) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: screen });
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  tabs: z
    .array(z.object({ name: z.string().trim().max(120), fieldKeys: z.array(z.string()) }))
    .optional(),
});

/**
 * PATCH /api/screens/[id] — update meta (name/description) and/or replace the
 * whole tab/field structure (the Configure page save).
 */
export const PATCH = withOrgAuth<{ id: string }>(async ({ orgId, userId }, req: NextRequest, { params }) => {
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    if (parsed.data.name != null || parsed.data.description !== undefined) {
      const meta = await updateScreenMeta(orgId, userId, params.id, {
        name: parsed.data.name,
        description: parsed.data.description,
      });
      if (!meta) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (parsed.data.tabs) {
      const cfg = await replaceScreenConfig(orgId, userId, params.id, parsed.data.tabs);
      if (!cfg) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { id: params.id } });
  } catch (error: unknown) {
    const message = error instanceof Error && error.message.includes("Unique")
      ? "A screen with that name already exists."
      : error instanceof Error ? error.message : "Failed to update screen";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
});

/** DELETE /api/screens/[id] — soft-delete (the Default Screen can't be deleted). */
export const DELETE = withOrgAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const result = await deleteScreen(orgId, params.id);
  if (result === "not_found") return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (result === "is_default") {
    return NextResponse.json({ success: false, error: "The Default Screen can't be deleted." }, { status: 400 });
  }
  return NextResponse.json({ success: true, data: { id: params.id } });
});
