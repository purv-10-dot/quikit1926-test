import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createDelegationSchema } from "@/lib/validations/gap-fill";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { createAuditLog } from "@/lib/utils/audit";
import { publishNotification } from "@/lib/services/realtime";

export const GET = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const scope = searchParams.get("scope") ?? "self";

    const where = {
      orgId, deletedAt: null,
      ...(scope === "self" && { delegatorId: userId }),
      ...(scope === "received" && { delegateeId: userId }),
    };

    const [items, total] = await Promise.all([
      prisma.delegation.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.delegation.count({ where }),
    ]);

    // Resolve delegator/delegatee ids → names so the UI shows people, not ids.
    const empIds = [...new Set(items.flatMap((d) => [d.delegatorId, d.delegateeId]))];
    const emps = empIds.length
      ? await prisma.employee.findMany({
          where: { orgId, id: { in: empIds } },
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        })
      : [];
    const empMap = new Map(emps.map((e) => [e.id, e]));
    const enriched = items.map((d) => ({
      ...d,
      delegator: empMap.get(d.delegatorId) ?? null,
      delegatee: empMap.get(d.delegateeId) ?? null,
    }));

    return successResponse(enriched, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /delegations error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId, permissions }) => {
  try {
    const body = await req.json();
    const parsed = createDelegationSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const d = parsed.data;

    if (d.delegateeId === userId) {
      return validationError("You cannot delegate to yourself.");
    }

    // You can only delegate authorities you actually hold. Super-admin ("*")
    // may delegate anything.
    if (!permissions.includes("*")) {
      const missing = [...new Set(
        d.modules.flatMap((m) => m.permissions).filter((code) => !permissions.includes(code)),
      )];
      if (missing.length) {
        return validationError(
          `You cannot delegate permissions you don't have: ${missing.join(", ")}`,
        );
      }
    }

    // Block downline: delegatee must not be a direct or indirect subordinate.
    const all = await prisma.employee.findMany({
      where: { orgId, deletedAt: null },
      select: { id: true, reportingManagerId: true },
    });
    const childrenByMgr = new Map<string, string[]>();
    for (const e of all) {
      if (!e.reportingManagerId) continue;
      const arr = childrenByMgr.get(e.reportingManagerId) ?? [];
      arr.push(e.id);
      childrenByMgr.set(e.reportingManagerId, arr);
    }
    const downline = new Set<string>();
    const queue = [...(childrenByMgr.get(userId) ?? [])];
    while (queue.length) {
      const id = queue.shift()!;
      if (downline.has(id)) continue;
      downline.add(id);
      const next = childrenByMgr.get(id);
      if (next) queue.push(...next);
    }
    if (downline.has(d.delegateeId)) {
      return validationError("You cannot delegate to your direct or indirect subordinates.");
    }

    const delegation = await prisma.delegation.create({
      data: {
        orgId,
        delegatorId: userId,
        delegateeId: d.delegateeId,
        type: d.type,
        modules: d.modules,
        fromDate: new Date(d.fromDate),
        toDate: d.toDate ? new Date(d.toDate) : null,
        notifyMode: d.notifyMode,
        description: d.description,
        isActive: true,
        createdBy: userId, updatedBy: userId,
      },
    });

    await createAuditLog({ orgId, userId, action: "Create", entityType: "Delegation", entityId: delegation.id });

    // In-app notifications based on notifyMode.
    try {
      const [delegator, delegatee] = await Promise.all([
        prisma.employee.findFirst({ where: { id: userId, orgId, deletedAt: null }, select: { firstName: true, lastName: true } }),
        prisma.employee.findFirst({ where: { id: d.delegateeId, orgId, deletedAt: null }, select: { firstName: true, lastName: true } }),
      ]);
      const delegatorName = delegator ? `${delegator.firstName} ${delegator.lastName}`.trim() : "Someone";
      const delegateeName = delegatee ? `${delegatee.firstName} ${delegatee.lastName}`.trim() : "an employee";
      const fromStr = new Date(d.fromDate).toLocaleDateString("en-IN");
      const toStr = d.toDate ? new Date(d.toDate).toLocaleDateString("en-IN") : "no end date";
      const modulesStr = d.modules.map((m) => m.module).join(", ");

      const recipients: Array<{ id: string; title: string; message: string }> = [];
      // Always notify delegatee.
      recipients.push({
        id: d.delegateeId,
        title: `Delegation assigned to you`,
        message: `${delegatorName} delegated ${modulesStr} to you (${fromStr} → ${toStr}).`,
      });
      // NotifyBoth → also notify delegator (confirmation copy).
      if (d.notifyMode === "NotifyBoth") {
        recipients.push({
          id: userId,
          title: `Delegation created`,
          message: `You delegated ${modulesStr} to ${delegateeName} (${fromStr} → ${toStr}).`,
        });
      }

      if (recipients.length > 0) {
        await prisma.hrmsNotification.createMany({
          data: recipients.map((r) => ({
            orgId,
            employeeId: r.id,
            type: "Action",
            channel: "InApp" as const,
            title: r.title,
            message: r.message,
            link: "/delegations",
            entityType: "Delegation",
            entityId: delegation.id,
          })),
        });
        publishNotification(orgId, recipients.map((r) => r.id), {
          title: recipients[0].title,
          message: recipients[0].message,
          type: "Action",
          link: "/delegations",
        }).catch(() => {});
      }
    } catch (notifErr) {
      console.error("Delegation notification error:", notifErr);
    }

    return successResponse(delegation, undefined, 201);
  } catch (error) {
    console.error("POST /delegations error:", error);
    return internalError();
  }
});
