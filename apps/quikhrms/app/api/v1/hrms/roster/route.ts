import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, forbidden, validationError, internalError } from "@/lib/api-response";
import { resolveScope, employeeScopeFilter } from "@/lib/rbac/scope";
import { getHierarchyAccessibleEmployeeIds, intersectEmployeeIds } from "@/lib/rbac/hierarchy";
import { createRosterSchema } from "@/lib/validations/roster";
import type { Prisma } from "@quikit/database";

const DOW_NAME_TO_NUM: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
};
const MAX_DAYS = 62;

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Build inclusive list of UTC day-keys from `from` to `to`. */
function expandDays(from: Date, to: Date): { date: string; dow: number }[] {
  const out: { date: string; dow: number }[] = [];
  const cur = new Date(from);
  while (cur <= to && out.length < MAX_DAYS) {
    out.push({ date: dateKey(cur), dow: cur.getUTCDay() });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/**
 * GET /api/v1/hrms/roster?from=YYYY-MM-DD&to=YYYY-MM-DD&departmentId=...
 * Returns a read-only roster grid: accessible employees × days, with each cell
 * resolved as RosterEntry > Leave > Holiday > WeekOff(pattern) > Empty.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId } = ctx;
    const { searchParams } = new URL(req.url);
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");
    const departmentId = searchParams.get("departmentId");

    if (!fromStr || !toStr) return validationError("from and to dates are required");
    const from = new Date(`${fromStr}T00:00:00.000Z`);
    const to = new Date(`${toStr}T00:00:00.000Z`);
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || to < from) {
      return validationError("Invalid date range");
    }

    // Access control: scope (all/team/self) ∩ role-priority hierarchy.
    const scope = resolveScope(ctx, {
      all: "hrms.roster.read",
      team: "hrms.roster.read_team",
      self: "hrms.roster.read_self",
    });
    const scopeFilter = await employeeScopeFilter(ctx, scope);
    if (!scopeFilter.allow) return forbidden("No roster read permission");
    const hierarchy = await getHierarchyAccessibleEmployeeIds(ctx);
    const finalIds = intersectEmployeeIds(scopeFilter.employeeIds, hierarchy);

    const days = expandDays(from, to);
    const rangeEnd = days.length ? new Date(`${days[days.length - 1].date}T00:00:00.000Z`) : to;

    const empWhere: Prisma.EmployeeWhereInput = {
      orgId,
      deletedAt: null,
      ...(departmentId && { departmentId }),
      ...(finalIds && { id: { in: finalIds } }),
    };

    const [employees, shifts, holidays, company] = await Promise.all([
      prisma.employee.findMany({
        where: empWhere,
        select: {
          id: true, firstName: true, lastName: true, employeeCode: true,
          weeklyOffDays: true,
          department: { select: { id: true, name: true } },
        },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      }),
      prisma.shiftPolicy.findMany({
        where: { orgId, deletedAt: null },
        select: { id: true, name: true, code: true, color: true, startTime: true, endTime: true },
        orderBy: { name: "asc" },
      }),
      prisma.companyHoliday.findMany({
        where: { orgId, deletedAt: null, date: { gte: from, lte: rangeEnd } },
        select: { name: true, date: true },
      }),
      prisma.companySettings.findUnique({ where: { orgId }, select: { workWeek: true } }),
    ]);

    // Company profile week-offs (days NOT in the working `workWeek`) — the org
    // default used when an employee has no personal weekly-off pattern set.
    const companyOff = ((): number[] => {
      const ww = company?.workWeek;
      if (!Array.isArray(ww) || ww.length === 0) return [];
      const working = new Set(
        (ww as unknown[])
          .map((d) => (typeof d === "string" ? DOW_NAME_TO_NUM[d] : undefined))
          .filter((n): n is number => n !== undefined),
      );
      return working.size ? [0, 1, 2, 3, 4, 5, 6].filter((n) => !working.has(n)) : [];
    })();

    const employeeIds = employees.map((e) => e.id);

    const [entries, leaves, rosters] = await Promise.all([
      employeeIds.length
        ? prisma.rosterEntry.findMany({
            where: { orgId, deletedAt: null, employeeId: { in: employeeIds }, date: { gte: from, lte: rangeEnd } },
            select: {
              employeeId: true, date: true, type: true, note: true,
              shift: { select: { id: true, name: true, code: true, color: true, startTime: true, endTime: true } },
            },
          })
        : Promise.resolve([]),
      employeeIds.length
        ? prisma.leaveRequest.findMany({
            where: {
              orgId, deletedAt: null, status: "Approved",
              employeeId: { in: employeeIds },
              startDate: { lte: rangeEnd }, endDate: { gte: from },
            },
            select: { employeeId: true, startDate: true, endDate: true, leaveType: { select: { name: true } } },
          })
        : Promise.resolve([]),
      prisma.roster.findMany({
        where: { orgId, deletedAt: null, periodStart: { lte: rangeEnd }, periodEnd: { gte: from }, ...(departmentId && { departmentId }) },
        select: { id: true, name: true, status: true, periodStart: true, periodEnd: true },
        orderBy: { periodStart: "desc" },
      }),
    ]);

    // Index overlays for O(1) lookup.
    const holidayByDate = new Map<string, string>();
    for (const h of holidays) holidayByDate.set(dateKey(h.date), h.name);

    const entryByKey = new Map<string, (typeof entries)[number]>();
    for (const e of entries) entryByKey.set(`${e.employeeId}|${dateKey(e.date)}`, e);

    // employeeId -> set of leave day-keys (with leave type name)
    const leaveByKey = new Map<string, string>();
    for (const lv of leaves) {
      const s = new Date(lv.startDate);
      const e = new Date(lv.endDate);
      for (const d of days) {
        const dd = new Date(`${d.date}T00:00:00.000Z`);
        if (dd >= s && dd <= e) leaveByKey.set(`${lv.employeeId}|${d.date}`, lv.leaveType?.name ?? "Leave");
      }
    }

    const dayMeta = days.map((d) => ({
      date: d.date,
      dow: d.dow,
      isHoliday: holidayByDate.has(d.date),
      holidayName: holidayByDate.get(d.date) ?? null,
    }));

    const rows = employees.map((emp) => {
      const ownOff = Array.isArray(emp.weeklyOffDays)
        ? (emp.weeklyOffDays as unknown[])
            .map((n) => (typeof n === "string" ? DOW_NAME_TO_NUM[n] : typeof n === "number" ? n : undefined))
            .filter((n): n is number => n !== undefined)
        : [];
      // Employee's own weekly-offs win; otherwise fall back to the company profile.
      const offNums = ownOff.length ? ownOff : companyOff;
      const cells: Record<string, unknown> = {};
      for (const d of days) {
        const entry = entryByKey.get(`${emp.id}|${d.date}`);
        const leaveName = leaveByKey.get(`${emp.id}|${d.date}`);
        if (entry) {
          cells[d.date] = {
            type: entry.type,
            shiftId: entry.shift?.id ?? null,
            shiftName: entry.shift?.name ?? null,
            shiftCode: entry.shift?.code ?? null,
            shiftColor: entry.shift?.color ?? null,
            shiftStart: entry.shift?.startTime ?? null,
            shiftEnd: entry.shift?.endTime ?? null,
            note: entry.note ?? null,
            source: "roster",
          };
        } else if (leaveName) {
          cells[d.date] = { type: "Leave", leaveTypeName: leaveName, source: "leave" };
        } else if (holidayByDate.has(d.date)) {
          cells[d.date] = { type: "Holiday", holidayName: holidayByDate.get(d.date), source: "holiday" };
        } else if (offNums.includes(d.dow)) {
          cells[d.date] = { type: "WeekOff", source: "pattern" };
        } else {
          cells[d.date] = { type: "Empty", source: "none" };
        }
      }
      return {
        id: emp.id,
        name: `${emp.firstName} ${emp.lastName}`.trim(),
        employeeCode: emp.employeeCode,
        department: emp.department?.name ?? null,
        weeklyOffDays: offNums,
        cells,
      };
    });

    return successResponse({
      from: fromStr,
      to: dayMeta.length ? dayMeta[dayMeta.length - 1].date : toStr,
      days: dayMeta,
      shifts,
      employees: rows,
      rosters,
    });
  } catch (error) {
    console.error("GET /roster error:", error);
    return internalError();
  }
});

/** POST /api/v1/hrms/roster — create a Draft roster. */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId, userId, permissions } = ctx;
    if (!(permissions.includes("*") || permissions.includes("hrms.roster.manage"))) {
      return forbidden("No roster manage permission");
    }
    const body = await req.json();
    const parsed = createRosterSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    // Reject overlapping rosters for the same department scope — two rosters over
    // the same dates would produce ambiguous cells and conflicting attendance.
    const deptScope = parsed.data.departmentId || null;
    const overlap = await prisma.roster.findFirst({
      where: {
        orgId, deletedAt: null,
        departmentId: deptScope,
        periodStart: { lte: parsed.data.periodEnd },
        periodEnd: { gte: parsed.data.periodStart },
      },
      select: { name: true },
    });
    if (overlap) {
      return validationError(`This period overlaps an existing roster "${overlap.name}" for the same department. Edit that one or pick non-overlapping dates.`);
    }

    const roster = await prisma.roster.create({
      data: {
        orgId,
        name: parsed.data.name,
        departmentId: parsed.data.departmentId || null,
        periodStart: parsed.data.periodStart,
        periodEnd: parsed.data.periodEnd,
        status: "Draft",
        createdBy: userId,
        updatedBy: userId,
      },
    });
    return successResponse(roster, undefined, 201);
  } catch (error) {
    console.error("POST /roster error:", error);
    return internalError();
  }
});
