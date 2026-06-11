/**
 * "At-risk" widget feed — overdue tasks, stale leads, stuck opportunities,
 * and call logs missing a disposition. Each bucket returns a count plus 3
 * sample rows for the card preview; the "View all →" link drills to a list.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { CrmOpportunityStage, CrmTaskStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { db } from "@/lib/db";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  parseFilters,
  tenantOwnerWhere,
  tenantAssigneeWhere,
  tenantAgentWhere,
} from "@/lib/services/dashboard/filters";
import type { AtRiskBucket, AtRiskDto, AtRiskSampleRow } from "@/lib/dashboard/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAMPLE_LIMIT = 3;
const STALE_LEAD_DAYS = 7;
const STUCK_OPP_DAYS = 30;
const MISSING_DISPO_AGE_HOURS = 24;
const CLOSED_LEAD_STAGES = ["Closed", "Closed - Won", "Closed - Lost", "Won", "Lost"];

const MS_DAY = 86_400_000;
const MS_HOUR = 3_600_000;

function isoOrEmpty(d: Date | null | undefined): string {
  return d ? d.toISOString() : "";
}

async function userNameMap(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const real = [...new Set(ids.filter((x): x is string => typeof x === "string" && x.length > 0))];
  if (real.length === 0) return new Map();
  const users = await db.user.findMany({
    where: { id: { in: real } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  return new Map(
    users.map((u) => [
      u.id,
      `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email,
    ]),
  );
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "dashboard", "view");

    const filters = parseFilters(req, user);
    // Bug 2: cutoffs are anchored to the selected range's `to`, not server
    // `now`. For preset users (range.to ≈ now) behavior is unchanged; for a
    // historical custom range, the widget shows the snapshot as of that
    // window's end.
    const asOf = filters.range.to;
    const staleCutoff = new Date(asOf.getTime() - STALE_LEAD_DAYS * MS_DAY);
    const stuckCutoff = new Date(asOf.getTime() - STUCK_OPP_DAYS * MS_DAY);
    const dispoCutoff = new Date(asOf.getTime() - MISSING_DISPO_AGE_HOURS * MS_HOUR);

    const taskWhere = {
      ...tenantAssigneeWhere(user, filters.resolvedOwnerId),
      status: { not: "Completed" as CrmTaskStatus },
      dueDate: { lt: asOf },
    };

    const leadWhere = {
      ...tenantOwnerWhere(user, filters.resolvedOwnerId),
      // CrmLead has `deletedAt`; filter explicitly (no middleware coverage yet).
      deletedAt: null,
      stage: { notIn: CLOSED_LEAD_STAGES },
      updatedAt: { lt: staleCutoff },
    };

    const oppWhere = {
      ...tenantOwnerWhere(user, filters.resolvedOwnerId),
      // CrmOpportunity has `deletedAt`; filter explicitly (no middleware coverage yet).
      deletedAt: null,
      stage: { notIn: ["ClosedWon", "ClosedLost"] as CrmOpportunityStage[] },
      updatedAt: { lt: stuckCutoff },
    };

    const callWhere = {
      ...tenantAgentWhere(user, filters.resolvedOwnerId),
      dispositionName: null,
      createdAt: { lt: dispoCutoff },
    };

    const [
      overdueTasksCount,
      overdueTaskSamples,
      staleLeadsCount,
      staleLeadSamples,
      stuckOppsCount,
      stuckOppSamples,
      callsMissingDispoCount,
      callsMissingDispoSamples,
    ] = await Promise.all([
      prisma.crmTask.count({ where: taskWhere }),
      prisma.crmTask.findMany({
        where: taskWhere,
        select: { id: true, subject: true, dueDate: true, assignedToUserId: true },
        orderBy: { dueDate: "asc" },
        take: SAMPLE_LIMIT,
      }),
      prisma.crmLead.count({ where: leadWhere }),
      prisma.crmLead.findMany({
        where: leadWhere,
        select: { id: true, name: true, stage: true, updatedAt: true, ownerId: true, ownerName: true },
        orderBy: { updatedAt: "asc" },
        take: SAMPLE_LIMIT,
      }),
      prisma.crmOpportunity.count({ where: oppWhere }),
      prisma.crmOpportunity.findMany({
        where: oppWhere,
        select: { id: true, name: true, stage: true, updatedAt: true, ownerId: true },
        orderBy: { updatedAt: "asc" },
        take: SAMPLE_LIMIT,
      }),
      prisma.crmCallLog.count({ where: callWhere }),
      prisma.crmCallLog.findMany({
        where: callWhere,
        select: {
          id: true,
          destinationNumber: true,
          createdAt: true,
          agentUserId: true,
          ownerName: true,
        },
        orderBy: { createdAt: "asc" },
        take: SAMPLE_LIMIT,
      }),
    ]);

    const ids = [
      ...overdueTaskSamples.map((t) => t.assignedToUserId),
      ...staleLeadSamples.map((l) => l.ownerId),
      ...stuckOppSamples.map((o) => o.ownerId),
      ...callsMissingDispoSamples.map((c) => c.agentUserId),
    ];
    const nameMap = await userNameMap(ids);

    const overdueTasks: AtRiskBucket = {
      count: overdueTasksCount,
      samples: overdueTaskSamples.map<AtRiskSampleRow>((t) => ({
        id: t.id,
        primary: t.subject,
        secondary: t.dueDate ? `Due ${t.dueDate.toLocaleDateString("en-IN")}` : "No due date",
        ownerName: nameMap.get(t.assignedToUserId ?? "") ?? "Unassigned",
        iso: isoOrEmpty(t.dueDate),
      })),
    };

    const staleLeads: AtRiskBucket = {
      count: staleLeadsCount,
      samples: staleLeadSamples.map<AtRiskSampleRow>((l) => ({
        id: l.id,
        primary: l.name,
        secondary: `${l.stage || "—"} · idle since ${l.updatedAt.toLocaleDateString("en-IN")}`,
        ownerName: nameMap.get(l.ownerId ?? "") ?? l.ownerName ?? "Unassigned",
        iso: l.updatedAt.toISOString(),
      })),
    };

    const stuckOpportunities: AtRiskBucket = {
      count: stuckOppsCount,
      samples: stuckOppSamples.map<AtRiskSampleRow>((o) => ({
        id: o.id,
        primary: o.name,
        secondary: `${o.stage || "—"} · stuck since ${o.updatedAt.toLocaleDateString("en-IN")}`,
        ownerName: nameMap.get(o.ownerId ?? "") ?? "Unassigned",
        iso: o.updatedAt.toISOString(),
      })),
    };

    const callsWithoutDispo: AtRiskBucket = {
      count: callsMissingDispoCount,
      samples: callsMissingDispoSamples.map<AtRiskSampleRow>((c) => ({
        id: c.id,
        primary: c.destinationNumber || "—",
        secondary: `Call · ${c.createdAt.toLocaleDateString("en-IN")}`,
        ownerName: nameMap.get(c.agentUserId ?? "") ?? c.ownerName ?? "Unknown",
        iso: c.createdAt.toISOString(),
      })),
    };

    const dto: AtRiskDto = {
      overdueTasks,
      staleLeads,
      stuckOpportunities,
      callsWithoutDispo,
    };
    return NextResponse.json(dto);
  } catch (e) {
    return errorResponse(e);
  }
}
