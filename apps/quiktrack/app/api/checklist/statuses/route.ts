import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { createChecklistStatusSchema } from "@/lib/validation/checklist";
import { listStatuses, seedDefaultStatusesIfNone, createStatus } from "@/lib/checklist/queries";

export const GET = withOrgAuth(async ({ orgId, userId }) => {
  await seedDefaultStatusesIfNone(orgId, userId);
  const statuses = await listStatuses(orgId, userId);
  return NextResponse.json({ success: true, data: statuses });
});

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const parsed = createChecklistStatusSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const status = await createStatus(orgId, userId, parsed.data.name, parsed.data.color ?? "#6b7280");
  return NextResponse.json({ success: true, data: status }, { status: 201 });
});
