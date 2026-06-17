import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, notFound } from "@/lib/api-response";
import { upsertForm12BBSchema } from "@/lib/validations/payroll";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { createAuditLog } from "@/lib/utils/audit";
import { Prisma } from "@quikit/database";
import { notifyHrPayrollTeam, sendEmployeeAcknowledgment } from "@/lib/services/form12bb-notify";
import { syncInvestmentProofsFromForm12BB } from "@/lib/services/form12bb-to-proofs";

export const GET = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const url = new URL(req.url);
    const fy = url.searchParams.get("fy");
    const adminAll = url.searchParams.get("scope") === "all";

    if (adminAll) {
      const list = await prisma.form12BBDeclaration.findMany({
        where: { orgId, deletedAt: null, ...(fy ? { financialYear: fy } : {}) },
        orderBy: { createdAt: "desc" },
      });
      const empIds = [...new Set(list.map((r) => r.employeeId))];
      const employees = empIds.length
        ? await prisma.employee.findMany({
            where: { orgId, deletedAt: null, id: { in: empIds } },
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          })
        : [];
      const map = new Map(employees.map((e) => [e.id, e]));
      return successResponse(list.map((r) => ({ ...r, employee: map.get(r.employeeId) ?? null })));
    }

    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return notFound("Employee not found");

    const where: Record<string, unknown> = { orgId, employeeId, deletedAt: null };
    if (fy) where.financialYear = fy;
    const items = await prisma.form12BBDeclaration.findMany({
      where,
      orderBy: { financialYear: "desc" },
    });
    return successResponse(items);
  } catch (e) {
    console.error("GET /payroll/form12bb error:", e);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return notFound("Employee not found");

    const body = await req.json();
    const parsed = upsertForm12BBSchema.safeParse(body);
    if (!parsed.success) {
      // superRefine on the schema emits nested paths like ["documents","hra"].
      // flatten() drops those, so send raw issues + use the first message as
      // the top-level human-readable error.
      const issues = parsed.error.issues.map((i) => ({
        path: i.path.map((p) => String(p)).join("."),
        message: i.message,
      }));
      return validationError(issues[0]?.message ?? "Validation failed", { issues });
    }

    // otherDeductions + documents: Prisma rejects raw `null` for JSON columns —
    // use the typed sentinel. Strip both from the spread to set explicitly.
    const { otherDeductions, documents, verificationDate, ...rest } = parsed.data;
    const otherDeductionsValue =
      otherDeductions === null || otherDeductions === undefined
        ? Prisma.JsonNull
        : (otherDeductions as Prisma.InputJsonValue);
    const documentsValue =
      documents === null || documents === undefined
        ? Prisma.JsonNull
        : (documents as unknown as Prisma.InputJsonValue);
    const verificationDateValue = verificationDate ? new Date(verificationDate) : null;

    const record = await prisma.form12BBDeclaration.upsert({
      where: { orgId_employeeId_financialYear: { orgId, employeeId, financialYear: parsed.data.financialYear } },
      update: {
        ...rest,
        otherDeductions: otherDeductionsValue,
        documents: documentsValue,
        verificationDate: verificationDateValue,
        updatedBy: userId,
      },
      create: {
        orgId,
        employeeId,
        ...rest,
        otherDeductions: otherDeductionsValue,
        documents: documentsValue,
        verificationDate: verificationDateValue,
        createdBy: userId,
        updatedBy: userId,
      },
    });
    await createAuditLog({
      orgId, userId, action: "Update", entityType: "Form12BBDeclaration", entityId: record.id,
      changes: parsed.data, request: req,
    });

    // ── Notify HR + acknowledge employee ─────────────────────────────
    // Fire-and-forget. Both helpers swallow their own errors so a flaky
    // SMTP or notification insert can never break a successful submit.
    const docs = (parsed.data.documents ?? {}) as {
      hra?: unknown[]; lta?: unknown[]; homeLoan?: unknown[]; chapterVIA?: unknown[];
    };
    const declSummary = {
      id: record.id,
      financialYear: record.financialYear,
      hraClaimed: record.hraClaimed,
      rentPaid: Number(record.rentPaid),
      ltaClaimed: record.ltaClaimed,
      ltaAmount: Number(record.ltaAmount),
      homeLoanInterest: Number(record.homeLoanInterest),
      chapterVIATotal:
        Number(record.section80C) + Number(record.section80CCC) + Number(record.section80CCD1) +
        Number(record.section80D) + Number(record.section80E) + Number(record.section80G) +
        Number(record.section80TTA) + Number(record.nps80CCD1B),
      signedFileUrl: record.signedFileUrl,
      documentCounts: {
        hra:        Array.isArray(docs.hra)        ? docs.hra.length        : 0,
        lta:        Array.isArray(docs.lta)        ? docs.lta.length        : 0,
        homeLoan:   Array.isArray(docs.homeLoan)   ? docs.homeLoan.length   : 0,
        chapterVIA: Array.isArray(docs.chapterVIA) ? docs.chapterVIA.length : 0,
      },
    };

    const submitterEmployee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, firstName: true, lastName: true, employeeCode: true, workEmail: true },
    });
    if (submitterEmployee) {
      const submitter = {
        employeeId: submitterEmployee.id,
        name: `${submitterEmployee.firstName} ${submitterEmployee.lastName}`,
        employeeCode: submitterEmployee.employeeCode,
        workEmail: submitterEmployee.workEmail,
      };
      await Promise.all([
        notifyHrPayrollTeam(orgId, declSummary, submitter),
        sendEmployeeAcknowledgment(orgId, declSummary, submitter),
        syncInvestmentProofsFromForm12BB({
          orgId,
          employeeId,
          financialYear: record.financialYear,
          decl: {
            rentPaid: Number(record.rentPaid),
            hraClaimed: record.hraClaimed,
            ltaAmount: Number(record.ltaAmount),
            ltaClaimed: record.ltaClaimed,
            homeLoanInterest: Number(record.homeLoanInterest),
            section80C: Number(record.section80C),
            section80CCC: Number(record.section80CCC),
            section80CCD1: Number(record.section80CCD1),
            nps80CCD1B: Number(record.nps80CCD1B),
            section80D: Number(record.section80D),
            section80E: Number(record.section80E),
            section80G: Number(record.section80G),
            section80TTA: Number(record.section80TTA),
          },
          documents: (parsed.data.documents ?? {}) as Parameters<typeof syncInvestmentProofsFromForm12BB>[0]["documents"],
          userId,
        }),
      ]);
    }

    return successResponse(record);
  } catch (e) {
    console.error("POST /payroll/form12bb error:", e);
    return internalError();
  }
});
