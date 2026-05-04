import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { projectCreateSchema } from "@/lib/schemas/masters-phase2";

const withTenantAuth = withTenantAuthForModule("masters");

export const GET = withTenantAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const projects = await db.cnProject.findMany({
    where: { orgId, deletedAt: includeDeleted ? { not: null } : null },
    include: {
      company: { select: { id: true, name: true } },
      client: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ success: true, data: projects });
});

export const POST = withTenantAuth(async ({ orgId, userId }, req) => {
  const body = await req.json();
  const input = projectCreateSchema.parse(body);
  // FK validation
  const company = await db.cnCompany.findFirst({
    where: { id: input.companyId, orgId },
    select: { id: true },
  });
  if (!company) {
    return NextResponse.json({ success: false, error: "Company not found" }, { status: 400 });
  }
  if (input.clientId) {
    const client = await db.cnCustomer.findFirst({
      where: { id: input.clientId, orgId },
      select: { id: true },
    });
    if (!client) {
      return NextResponse.json({ success: false, error: "Client (Customer) not found" }, { status: 400 });
    }
  }
  const conflict = await db.cnProject.findFirst({
    where: { orgId, code: input.code, deletedAt: null },
    select: { id: true },
  });
  if (conflict) {
    return NextResponse.json(
      { success: false, error: `Project code '${input.code}' already exists` },
      { status: 409 },
    );
  }
  const project = await db.cnProject.create({
    data: {
      ...input,
      ...(input.startDate ? { startDate: new Date(input.startDate) } : {}),
      ...(input.expectedEndDate ? { expectedEndDate: new Date(input.expectedEndDate) } : {}),
      ...(input.actualEndDate ? { actualEndDate: new Date(input.actualEndDate) } : {}),
      orgId,
      createdBy: userId,
    },
  });
  return NextResponse.json({ success: true, data: project }, { status: 201 });
});
