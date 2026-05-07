import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";

const schema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export const POST = withProjectAccess<{ id: string }>(
  async ({ projectId }, req) => {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }

    const owned = await db.qtIssueStatus.findMany({
      where: { projectId, id: { in: parsed.data.orderedIds }, isDeleted: false },
      select: { id: true },
    });
    if (owned.length !== parsed.data.orderedIds.length) {
      return NextResponse.json(
        { success: false, error: "Some statuses not found in project" },
        { status: 400 },
      );
    }

    await db.$transaction(
      parsed.data.orderedIds.map((id, idx) =>
        db.qtIssueStatus.update({ where: { id }, data: { orderIndex: idx } }),
      ),
    );
    return NextResponse.json({ success: true, data: { count: parsed.data.orderedIds.length } });
  },
  { paramKey: "id", requireRoles: ["PROJECT_ADMIN"] },
);
