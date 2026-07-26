import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { runSingleWorkflow } from "@/lib/engine";
import type { EngineEvent } from "@/lib/engine/types";
import { moduleForEvent } from "@/lib/catalog";
import { getProvider } from "@/lib/data/registry";

export const runtime = "nodejs";

type Params = { id: string };

/**
 * POST /api/workflows/:id/run — "Run now". Executes a single workflow
 * immediately through the engine (inline, bypassing the matcher + queue) so a
 * user can test ANY workflow on demand — including Drafts — and see the run in
 * Run History right away. The real QuikScale-triggered path goes through
 * /api/events → BullMQ → worker instead.
 *
 * Test data strategy (so conditions actually evaluate the way they will in
 * production): when the trigger's module is readable, we load the org's
 * most-recent REAL record of that module and hand its id to the engine, so
 * `loadContext` enriches the event with real fields and a condition like
 * `trigger.owner equals …` tests against real data. When the org has no such
 * record yet, we fall back to an enriched SYNTHETIC sample that carries the
 * common catalog fields (owner/status/progress/…) under their catalog keys so
 * a basic condition still resolves instead of silently stopping the run.
 */
export const POST = withOrgAuth<Params>(async ({ orgId, userId }, _req, { params }) => {
  const wf = await db.wfWorkflow.findFirst({
    where: {
      id: params.id,
      orgId,
      OR: [{ scope: "org" }, { scope: "personal", ownerId: userId }],
    },
    select: { id: true, trigger: true, graphNodes: true, graphEdges: true },
  });
  if (!wf) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const trigger = (wf.trigger ?? {}) as Record<string, unknown>;
  const app = typeof trigger.app === "string" ? trigger.app : "quikflow";
  const eventId = typeof trigger.event === "string" ? trigger.event : "manual.run";

  // Quarter/year come from the org's FISCAL calendar (QuarterSetting), NOT naive
  // calendar math — otherwise a test Priority lands in the wrong quarter and is
  // hidden by the QuikScale grid's active-quarter filter. Falls back to the
  // calendar quarter if the org has no matching QuarterSetting row.
  const now = new Date();
  const currentQuarter = await db.quarterSetting.findFirst({
    where: { orgId, startDate: { lte: now }, endDate: { gte: now } },
    select: { quarter: true, fiscalYear: true },
  });
  const quarter = currentQuarter?.quarter ?? `Q${Math.floor(now.getMonth() / 3) + 1}`;
  const year = currentQuarter?.fiscalYear ?? now.getFullYear();

  // Enriched synthetic sample. The owner is the user clicking "Run now" — a test
  // priority/notification is created for them, so the run produces a visible
  // result. Fields are keyed the way the catalog exposes them (owner, status,
  // progressPercent, …) so a condition authored as `trigger.<field>` resolves.
  const sample: Record<string, unknown> = {
    name: "Sample KPI (Run now)",
    value: 50,
    target: 100,
    ownerId: userId,
    owner: userId,
    status: "red",
    progressPercent: 50,
    qtdAchieved: 50,
    gapPct: 50,
    quarter,
    year,
    teamId: null,
  };

  // Prefer a REAL record of the trigger's module so conditions test truthfully.
  const mod = moduleForEvent(eventId);
  let recordId: string | null = null;
  let dataSource = "synthetic sample (no real record found for this module)";
  if (mod?.binding.readable) {
    try {
      const provider = getProvider(app);
      const res = await provider?.queryRecords(orgId, { moduleKey: mod.key, limit: 1 });
      const real = res?.items?.[0];
      if (real) {
        recordId = real.id;
        dataSource = `real ${mod.key} record (${real.id})`;
      }
    } catch {
      // Any provider/DB hiccup falls back to the synthetic sample silently —
      // a test run must never 500 on the data-loading convenience path.
    }
  }

  const event: EngineEvent = {
    app,
    event: eventId,
    orgId,
    // Unique per click so repeated manual runs each create a new WfRun.
    dedupeKey: `runnow:${params.id}:${Date.now()}`,
    data: {
      manual: true,
      triggeredBy: userId,
      ...sample,
      // `recordId` drives loadContext's record enrichment for ANY module;
      // `kpiId` additionally feeds KPI-specific action executors.
      kpiId: mod?.key === "kpi" ? recordId : null,
      ...(recordId ? { recordId } : {}),
    },
    occurredAt: now.toISOString(),
  };

  const result = await runSingleWorkflow(wf, event);
  return NextResponse.json({ success: true, data: { run: result, dataSource } });
});
