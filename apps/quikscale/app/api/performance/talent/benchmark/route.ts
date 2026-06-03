import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { DEFAULT_BENCHMARK } from "@/lib/schemas/talentSchema";
import { z } from "zod";

const withOrgAuth = withOrgAuthForModule("people.talent");

const ADMIN_ROLES = new Set(["org_admin", "admin", "super_admin"]);

async function isOrgAdmin(userId: string, orgId: string, isSuperAdmin: boolean): Promise<boolean> {
  if (isSuperAdmin) return true;
  const m = await db.orgMember.findFirst({
    where: { userId, orgId, status: "active" },
    select: { role: true },
  });
  return m ? ADMIN_ROLES.has(m.role) : false;
}

export const GET = withOrgAuth(async ({ orgId }) => {
  const row = await db.talentBenchmark.findUnique({ where: { orgId } });
  return NextResponse.json({
    success: true,
    data: {
      perfCut:      row?.perfCut ?? DEFAULT_BENCHMARK.perfCut,
      potentialCut: row?.potentialCut ?? DEFAULT_BENCHMARK.potentialCut,
      isDefault:    !row,
      updatedAt:    row?.updatedAt ?? null,
    },
  });
});

const benchmarkSchema = z.object({
  perfCut:      z.number().int().min(0).max(100),
  potentialCut: z.number().int().min(0).max(100),
});

export const PUT = withOrgAuth(async ({ orgId, userId, session }, request) => {
  const admin = await isOrgAdmin(userId, orgId, Boolean(session?.user?.isSuperAdmin));
  if (!admin) {
    return NextResponse.json(
      { success: false, error: "Only org admins can change talent benchmarks" },
      { status: 403 },
    );
  }

  const parsed = benchmarkSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const row = await db.talentBenchmark.upsert({
    where: { orgId },
    create: { orgId, perfCut: parsed.data.perfCut, potentialCut: parsed.data.potentialCut, updatedBy: userId },
    update: { perfCut: parsed.data.perfCut, potentialCut: parsed.data.potentialCut, updatedBy: userId },
  });

  return NextResponse.json({
    success: true,
    data: { perfCut: row.perfCut, potentialCut: row.potentialCut, isDefault: false, updatedAt: row.updatedAt },
  });
});
