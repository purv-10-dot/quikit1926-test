import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("safety");

const createSchema = z.object({
  incidentNumber: z.string().min(1).max(50),
  projectId: z.string().optional().nullable(),
  incidentDate: z.string().min(1),
  category: z.enum(["injury", "near_miss", "property_damage", "environmental", "other"]),
  severity: z.enum(["low", "medium", "high", "critical"]).default("low"),
  title: z.string().min(1).max(300),
  description: z.string().optional().nullable(),
  reportedBy: z.string().min(1),
});

export const GET = withOrgAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const list = await db.cnSafetyIncident.findMany({
    where: { orgId, deletedAt: includeDeleted ? { not: null } : null },
    include: { project: { select: { id: true, name: true, code: true } } },
    orderBy: { incidentDate: "desc" },
  });
  return NextResponse.json({ success: true, data: list });
});

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const input = createSchema.parse(await req.json());
  const dup = await db.cnSafetyIncident.findFirst({ where: { orgId, incidentNumber: input.incidentNumber, deletedAt: null }, select: { id: true } });
  if (dup) return NextResponse.json({ success: false, error: `Incident '${input.incidentNumber}' already exists` }, { status: 409 });
  const i = await db.cnSafetyIncident.create({
    data: {
      orgId,
      incidentNumber: input.incidentNumber,
      projectId: input.projectId ?? null,
      incidentDate: new Date(input.incidentDate),
      category: input.category, severity: input.severity,
      title: input.title, description: input.description ?? null,
      reportedBy: input.reportedBy, status: "open",
      createdBy: userId,
    },
  });
  return NextResponse.json({ success: true, data: i }, { status: 201 });
});
