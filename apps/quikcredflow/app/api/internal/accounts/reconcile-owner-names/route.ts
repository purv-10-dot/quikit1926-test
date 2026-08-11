/**
 * POST /api/internal/accounts/reconcile-owner-names — admin-only background job.
 * Re-derives ownerName from public.User for every QcfAccount in the caller's tenant.
 * Useful after bulk user renames or imports that left ownerId/ownerName desynced.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { isAdminRole } from "@/lib/auth/role-grants";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    if (!isAdminRole(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Pull every account with a non-null ownerId for this tenant.
    const accounts = await prisma.qcfAccount.findMany({
      where: { orgId: user.orgId, ownerId: { not: null } },
      select: { id: true, ownerId: true, ownerName: true },
    });

    const ownerIds = [...new Set(accounts.map((a) => a.ownerId).filter((x): x is string => !!x))];
    if (ownerIds.length === 0) return NextResponse.json({ ok: true, updated: 0, total: 0 });

    const users = await prisma.user.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const nameMap = new Map<string, string>();
    for (const u of users) {
      const composed = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
      nameMap.set(u.id, composed || u.email);
    }

    let updated = 0;
    for (const a of accounts) {
      const desired = a.ownerId ? (nameMap.get(a.ownerId) ?? null) : null;
      if (desired !== null && desired !== (a.ownerName ?? null)) {
        await prisma.qcfAccount.update({
          where: { id: a.id },
          data: { ownerName: desired },
        });
        updated++;
      }
    }

    return NextResponse.json({ ok: true, updated, total: accounts.length });
  } catch (e) {
    return errorResponse(e);
  }
}
