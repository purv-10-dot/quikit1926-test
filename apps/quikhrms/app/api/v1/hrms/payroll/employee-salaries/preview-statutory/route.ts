import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, notFound } from "@/lib/api-response";

/**
 * Returns the **estimated** monthly statutory deductions for an employee given
 * a salary structure + annual CTC. Read-only preview used by the Assign Salary
 * modal — not the canonical compute. The actual payroll run uses
 * `lib/services/payroll-compute.ts` which handles LOP, one-time earnings,
 * carry-over, etc.
 *
 * Rules respected here:
 *   - Per-employee flags: epfApplicable / esiApplicable / ptApplicable → 0 if false
 *   - EPF: 12% on (Basic+DA) capped at ₹15,000/month (statutory)
 *   - ESI: 0.75% (employee) + 3.25% (employer) on gross, only if gross ≤ ₹21,000
 *          (₹25,000 for PwD employees) and esi.enabled
 *   - PT:  state-slab lookup against employee's officeLocation.state
 */
export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const url = new URL(req.url);
    const employeeId = url.searchParams.get("employeeId");
    const structureId = url.searchParams.get("structureId");
    const ctcStr = url.searchParams.get("ctc");
    if (!employeeId || !structureId || !ctcStr) {
      return validationError("employeeId, structureId, ctc are required");
    }
    const ctc = Number(ctcStr);
    if (!Number.isFinite(ctc) || ctc <= 0) return validationError("ctc must be a positive number");

    const [employee, structure, epfCfg, esiCfg, ptCfgs] = await Promise.all([
      prisma.employee.findFirst({
        where: { id: employeeId, orgId, deletedAt: null },
        select: {
          id: true, gender: true, isHandicapped: true,
          epfApplicable: true, esiApplicable: true, ptApplicable: true,
          officeLocation: { select: { state: true } },
        },
      }),
      prisma.salaryStructure.findFirst({
        where: { id: structureId, orgId, deletedAt: null },
        include: {
          components: {
            include: { component: { select: { category: true, code: true } } },
          },
        },
      }),
      prisma.ePFConfig.findUnique({ where: { orgId } }),
      prisma.eSIConfig.findUnique({ where: { orgId } }),
      prisma.professionalTaxConfig.findMany({
        where: { orgId, enabled: true },
      }),
    ]);

    if (!employee) return notFound("Employee not found");
    if (!structure) return notFound("Salary structure not found");

    const monthlyCTC = ctc / 12;

    // Compute monthly value of each structure component, then bucket into
    // basic / DA / gross. Mirrors the lightweight subset of payroll-compute.
    let basicMonthly = 0;
    let daMonthly = 0;
    let grossMonthly = 0;
    for (const c of structure.components) {
      const type = c.component?.category;
      let monthly = 0;
      if (c.amountType === "Fixed" && c.amountValue != null) {
        monthly = Number(c.amountValue);
      } else if (c.amountType === "PercentOfCTC" && c.amountValue != null) {
        monthly = (monthlyCTC * Number(c.amountValue)) / 100;
      } else if (c.amountType === "PercentOfBasic" && c.amountValue != null) {
        // Two-pass needed if Basic itself is %ofCTC. We assume Basic is processed first;
        // since the data isn't guaranteed ordered, approximate with current basicMonthly.
        monthly = (basicMonthly * Number(c.amountValue)) / 100;
      }
      if (type === "Basic") basicMonthly += monthly;
      if (type === "DA") daMonthly += monthly;
      // Only Earning-type components count toward gross. Deductions/StatutoryContributions don't.
      // We can't tell SalaryComponent.type here without another select; conservatively
      // include everything that's not explicitly a deduction category.
      const isDeductionLike = type && /Deduction|EPFEmployee|ESIEmployee|ProfessionalTax|LabourWelfareFund|IncomeTax/.test(type);
      if (!isDeductionLike) grossMonthly += monthly;
    }

    // ── EPF: 12% on (Basic + DA), capped at ₹15,000 wage ceiling.
    let epfEmployee = 0;
    let epfEmployer = 0;
    if (employee.epfApplicable !== false && epfCfg?.enabled) {
      const pfWage = Math.min(basicMonthly + daMonthly, 15000);
      epfEmployee = Math.round(pfWage * 0.12 * 100) / 100;
      epfEmployer = Math.round(pfWage * 0.12 * 100) / 100;
    }

    // ── ESI: 0.75%/3.25% on gross, only if gross ≤ ceiling.
    let esiEmployee = 0;
    let esiEmployer = 0;
    if (employee.esiApplicable !== false && esiCfg?.enabled) {
      const ceiling = employee.isHandicapped ? 25000 : Number(esiCfg.grossCeiling ?? 21000);
      if (grossMonthly <= ceiling) {
        esiEmployee = Math.round(grossMonthly * 0.0075 * 100) / 100;
        esiEmployer = Math.round(grossMonthly * 0.0325 * 100) / 100;
      }
    }

    // ── PT: state-slab.
    let pt = 0;
    const empState = employee.officeLocation?.state;
    if (employee.ptApplicable !== false && empState) {
      const ptCfg = ptCfgs.find((p) => p.state === empState);
      if (ptCfg?.enabled) {
        const slabs = (ptCfg.slabs as unknown as Array<{
          fromAmount: number; toAmount: number | null; taxAmount: number; gender: "All" | "Male" | "Female";
        }>) || [];
        const genderKey = employee.gender === "Female" ? "Female" : employee.gender === "Male" ? "Male" : "All";
        const applicable = slabs.find((s) =>
          (s.gender === "All" || s.gender === genderKey)
          && grossMonthly >= s.fromAmount
          && (s.toAmount == null || grossMonthly <= s.toAmount),
        );
        if (applicable && applicable.taxAmount > 0) {
          pt = Number(applicable.taxAmount);
        }
      }
    }

    return successResponse({
      basicMonthly: round(basicMonthly),
      daMonthly: round(daMonthly),
      grossMonthly: round(grossMonthly),
      epf: {
        applicable: employee.epfApplicable !== false,
        employee: epfEmployee,
        employer: epfEmployer,
      },
      esi: {
        applicable: employee.esiApplicable !== false,
        employee: esiEmployee,
        employer: esiEmployer,
      },
      pt: {
        applicable: employee.ptApplicable !== false,
        amount: pt,
        state: empState ?? null,
      },
    });
  } catch (e) {
    console.error("GET /payroll/employee-salaries/preview-statutory error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.read", "hrms.settings.write"], anyPermission: true });

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
