import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createDonationSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const url = new URL(req.url);
    const fy = url.searchParams.get("fy");
    const status = url.searchParams.get("status");
    const employeeId = url.searchParams.get("employeeId");

    const list = await prisma.donation.findMany({
      where: {
        orgId, deletedAt: null,
        ...(fy ? { financialYear: fy } : {}),
        ...(status ? { status: status as never } : {}),
        ...(employeeId ? { employeeId } : {}),
      },
      orderBy: { donationDate: "desc" },
    });
    const empIds = [...new Set(list.map((d) => d.employeeId))];
    const employees = empIds.length
      ? await prisma.employee.findMany({
          where: { orgId, deletedAt: null, id: { in: empIds } },
          select: { id: true, employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } } },
        })
      : [];
    const empMap = new Map(employees.map((e) => [e.id, e]));
    const rows = list.map((d) => ({ ...d, employee: empMap.get(d.employeeId) ?? null }));
    return successResponse(rows);
  } catch (e) {
    console.error("GET /payroll/giving error:", e);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createDonationSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const d = parsed.data;

    const exemptAmount = (d.amount * d.exemptionPercent) / 100;

    const record = await prisma.donation.create({
      data: {
        orgId,
        employeeId: d.employeeId,
        financialYear: d.financialYear,
        donorPAN: d.donorPAN ?? null,
        doneeName: d.doneeName,
        doneePAN: d.doneePAN ?? null,
        section: d.section,
        donationDate: new Date(d.donationDate),
        amount: d.amount,
        exemptionPercent: d.exemptionPercent,
        qualifyingLimit: d.qualifyingLimit ?? null,
        exemptAmount,
        receiptNumber: d.receiptNumber ?? null,
        fileUrl: d.fileUrl ?? null,
        notes: d.notes ?? null,
        status: "Submitted",
        createdBy: userId,
        updatedBy: userId,
      },
    });
    await createAuditLog({ orgId, userId, action: "Create", entityType: "Donation", entityId: record.id, changes: d });
    return successResponse(record, undefined, 201);
  } catch (e) {
    console.error("POST /payroll/giving error:", e);
    return internalError();
  }
});
