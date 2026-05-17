import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("kpi");

/**
 * GET /api/kpi/[id]/summary — compact KPI projection for AI Runtime context.
 *
 * Distinct from GET /api/kpi/[id] which returns the full row (~25 fields,
 * verbose for LLM input). This endpoint returns only the fields agents need
 * to reason about a KPI: identity, ownership, current quarter targets vs
 * achieved, health, last 8 weekly entries, and a deep-link URL.
 *
 * PII: owner_user select is restricted to id/firstName/lastName — email is
 * never read from the DB, so it cannot leak into logs or error messages.
 * Deeper PII scrubbing (e.g. of user-authored `lastNotes`) is the AI Runtime
 * layer's responsibility per v3.0 handoff §7.
 */

const MAX_NOTES_LENGTH = 300;
const WEEKLY_VALUES_LIMIT = 8;

export const GET = withOrgAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const kpi = await db.kPI.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      orgId: true,
      name: true,
      kpiLevel: true,
      owner: true,
      quarter: true,
      year: true,
      measurementUnit: true,
      target: true,
      qtdAchieved: true,
      progressPercent: true,
      healthStatus: true,
      lastNotes: true,
      owner_user: { select: { id: true, firstName: true, lastName: true } },
      weeklyValues: {
        select: { weekNumber: true, value: true },
        orderBy: { weekNumber: "desc" },
        take: WEEKLY_VALUES_LIMIT,
      },
    },
  });

  if (!kpi) {
    return NextResponse.json({ success: false, error: "KPI not found" }, { status: 404 });
  }
  if (kpi.orgId !== orgId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
  }

  const notes = kpi.lastNotes ?? "";
  const lastNotes = notes.length > MAX_NOTES_LENGTH ? notes.slice(0, MAX_NOTES_LENGTH) : notes;

  return NextResponse.json({
    success: true,
    data: {
      id: kpi.id,
      name: kpi.name,
      kpiLevel: kpi.kpiLevel,
      owner_user: kpi.owner_user,
      quarter: kpi.quarter,
      year: kpi.year,
      measurementUnit: kpi.measurementUnit,
      target: kpi.target ?? 0,
      qtdAchieved: kpi.qtdAchieved ?? 0,
      progressPercent: kpi.progressPercent ?? 0,
      healthStatus: kpi.healthStatus,
      lastNotes,
      weeklyValues: kpi.weeklyValues.map((w) => ({
        weekNumber: w.weekNumber,
        value: w.value ?? 0,
      })),
      url: `/quikscale/kpi/${kpi.id}`,
    },
  });
}, { fallbackErrorMessage: "Failed to fetch KPI summary" });
