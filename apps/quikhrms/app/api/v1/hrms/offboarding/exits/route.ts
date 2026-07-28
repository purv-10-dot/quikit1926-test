import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import type { Prisma } from "@quikit/database";

/**
 * GET /api/v1/hrms/offboarding/exits — read-only tracker of fully-exited
 * employees (Employee.status = "Relieved"), joined with their offboarding
 * record for the exit reason/dates + exit-interview state. Search + pagination.
 * Read-only view: no mutations here.
 */
export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const search = searchParams.get("search")?.trim();

    const where: Prisma.EmployeeWhereInput = {
      orgId,
      status: "Relieved", // fully-exited only
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { workEmail: { contains: search, mode: "insensitive" } },
          { employeeCode: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        orderBy: { lastWorkingDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          displayName: true,
          workEmail: true,
          jobTitle: true,
          employmentType: true,
          workLocation: true,
          dateOfJoining: true,
          lastWorkingDate: true,
          department: { select: { name: true } },
          designation: { select: { title: true } },
          reportingManager: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.employee.count({ where }),
    ]);

    // Latest offboarding record per employee → reason / dates / exit-interview.
    const empIds = employees.map((e) => e.id);
    const offb = empIds.length
      ? await prisma.offboardingInstance.findMany({
          where: { orgId, employeeId: { in: empIds } },
          orderBy: { createdAt: "desc" },
          select: {
            employeeId: true, reason: true, status: true,
            resignationDate: true, lastWorkingDate: true,
            exitInterviewDone: true, exitInterviewAt: true, notes: true,
          },
        })
      : [];
    const offbByEmp = new Map<string, (typeof offb)[number]>();
    for (const o of offb) if (!offbByEmp.has(o.employeeId)) offbByEmp.set(o.employeeId, o);

    const tenureMonths = (from: Date | null, to: Date | null) => {
      if (!from) return null;
      const end = to ?? new Date();
      return Math.max(0, (end.getFullYear() - from.getFullYear()) * 12 + (end.getMonth() - from.getMonth()));
    };

    const rows = employees.map((e) => {
      const o = offbByEmp.get(e.id);
      const lwd = e.lastWorkingDate ?? o?.lastWorkingDate ?? null;
      return {
        id: e.id,
        name: e.displayName ?? `${e.firstName} ${e.lastName ?? ""}`.trim(),
        employeeCode: e.employeeCode,
        workEmail: e.workEmail ?? "",
        department: e.department?.name ?? "",
        designation: e.designation?.title ?? e.jobTitle ?? "",
        employmentType: e.employmentType ?? "",
        workLocation: e.workLocation ?? "",
        reportingManager: e.reportingManager
          ? `${e.reportingManager.firstName} ${e.reportingManager.lastName ?? ""}`.trim()
          : "",
        dateOfJoining: e.dateOfJoining ?? null,
        lastWorkingDate: lwd,
        tenureMonths: tenureMonths(e.dateOfJoining, lwd),
        reason: o?.reason ?? "",
        offboardingStatus: o?.status ?? "",
        resignationDate: o?.resignationDate ?? null,
        exitInterviewDone: o?.exitInterviewDone ?? false,
        exitInterviewAt: o?.exitInterviewAt ?? null,
        notes: o?.notes ?? "",
      };
    });

    return successResponse(rows, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /offboarding/exits error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.employee.read", "hrms.offboarding.read"], anyPermission: true });
