import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { assertLeadOwnership } from "@/lib/auth/owner-scope";
import { LEAD_CHANGE_LOG_MODULE } from "@/lib/services/leads/change-log";

export const runtime = "nodejs";

const ACTIONS = ["CREATE", "UPDATE", "DELETE", "RESTORE", "PERMANENT_DELETE"] as const;

const querySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  userId: z.string().trim().min(1).optional(),
  field: z.string().trim().min(1).optional(),
  action: z.enum(ACTIONS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

interface ChangeLogEntry {
  id: string;
  action: string;
  userId: string | null;
  userName: string | null;
  resourceId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  /** Reference fields (`ownerId`, `accountId`, `linkedContactId`) resolved to
   *  human-readable names so the UI doesn't surface raw cuids. */
  resolved: Record<string, { before: string | null; after: string | null }>;
  fields: string[];
  createdAt: Date;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "leads", "view");

    const lead = await prisma.qcfLead.findUnique({ where: { id } });
    if (!lead || lead.tenantId !== user.tenantId) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 },
      );
    }
    await assertLeadOwnership(user, lead.ownerId);

    const parsed = querySchema.safeParse(
      Object.fromEntries(new URL(req.url).searchParams),
    );
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid query",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }
    const q = parsed.data;

    const where: Record<string, unknown> = {
      tenantId: user.tenantId,
      module: LEAD_CHANGE_LOG_MODULE,
      resourceId: id,
    };
    if (q.action) where.action = q.action;
    if (q.userId) where.userId = q.userId;
    if (q.from || q.to) {
      where.createdAt = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {}),
      };
    }

    const skip = (q.page - 1) * q.pageSize;
    const [rows, total] = await Promise.all([
      prisma.qcfAuditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: q.pageSize,
      }),
      prisma.qcfAuditLog.count({ where }),
    ]);

    // Field-name filtering happens in memory because the changed-fields are
    // encoded as JSON keys inside `before`/`after` rather than a dedicated
    // column. With the row cap above (max 200 per page) this is fine; if we
    // ever need server-side field filtering we'd add a denormalized
    // `changedFields` column.
    const fieldFiltered = q.field
      ? rows.filter((r) => {
          const before = (r.before as Record<string, unknown> | null) ?? {};
          const after = (r.after as Record<string, unknown> | null) ?? {};
          return q.field! in before || q.field! in after;
        })
      : rows;

    // Collect every ID we'll need to resolve so we can batch the lookups.
    const userIds = new Set<string>();
    const accountIds = new Set<string>();
    const contactIds = new Set<string>();
    for (const r of fieldFiltered) {
      if (r.userId) userIds.add(r.userId);
      const before = (r.before as Record<string, unknown> | null) ?? {};
      const after = (r.after as Record<string, unknown> | null) ?? {};
      for (const snap of [before, after]) {
        const oId = snap.ownerId;
        if (typeof oId === "string" && oId) userIds.add(oId);
        const aId = snap.accountId;
        if (typeof aId === "string" && aId) accountIds.add(aId);
        const cId = snap.linkedContactId;
        if (typeof cId === "string" && cId) contactIds.add(cId);
      }
    }

    const [profiles, accounts, contacts] = await Promise.all([
      userIds.size
        ? prisma.user.findMany({
            where: { id: { in: Array.from(userIds) } },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : Promise.resolve([]),
      accountIds.size
        ? prisma.qcfAccount.findMany({
            where: { tenantId: user.tenantId, id: { in: Array.from(accountIds) } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      contactIds.size
        ? prisma.qcfContact.findMany({
            // QcfContact isn't middleware-protected — exclude trashed from labels.
            where: { tenantId: user.tenantId, id: { in: Array.from(contactIds) }, deletedAt: null },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : Promise.resolve([]),
    ]);

    const userNameById = new Map<string, string>();
    for (const p of profiles) {
      const full = `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();
      userNameById.set(p.id, full || p.email || p.id);
    }
    const accountNameById = new Map<string, string>();
    for (const a of accounts) accountNameById.set(a.id, a.name || a.id);
    const contactNameById = new Map<string, string>();
    for (const c of contacts) {
      const full = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
      contactNameById.set(c.id, full || c.email || c.id);
    }

    function resolveRef(field: string, value: unknown): string | null {
      if (typeof value !== "string" || !value) return null;
      if (field === "ownerId") return userNameById.get(value) ?? value;
      if (field === "accountId") return accountNameById.get(value) ?? value;
      if (field === "linkedContactId") return contactNameById.get(value) ?? value;
      return null;
    }

    const items: ChangeLogEntry[] = fieldFiltered.map((r) => {
      const before = (r.before as Record<string, unknown> | null) ?? null;
      const after = (r.after as Record<string, unknown> | null) ?? null;
      const fields = Array.from(
        new Set([
          ...Object.keys(before ?? {}),
          ...Object.keys(after ?? {}),
        ]),
      );
      const resolved: Record<string, { before: string | null; after: string | null }> = {};
      for (const f of ["ownerId", "accountId", "linkedContactId"] as const) {
        if (!fields.includes(f)) continue;
        resolved[f] = {
          before: resolveRef(f, before?.[f]),
          after: resolveRef(f, after?.[f]),
        };
      }
      return {
        id: r.id,
        action: r.action,
        userId: r.userId,
        userName: r.userId ? userNameById.get(r.userId) ?? null : null,
        resourceId: r.resourceId,
        before,
        after,
        resolved,
        fields,
        createdAt: r.createdAt,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        items,
        total: q.field ? items.length : total,
        page: q.page,
        pageSize: q.pageSize,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
