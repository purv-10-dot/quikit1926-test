import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("opsp.categories", "OPSP.Categories");

// Keep in sync with app/api/categories/route.ts.
const CATEGORY_AUDIT_ENTITY_ID = "category-mgmt";

function safeParse(v: string | null): Record<string, unknown> | null {
  if (!v) return null;
  try {
    const p = JSON.parse(v);
    return p && typeof p === "object" ? (p as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// GET /api/categories/logs — org-wide Category Mgmt audit trail (CREATE / UPDATE /
// DELETE). Module-scoped (NOT admin-only) so category managers can view it.
export const GET = auth.view(async ({ orgId }) => {
  const logs = await db.auditLog.findMany({
    where: { orgId, entityType: "Category", entityId: CATEGORY_AUDIT_ENTITY_ID },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      action: true,
      oldValues: true,
      newValues: true,
      changes: true,
      actorId: true,
      createdAt: true,
    },
  });

  const actorIds = [...new Set(logs.map((l) => l.actorId))];
  const users = actorIds.length
    ? await db.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const nameMap = Object.fromEntries(
    users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]),
  );

  const data = logs.map((l) => {
    const oldValues = safeParse(l.oldValues);
    const newValues = safeParse(l.newValues);
    const name =
      (newValues?.name as string | undefined) ??
      (oldValues?.name as string | undefined) ??
      "Category";
    return {
      id: l.id,
      action: l.action,
      name,
      changes: l.changes,
      oldValues,
      newValues,
      actorName: nameMap[l.actorId] ?? l.actorId,
      createdAt: l.createdAt.toISOString(),
    };
  });

  return NextResponse.json({ success: true, data });
}, { fallbackErrorMessage: "Failed to load category logs" });
