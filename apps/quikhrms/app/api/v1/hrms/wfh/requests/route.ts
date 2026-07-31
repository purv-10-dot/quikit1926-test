import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, notFound, conflict, forbidden } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { createWfhSchema } from "@/lib/validations/wfh";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildWfhNoticeEmail } from "@/lib/email-templates/wfh-notice";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { resolveEffectiveWfhQuotaGroup } from "@/lib/services/wfh-quota";
import { APP_ID, rolePriority } from "@/lib/rbac/registry";
import { resolveApprovalChainLevels } from "@/lib/services/approval-chain";

/** Thrown inside the create transaction to signal a concurrent-safe guard failure. */
class WfhGuardError extends Error {
  constructor(public kind: "OVERLAP" | "QUOTA") { super(kind); }
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId, userId } = ctx;
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const status = searchParams.get("status");
    const scope = searchParams.get("scope") ?? "me"; // me | team | all

    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return notFound("Employee record not found");

    const where: Record<string, unknown> = { orgId, deletedAt: null };
    if (status) where.status = status;

    if (scope === "me") {
      where.employeeId = employeeId;
    } else if (scope === "team") {
      // Team view: your direct reports only (self-limiting — safe for any caller).
      const reports = await prisma.employee.findMany({
        where: { orgId, deletedAt: null, reportingManagerId: employeeId },
        select: { id: true },
      });
      where.employeeId = { in: [...reports.map((r) => r.id), employeeId] };
    } else {
      // scope=all → org-wide HR/admin view. Restricted to admins / HR (employee.read).
      const canSeeAll =
        ctx.permissions.includes("*") ||
        ctx.roleCode === "admin" ||
        ctx.permissions.includes("hrms.employee.read");
      if (!canSeeAll) return forbidden("You can only view your own or your team's WFH requests");
      // no employee filter
    }

    const [items, total] = await Promise.all([
      prisma.wfhRequest.findMany({
        where, orderBy: { appliedOn: "desc" }, skip: (page - 1) * limit, take: limit,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, jobTitle: true, department: { select: { name: true } } } },
          approvals: {
            orderBy: { level: "asc" },
            include: { approver: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
          },
        },
      }),
      prisma.wfhRequest.count({ where }),
    ]);

    return successResponse(items, paginationMeta(page, limit, total));
  } catch (e) {
    console.error("GET /wfh/requests", e);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return notFound("Employee record not found");

    const body = await req.json().catch(() => ({}));
    const parsed = createWfhSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const data = parsed.data;

    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (start.getTime() < today.getTime()) return validationError("Start date cannot be in the past");

    const oneDay = 24 * 60 * 60 * 1000;
    let days: number;
    if (data.isHalfDay) days = 0.5;
    else days = Math.floor((end.getTime() - start.getTime()) / oneDay) + 1;

    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, orgId, deletedAt: null },
      select: {
        id: true, firstName: true, lastName: true, employeeCode: true, jobTitle: true,
        reportingManagerId: true, dateOfJoining: true, status: true,
        department: { select: { name: true } },
        appRoles: { select: { role: { select: { name: true } } } },
      },
    });
    if (!employee) return notFound("Employee record not found");
    const employeeRoleName = employee.appRoles[0]?.role.name ?? null;

    // Overlap guard: reject if these dates clash with an existing Pending/Approved
    // WFH request — prevents double-booking the same days and duplicate submits.
    const wfhClash = await prisma.wfhRequest.findFirst({
      where: {
        orgId, employeeId, deletedAt: null,
        status: { in: ["Pending", "Approved"] },
        startDate: { lte: end },
        endDate: { gte: start },
      },
      select: { startDate: true, endDate: true },
    });
    if (wfhClash) {
      const fmt = (d: Date) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      return conflict(`You already have a WFH request for ${fmt(wfhClash.startDate)} – ${fmt(wfhClash.endDate)} that overlaps these dates.`);
    }

    // Yearly quota enforcement (effective group = explicit > department mapping)
    const effective = await resolveEffectiveWfhQuotaGroup(orgId, employeeId);
    if (effective.group) {
      const yearStart = new Date(start.getFullYear(), 0, 1);
      const yearEnd = new Date(start.getFullYear() + 1, 0, 1);
      const usedRows = await prisma.wfhRequest.findMany({
        where: {
          orgId, employeeId, deletedAt: null,
          status: { in: ["Pending", "Approved"] },
          startDate: { gte: yearStart, lt: yearEnd },
        },
        select: { days: true },
      });
      const used = usedRows.reduce((sum, r) => sum + Number(r.days), 0);
      if (used + days > effective.group.yearlyQuota) {
        return validationError(
          `WFH quota exceeded. Group "${effective.group.name}" allows ${effective.group.yearlyQuota} days/year. Already used: ${used}, remaining: ${Math.max(0, effective.group.yearlyQuota - used)}.`,
        );
      }

      // ── Per-group WFH rules ────────────────────────────────────────────
      const g = effective.group;

      if (g.advanceNoticeDays && g.advanceNoticeDays > 0) {
        const minStart = new Date(today);
        minStart.setDate(minStart.getDate() + g.advanceNoticeDays);
        if (start.getTime() < minStart.getTime()) {
          return validationError(`WFH must be requested at least ${g.advanceNoticeDays} day(s) in advance.`);
        }
      }

      if (g.applicableAfterDays && g.applicableAfterDays > 0 && employee.dateOfJoining) {
        const eligibleFrom = new Date(employee.dateOfJoining);
        eligibleFrom.setDate(eligibleFrom.getDate() + g.applicableAfterDays);
        if (today.getTime() < eligibleFrom.getTime()) {
          return validationError(`You're eligible for WFH ${g.applicableAfterDays} day(s) after your joining date.`);
        }
      }

      if (g.blockedDuringNotice && employee.status === "OnNotice") {
        return validationError("Employees on notice period can't avail WFH.");
      }

      if (g.maxConsecutiveDays && g.maxConsecutiveDays > 0 && days > g.maxConsecutiveDays) {
        return validationError(`WFH can be at most ${g.maxConsecutiveDays} consecutive day(s) per request.`);
      }

      // Count existing Pending/Approved WFH days by the window the request starts in.
      const countUsed = async (from: Date, to: Date) => {
        const rows = await prisma.wfhRequest.findMany({
          where: { orgId, employeeId, deletedAt: null, status: { in: ["Pending", "Approved"] }, startDate: { gte: from, lte: to } },
          select: { days: true },
        });
        return rows.reduce((s, r) => s + Number(r.days), 0);
      };

      if (g.maxPerWeek && g.maxPerWeek > 0) {
        const ws = new Date(start);
        ws.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday
        ws.setHours(0, 0, 0, 0);
        const we = new Date(ws);
        we.setDate(ws.getDate() + 6);
        we.setHours(23, 59, 59, 999);
        const usedWeek = await countUsed(ws, we);
        if (usedWeek + days > g.maxPerWeek) {
          return validationError(`WFH limit is ${g.maxPerWeek} day(s) per week (already used ${usedWeek} that week).`);
        }
      }

      if (g.maxPerMonth && g.maxPerMonth > 0) {
        const ms = new Date(start.getFullYear(), start.getMonth(), 1);
        const me = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
        const usedMonth = await countUsed(ms, me);
        if (usedMonth + days > g.maxPerMonth) {
          return validationError(`WFH limit is ${g.maxPerMonth} day(s) per month (already used ${usedMonth} that month).`);
        }
      }
    }

    // Admins follow the chain too — WFH never auto-approves.
    const autoApprove = false;

    type FlowRow = { approverId: string; role: "Manager" | "HR" | "SuperAdmin"; approverName: string; approverEmail: string | null };
    let flow: FlowRow[] = [];

    // ── Approver resolution ──────────────────────────────────────────────
    // 1) Central Approval Chain (Settings → Approval Chains → "Work From Home")
    //    wins when an active chain is configured for this org. Levels map to
    //    the WfhApproverRole display enum (level 1 → Manager, rest → HR).
    // 2) No central chain → legacy role/hierarchy fallback (reporting manager
    //    then HR, or SuperAdmin for employees above HR-admin priority).
    const centralWfh = await resolveApprovalChainLevels(orgId, "WFH", employee.id);
    if (centralWfh.ok) {
      const approverEmps = await prisma.employee.findMany({
        where: { orgId, id: { in: centralWfh.levels.map((l) => l.approverId) } },
        select: { id: true, firstName: true, lastName: true, workEmail: true },
      });
      const byId = new Map(approverEmps.map((e) => [e.id, e]));
      flow = centralWfh.levels.map((lv, idx) => {
        const e = byId.get(lv.approverId);
        return {
          approverId: lv.approverId,
          role: (idx === 0 ? "Manager" : "HR") as FlowRow["role"],
          approverName: e ? `${e.firstName} ${e.lastName}`.trim() : "",
          approverEmail: e?.workEmail ?? null,
        };
      });
    } else if (centralWfh.reason !== "NOT_CONFIGURED") {
      // Chain exists but is unresolvable (e.g. no active user for a level) —
      // fail loudly rather than silently reverting to the legacy path.
      return validationError(centralWfh.message);
    } else {
      // Legacy fallback. Priorities live in the static ROLE_PRIORITY map.
      const hrAdminPriority = rolePriority("admin");

      const hrApprovers = await prisma.hrmsUserAppRole.findMany({
        where: {
          orgId: orgId,
          role: { appId: APP_ID, name: { in: ["admin"] } },
          userId: { not: employee.id },
          employee: { orgId, deletedAt: null, status: "Active" },
        },
        select: {
          userId: true,
          role: { select: { name: true } },
          employee: { select: { id: true, firstName: true, lastName: true, workEmail: true } },
        },
      });
      hrApprovers.sort((a, b) => rolePriority(b.role.name) - rolePriority(a.role.name));
      const hrApprover = hrApprovers[0]?.employee ?? null;

      const superAdminLink = await prisma.hrmsUserAppRole.findFirst({
        where: {
          orgId: orgId,
          role: { appId: APP_ID, name: "admin" },
          userId: { not: employee.id },
          employee: { orgId, deletedAt: null, status: "Active" },
        },
        select: { employee: { select: { id: true, firstName: true, lastName: true, workEmail: true } } },
      });
      const superAdminApprover = superAdminLink?.employee ?? null;

      const empPriority = rolePriority(employeeRoleName);
      const isSuperAdminEmployee = employeeRoleName === "admin";
      const isAboveHr = !isSuperAdminEmployee && empPriority > hrAdminPriority;

      if (isAboveHr) {
        if (!superAdminApprover) return validationError("No Super Admin approver configured");
        flow.push({
          approverId: superAdminApprover.id,
          role: "SuperAdmin",
          approverName: `${superAdminApprover.firstName} ${superAdminApprover.lastName}`.trim(),
          approverEmail: superAdminApprover.workEmail,
        });
      } else {
        // Exclude a self-referential reportingManagerId so an employee who is
        // (mis)configured as their own manager can't become their own approver.
        if (employee.reportingManagerId && employee.reportingManagerId !== employee.id) {
          const mgr = await prisma.employee.findFirst({
            where: { id: employee.reportingManagerId, orgId, deletedAt: null },
            select: { id: true, firstName: true, lastName: true, workEmail: true },
          });
          if (mgr) {
            flow.push({
              approverId: mgr.id,
              role: "Manager",
              approverName: `${mgr.firstName} ${mgr.lastName}`.trim(),
              approverEmail: mgr.workEmail,
            });
          }
        }
        if (!hrApprover) return validationError("No HR approver configured");
        flow.push({
          approverId: hrApprover.id,
          role: "HR",
          approverName: `${hrApprover.firstName} ${hrApprover.lastName}`.trim(),
          approverEmail: hrApprover.workEmail,
        });
      }
    }

    // Atomic guard: re-check overlap AND yearly quota INSIDE the transaction
    // right before the insert, so two concurrent applies can't both slip past
    // the earlier checks and exceed the quota / double-book the same dates.
    let wfh;
    try {
      wfh = await prisma.$transaction(async (tx) => {
        const clash = await tx.wfhRequest.findFirst({
          where: {
            orgId, employeeId, deletedAt: null,
            status: { in: ["Pending", "Approved"] },
            startDate: { lte: end }, endDate: { gte: start },
          },
          select: { id: true },
        });
        if (clash) throw new WfhGuardError("OVERLAP");

        if (effective.group) {
          const yearStart = new Date(start.getFullYear(), 0, 1);
          const yearEnd = new Date(start.getFullYear() + 1, 0, 1);
          const rows = await tx.wfhRequest.findMany({
            where: {
              orgId, employeeId, deletedAt: null,
              status: { in: ["Pending", "Approved"] },
              startDate: { gte: yearStart, lt: yearEnd },
            },
            select: { days: true },
          });
          const used = rows.reduce((sum, r) => sum + Number(r.days), 0);
          if (used + days > effective.group.yearlyQuota) throw new WfhGuardError("QUOTA");
        }

        const created = await tx.wfhRequest.create({
          data: {
            orgId, employeeId,
            startDate: start, endDate: end,
            days, isHalfDay: data.isHalfDay, session: data.session,
            reason: data.reason,
            attachments: data.attachments ? JSON.parse(JSON.stringify(data.attachments)) : null,
            status: autoApprove ? "Approved" : "Pending",
            createdBy: userId, updatedBy: userId,
          },
        });
        if (flow.length > 0) {
          await tx.wfhApproval.createMany({
            data: flow.map((f, idx) => ({
              orgId, wfhRequestId: created.id,
              approverId: f.approverId, level: idx + 1, role: f.role, status: "Pending",
            })),
          });
        }
        return created;
      });
    } catch (e) {
      if (e instanceof WfhGuardError) {
        return e.kind === "OVERLAP"
          ? conflict("These dates overlap an existing WFH request.")
          : validationError("WFH quota exceeded for the year.");
      }
      throw e;
    }

    // Notify first approver
    void (async () => {
      try {
        const first = flow[0];
        if (!first?.approverEmail) return;
        const company = await prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } });
        const wfhData = {
          variant: "submitted_to_manager" as const,
          recipientName: first.approverName,
          employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
          employeeCode: employee.employeeCode,
          jobTitle: employee.jobTitle,
          department: employee.department?.name ?? null,
          startDate: start.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }),
          endDate: end.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }),
          days: String(days),
          isHalfDay: data.isHalfDay,
          session: data.session,
          reason: data.reason,
          companyName: company?.companyName ?? "Our Company",
        };
        await resolveAndSend(orgId, {
          key: "wfh.approver-request",
          to: first.approverEmail,
          vars: { ...wfhData },
          fallback: () => buildWfhNoticeEmail(wfhData),
        });
      } catch (e) { console.error("wfh approver mail failed", e); }
    })();

    return successResponse(wfh, undefined, 201);
  } catch (e) {
    console.error("POST /wfh/requests", e);
    return internalError();
  }
});
