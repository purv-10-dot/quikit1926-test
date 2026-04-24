import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("safety");

const createSchema = z.object({
  templateName: z.string().min(1),
  checklistDate: z.string().min(1),
  projectId: z.string().optional().nullable(),
  completedBy: z.string().min(1),
  items: z.array(z.object({ item: z.string(), ok: z.boolean(), remarks: z.string().optional() })),
  remarks: z.string().optional().nullable(),
});

export const GET = withTenantAuth(async ({ tenantId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const list = await db.cnSafetyChecklist.findMany({
    where: { tenantId, deletedAt: includeDeleted ? { not: null } : null },
    include: { project: { select: { id: true, name: true, code: true } } },
    orderBy: { checklistDate: "desc" },
  });
  return NextResponse.json({ success: true, data: list });
});

export const POST = withTenantAuth(async ({ tenantId, userId }, req) => {
  const input = createSchema.parse(await req.json());
  const fails = input.items.filter(i => !i.ok).length;
  const overallStatus = fails === 0 ? "pass" : fails === input.items.length ? "fail" : "partial";
  const c = await db.cnSafetyChecklist.create({
    data: {
      tenantId,
      templateName: input.templateName,
      checklistDate: new Date(input.checklistDate),
      projectId: input.projectId ?? null,
      completedBy: input.completedBy,
      items: input.items,
      overallStatus,
      remarks: input.remarks ?? null,
      createdBy: userId,
    },
  });
  return NextResponse.json({ success: true, data: c }, { status: 201 });
});
