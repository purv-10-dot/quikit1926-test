import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { updateChecklistStatusSchema } from "@/lib/validation/checklist";
import { updateStatus, softDeleteStatus } from "@/lib/checklist/queries";

export const PATCH = withOrgAuth<{ statusId: string }>(async ({ orgId, userId }, req, { params }) => {
  const parsed = updateChecklistStatusSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const n = await updateStatus(orgId, userId, params.statusId, parsed.data);
  if (n === 0) {
    return NextResponse.json({ success: false, error: "Status not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: { id: params.statusId } });
});

export const DELETE = withOrgAuth<{ statusId: string }>(async ({ orgId, userId }, _req, { params }) => {
  const n = await softDeleteStatus(orgId, userId, params.statusId);
  if (n === 0) {
    return NextResponse.json({ success: false, error: "Status not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: { id: params.statusId } });
});
