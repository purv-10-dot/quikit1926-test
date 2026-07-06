import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { updateChecklistItemSchema } from "@/lib/validation/checklist";
import { updateItem, softDeleteItem } from "@/lib/checklist/queries";

export const PATCH = withOrgAuth<{ itemId: string }>(async ({ orgId, userId }, req, { params }) => {
  const parsed = updateChecklistItemSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const n = await updateItem(orgId, userId, params.itemId, parsed.data);
  if (n === 0) {
    return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: { id: params.itemId } });
});

export const DELETE = withOrgAuth<{ itemId: string }>(async ({ orgId, userId }, _req, { params }) => {
  const n = await softDeleteItem(orgId, userId, params.itemId);
  if (n === 0) {
    return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: { id: params.itemId } });
});
