import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("Employee");

const schema = z.object({ ids: z.array(z.string()) });

export const POST = auth.delete(async ({ orgId }, req) => {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const { count } = await db.astEmployee.deleteMany({
    where: { orgId, id: { in: parsed.data.ids } },
  });
  return NextResponse.json({ success: true, data: { deleted: count } });
});
