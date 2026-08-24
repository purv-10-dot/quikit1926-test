import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import {
  getPeriodFacts,
  computeMemberAdherence,
  computeTeamAdherence,
  findRecurringStucks,
  summariseCoverage,
} from "@/lib/facts/query";

export const runtime = "nodejs";

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

/**
 * GET /api/client-meetings/facts?clientId&from&to[&cadence]
 *
 * Period-scoped facts, plus the deterministic figures derived from them.
 *
 * This is the endpoint report generators consume, and the reason the pipeline
 * never re-reads a transcript: a week's adherence, quality mix, No-Stuck rates
 * and recurring blockers all come from here, computed in TypeScript, for zero
 * tokens.
 *
 * THE REPORTING WINDOW IS ENFORCED IN SQL. `from`/`to` bound `meetingDate` in
 * the query itself, so a caller cannot reach outside its period. The client doc
 * forbids the DH Weekly Report from comparing against previous weeks, and that
 * rule is kept by making the data unreachable rather than by asking a prompt
 * not to look at it.
 *
 * The range is capped at 400 days: long enough for an annual view, short enough
 * that an unbounded query cannot pull an org's entire history in one request.
 *
 * See `docs/17-ai-meeting-rhythm-architecture.md` §D.9, §J, §G lever 3.
 */
const querySchema = z
  .object({
    clientId: z.string().min(1),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from must be yyyy-mm-dd"),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to must be yyyy-mm-dd"),
    cadence: z.enum(["DAILY", "WEEKLY"]).optional(),
    /** Omit the raw facts and return only the derived figures. */
    summaryOnly: z.coerce.boolean().optional(),
  })
  .refine((v) => v.from <= v.to, { message: "from must not be after to" });

const MAX_RANGE_DAYS = 400;

export const GET = auth.view(async ({ orgId }, req) => {
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  const { clientId, cadence, summaryOnly } = parsed.data;
  const from = new Date(`${parsed.data.from}T00:00:00.000Z`);
  const to = new Date(`${parsed.data.to}T23:59:59.999Z`);

  if ((to.getTime() - from.getTime()) / 86_400_000 > MAX_RANGE_DAYS) {
    return NextResponse.json(
      { success: false, error: `Range must not exceed ${MAX_RANGE_DAYS} days` },
      { status: 400 },
    );
  }

  // The client must belong to this org before any fact is read. Without this a
  // caller could probe another tenant's client ids and learn from the shape of
  // the response whether they exist.
  const client = await db.client.findFirst({
    where: { id: clientId, orgId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!client) {
    return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
  }

  const facts = await getPeriodFacts(orgId, clientId, from, to, { cadence });
  const members = computeMemberAdherence(facts.participants);

  return NextResponse.json({
    success: true,
    data: {
      client,
      period: { from: parsed.data.from, to: parsed.data.to, cadence: cadence ?? null },
      coverage: summariseCoverage(facts),
      /**
       * Computed here in TypeScript from stored classifications, using the
       * fixed Yes=100 / Partial=50 / No=0 mapping and averaging over the
       * huddles each member ATTENDED. No model produces any figure below.
       */
      adherence: {
        members,
        team: computeTeamAdherence(members),
      },
      recurringStucks: findRecurringStucks(facts.stucks),
      ...(summaryOnly ? {} : { facts }),
    },
  });
});
