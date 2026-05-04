import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { opspUpsertSchema, opspFinalizeSchema } from "@/lib/schemas/opspSchema";
import { writeAuditLog } from "@/lib/api/auditLog";
import { validationError } from "@/lib/api/validationError";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("opsp");

/* ── GET: load OPSP data for current user + year + quarter ── */
export const GET = withTenantAuth(async ({ orgId, userId }, req) => {
  const { searchParams } = req.nextUrl;
  const year    = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
  const quarter = searchParams.get("quarter") ?? "Q1";

  // Fetch fiscalYearStart from tenant
  const org = await db.org.findUnique({
    where: { id: orgId },
    select: { fiscalYearStart: true },
  });

  const data = await db.oPSPData.findUnique({
    where: {
      orgId_userId_year_quarter: {
        orgId,
        userId,
        year,
        quarter,
      },
    },
  });

  return NextResponse.json({
    success: true,
    data: data ?? null,
    fiscalYearStart: org?.fiscalYearStart ?? 1,
  });
});

/* ── PUT: upsert (autosave) ── */
export const PUT = withTenantAuth(async ({ orgId, userId }, req) => {
  const parsed = opspUpsertSchema.safeParse(await req.json());
  if (!parsed.success) return validationError(parsed, "Invalid OPSP payload");
  const { year, quarter, ...fields } = parsed.data;
  const yearNum = typeof year === "number" ? year : parseInt(year);

  const data = await db.oPSPData.upsert({
    where: {
      orgId_userId_year_quarter: {
        orgId,
        userId,
        year: yearNum,
        quarter,
      },
    },
    update: {
      ...fields,
      updatedBy: userId,
    },
    create: {
      orgId,
      userId,
      year: yearNum,
      quarter,
      createdBy: userId,
      ...fields,
    },
  });

  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "UPDATE",
    entityType: "OPSPData",
    entityId: data.id,
    changes: Object.keys(fields),
  });

  return NextResponse.json({ success: true, data, savedAt: new Date().toISOString() });
});

/* ── POST: finalize ── */
export const POST = withTenantAuth(async ({ orgId, userId }, req) => {
  const parsedFinalize = opspFinalizeSchema.safeParse(await req.json());
  if (!parsedFinalize.success) return validationError(parsedFinalize, "Invalid OPSP payload");
  const { year, quarter } = parsedFinalize.data;
  const yearNum = typeof year === "number" ? year : parseInt(year);

  // Only flip draft → finalized. A "reviewed" OPSP is a stronger lock and must
  // not be downgraded back to "finalized" if Finalize is clicked again.
  const result = await db.oPSPData.updateMany({
    where: {
      orgId,
      userId,
      year: yearNum,
      quarter,
      status: "draft",
    },
    data: { status: "finalized", updatedBy: userId },
  });

  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "UPDATE",
    entityType: "OPSPData",
    entityId: `${orgId}:${userId}:${yearNum}:${quarter}`,
    changes: ["status:finalized"],
    reason: "OPSP finalized",
  });

  return NextResponse.json({ success: true, data: { count: result.count } }, { status: 201 });
});
