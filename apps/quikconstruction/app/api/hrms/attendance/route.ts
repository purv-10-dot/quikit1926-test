import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { attendanceUpsertSchema } from "@/lib/schemas/hrms";

const withTenantAuth = withTenantAuthForModule("hrms");

export const GET = withTenantAuth(async ({ tenantId }, req) => {
  const date = req.nextUrl.searchParams.get("date");
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const employeeId = req.nextUrl.searchParams.get("employeeId") || undefined;
  const where: Record<string, unknown> = { tenantId, ...(employeeId ? { employeeId } : {}) };
  if (date) where.date = new Date(date);
  else if (from && to) where.date = { gte: new Date(from), lte: new Date(to) };
  const list = await db.cnAttendance.findMany({
    where,
    include: { employee: { select: { id: true, empCode: true, firstName: true, lastName: true } } },
    orderBy: [{ date: "desc" }, { employee: { empCode: "asc" } }],
  });
  return NextResponse.json({ success: true, data: list });
});

/**
 * POST /api/hrms/attendance — upsert attendance rows for a given date.
 * One tx. Deletes prior rows for same (tenantId, employeeId, date) then inserts.
 */
export const POST = withTenantAuth(async ({ tenantId, userId }, req) => {
  const input = attendanceUpsertSchema.parse(await req.json());
  const date = new Date(input.date);
  const employeeIds = input.rows.map(r => r.employeeId);
  await db.$transaction([
    db.cnAttendance.deleteMany({ where: { tenantId, date, employeeId: { in: employeeIds } } }),
    db.cnAttendance.createMany({
      data: input.rows.map(r => ({
        tenantId, date, employeeId: r.employeeId,
        projectId: r.projectId ?? null, status: r.status,
        hoursWorked: r.hoursWorked ?? null, remarks: r.remarks ?? null,
        createdBy: userId,
      })),
    }),
  ]);
  return NextResponse.json({ success: true, data: { count: input.rows.length } }, { status: 201 });
});
