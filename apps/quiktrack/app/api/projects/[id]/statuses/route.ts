import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";

export const GET = withProjectAccess<{ id: string }>(
  async ({ projectId }) => {
    const statuses = await db.qtIssueStatus.findMany({
      where: { projectId, isDeleted: false },
      orderBy: { orderIndex: "asc" },
    });
    return NextResponse.json({ success: true, data: statuses });
  },
  { paramKey: "id" },
);

const createSchema = z.object({
  name: z.string().min(1).max(60),
  color: z.string().regex(/^#([0-9a-fA-F]{6})$/).optional(),
  category: z.enum(["BACKLOG", "IN_PROGRESS", "DONE"]),
});

export const POST = withProjectAccess<{ id: string }>(
  async ({ projectId }, req) => {
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }

    const last = await db.qtIssueStatus.findFirst({
      where: { projectId, isDeleted: false },
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true },
    });

    const status = await db.qtIssueStatus.create({
      data: {
        projectId,
        name: parsed.data.name,
        color: parsed.data.color ?? "#94a3b8",
        category: parsed.data.category,
        orderIndex: (last?.orderIndex ?? -1) + 1,
      },
    });
    return NextResponse.json({ success: true, data: status }, { status: 201 });
  },
  { paramKey: "id", requireRoles: ["PROJECT_ADMIN"] },
);
