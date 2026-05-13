import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

const createSchema = z.object({
  category: z.enum(["question", "comment", "bug", "improvement"]),
  content: z.string().min(1).max(4000),
  projectId: z.string().min(1).optional(),
  contactOk: z.boolean().optional(),
  researchOk: z.boolean().optional(),
  url: z.string().max(500).optional(),
});

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;
  const entry = await db.qtFeedback.create({
    data: {
      orgId,
      userId,
      projectId: parsed.data.projectId ?? null,
      category: parsed.data.category,
      content: parsed.data.content,
      contactOk: parsed.data.contactOk ?? false,
      researchOk: parsed.data.researchOk ?? false,
      url: parsed.data.url ?? null,
      userAgent,
    },
    select: { id: true, createdAt: true },
  });
  return NextResponse.json({ success: true, data: entry }, { status: 201 });
});
