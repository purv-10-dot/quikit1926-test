import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { buildActivityAclWhere } from "@/lib/services/activities/activity-acl";
import { EXCLUDE_LEAD_INIT_EVENTS_WHERE } from "@/lib/services/leads/log-lead-system-activities";

export const runtime = "nodejs";

/**
 * GET /api/activities/suggestions?q=&limit=
 * Returns: { success, data: { owners: [{ id, name }], records: [{ id, name, kind }] } }
 *
 * Name autocomplete source for the Activities search box. Suggestions are drawn
 * from activity data the caller may see (org-scoped + ACL + same exclusions the
 * list applies), matched against `q`:
 *   - owners:  distinct owner names appearing on visible activities
 *   - records: distinct linked records (Lead/Contact/Account/Opportunity)
 *              appearing on visible activities, whose name matches q
 *
 * Selecting an owner filters the list by ownerId; selecting a record filters by
 * relatedKind + relatedObjectId (see activities-list-client).
 */

type RecordKind = "Lead" | "Contact" | "Account" | "Opportunity";

const PER_GROUP_LIMIT = 8;

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "activities", "view");

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? String(PER_GROUP_LIMIT), 10) || PER_GROUP_LIMIT, 1),
      20,
    );

    // Without a query there is nothing to suggest — keep the payload empty so an
    // empty search box doesn't hammer the DB.
    if (!q) {
      return NextResponse.json({ success: true, data: { owners: [], records: [] } });
    }

    const acl = await buildActivityAclWhere(user);
    // Same base scoping the list route applies, so suggestions can only surface
    // records the caller can actually see (and filter to) in the table.
    const baseAnd: Record<string, unknown>[] = [{ orgId: user.orgId }];
    if (acl) baseAnd.push(acl);
    baseAnd.push(EXCLUDE_LEAD_INIT_EVENTS_WHERE);

    // 1) Owners — distinct (ownerId, ownerName) on visible activities whose
    //    stored owner name matches q. ownerName is denormalised on the activity
    //    row, so this needs no join.
    const ownerRows = await prisma.crmActivity.findMany({
      where: {
        AND: [
          ...baseAnd,
          { ownerId: { not: null } },
          { ownerName: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { ownerId: true, ownerName: true },
      distinct: ["ownerId"],
      take: limit,
      orderBy: { ownerName: "asc" },
    });
    const owners = ownerRows
      .filter((r) => r.ownerId && r.ownerName)
      .map((r) => ({ id: r.ownerId as string, name: r.ownerName as string }));

    // 2) Records — find matching Lead/Contact/Account/Opportunity by name, then
    //    keep only those that actually appear as a linked record on a visible
    //    activity (so a name that matches but has no activity isn't suggested).
    const insensitive = { contains: q, mode: "insensitive" as const };
    const [leads, contacts, accounts, opps] = await Promise.all([
      prisma.crmLead.findMany({
        where: { orgId: user.orgId, deletedAt: null, name: insensitive },
        select: { id: true, name: true },
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.crmContact.findMany({
        where: {
          orgId: user.orgId,
          OR: [
            { firstName: insensitive },
            { lastName: insensitive },
          ],
        },
        select: { id: true, firstName: true, lastName: true },
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.crmAccount.findMany({
        where: { orgId: user.orgId, name: insensitive },
        select: { id: true, name: true },
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.crmOpportunity.findMany({
        where: { orgId: user.orgId, name: insensitive },
        select: { id: true, name: true },
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const candidates: { id: string; name: string; kind: RecordKind }[] = [
      ...leads.map((l) => ({ id: l.id, name: l.name || "—", kind: "Lead" as const })),
      ...contacts.map((c) => ({
        id: c.id,
        name: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || "—",
        kind: "Contact" as const,
      })),
      ...accounts.map((a) => ({ id: a.id, name: a.name || "—", kind: "Account" as const })),
      ...opps.map((o) => ({ id: o.id, name: o.name || "—", kind: "Opportunity" as const })),
    ];

    // Keep only candidates that have at least one visible activity linked to them.
    // One grouped existence query keeps this to a single round-trip.
    const records: { id: string; name: string; kind: RecordKind }[] = [];
    if (candidates.length > 0) {
      const linkOr = candidates.map((c) => ({
        relatedKind: { in: [c.kind, c.kind.toLowerCase()] },
        relatedObjectId: c.id,
      }));
      const linked = await prisma.crmActivity.findMany({
        where: { AND: [...baseAnd, { OR: linkOr }] },
        select: { relatedKind: true, relatedObjectId: true },
        distinct: ["relatedKind", "relatedObjectId"],
      });
      const linkedSet = new Set(
        linked.map((l) => `${l.relatedKind.toLowerCase()}:${l.relatedObjectId}`),
      );
      for (const c of candidates) {
        if (linkedSet.has(`${c.kind.toLowerCase()}:${c.id}`)) records.push(c);
        if (records.length >= limit) break;
      }
    }

    return NextResponse.json({ success: true, data: { owners, records } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load suggestions";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/activities/suggestions GET]", error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
