import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { ownerScopeFilter } from "@/lib/auth/owner-scope";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    if (!q || q.length < 2) return NextResponse.json({ leads: [], accounts: [], contacts: [] });

    // Owner-based visibility: a restricted user must not surface non-owned leads
    // via global search. AND-append the owner scope to the lead query only
    // (accounts/contacts scoping is Stage 2). Returns null for unrestricted users.
    const ownerScope = await ownerScopeFilter(user);
    const leadWhere = ownerScope
      ? {
          AND: [
            {
              tenantId: user.tenantId,
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { email: { contains: q, mode: "insensitive" as const } },
                { company: { contains: q, mode: "insensitive" as const } },
              ],
            },
            ownerScope,
          ],
        }
      : {
          tenantId: user.tenantId,
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { company: { contains: q, mode: "insensitive" as const } },
          ],
        };

    const [leads, accounts, contacts] = await Promise.all([
      prisma.crmLead.findMany({
        where: leadWhere,
        take: 10,
        select: { id: true, name: true, company: true, stage: true },
      }),
      prisma.crmAccount.findMany({
        where: { tenantId: user.tenantId, name: { contains: q, mode: "insensitive" } },
        take: 10,
        select: { id: true, name: true, industry: true },
      }),
      prisma.crmContact.findMany({
        // CrmContact is NOT in SOFT_DELETE_MODELS, so the soft-delete middleware
        // does not auto-inject this — filter trashed contacts out explicitly.
        where: {
          tenantId: user.tenantId,
          deletedAt: null,
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 10,
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
    ]);
    return NextResponse.json({ leads, accounts, contacts });
  } catch (e) {
    return errorResponse(e);
  }
}
