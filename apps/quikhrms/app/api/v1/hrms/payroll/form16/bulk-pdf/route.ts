import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { validationError, internalError } from "@/lib/api-response";
import { fyBounds, loadPartB, buildPdf } from "@/lib/services/form16-pdf";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const url = new URL(req.url);
    const fy = url.searchParams.get("fy");
    if (!fy) return validationError("fy parameter required (e.g. fy=2026-27)");

    const { start, end } = fyBounds(fy);

    // Find every employee with at least one released payslip in this FY.
    // Skip employees without PAN — Form 16 is invalid without it.
    const released = await prisma.payslip.findMany({
      where: {
        orgId, deletedAt: null, status: "Released",
        periodStart: { gte: start }, periodEnd: { lte: end },
      },
      select: { employeeId: true },
      distinct: ["employeeId"],
    });
    const employeeIds = released.map((r) => r.employeeId);

    if (employeeIds.length === 0) {
      return validationError(`No released payslips found for FY ${fy}`);
    }

    const employees = await prisma.employee.findMany({
      where: { orgId, deletedAt: null, id: { in: employeeIds } },
      select: { id: true, employeeCode: true, panNumber: true },
    });

    const zip = new JSZip();
    const skipped: { employeeCode: string; reason: string }[] = [];
    let included = 0;

    for (const emp of employees) {
      if (!emp.panNumber) {
        skipped.push({ employeeCode: emp.employeeCode, reason: "PAN missing" });
        continue;
      }
      const data = await loadPartB(orgId, emp.id, fy);
      if (!data) {
        skipped.push({ employeeCode: emp.employeeCode, reason: "No released payslips" });
        continue;
      }
      const pdf = await buildPdf(data);
      const fileName = `Form16-PartB-${emp.employeeCode}-FY${fy}.pdf`;
      zip.file(fileName, pdf);
      included++;
    }

    if (skipped.length > 0) {
      const manifestLines = [
        `Form 16 Part B — Bulk Export — FY ${fy}`,
        `Generated: ${new Date().toISOString()}`,
        `Included: ${included}`,
        `Skipped: ${skipped.length}`,
        "",
        "Skipped employees:",
        ...skipped.map((s) => `  - ${s.employeeCode}: ${s.reason}`),
      ];
      zip.file("README.txt", manifestLines.join("\n"));
    }

    const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const fileName = `Form16-PartB-FY${fy}.zip`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
        "X-Bulk-Included": String(included),
        "X-Bulk-Skipped": String(skipped.length),
      },
    });
  } catch (e) {
    console.error("GET /payroll/form16/bulk-pdf error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.read", "hrms.settings.write"] });
