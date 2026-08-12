import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { ParsedResult, ParsedStatus } from "@/lib/test/resultParser";

/**
 * QuikTest — the AUTOMATED write path (P3).
 *
 * CI reports results keyed by `automationId`, so a framework never needs
 * internal database ids. Both the JSON endpoint and the JUnit upload funnel
 * through `ingestResults` here, which means the store, the status mapping and
 * the unmatched-id bookkeeping are identical for every format — the reason the
 * parser sits behind an interface.
 *
 * Golden rules enforced here:
 *   • one INSERT per result into the same append-only table the runner writes to
 *   • an unmatched automationId is RECORDED and REPORTED, never silently dropped
 *   • an unknown id does not fail the batch — the known results still land
 */

export class IngestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "IngestError";
    this.status = status;
    this.code = code;
  }
}

/** One incoming automated result, already normalised by a parser or the API. */
export interface IngestItem {
  automationId: string;
  status: ParsedStatus;
  elapsedMs?: number | null;
  failureMessage?: string | null;
  stackTrace?: string | null;
  build?: string | null;
  ciUrl?: string | null;
}

export interface IngestSummary {
  inserted: number;
  /** Automation ids with no matching case, with occurrence counts. */
  unmatched: Array<{ automationId: string; count: number }>;
  /** Cases matched but not in this run, materialised on the fly. */
  materialised: number;
  /** Ids that appeared more than once in one payload. */
  duplicates: string[];
}

/**
 * Maps a parsed status to the org's automation status rows.
 *
 * Automated outcomes deliberately land on the DEDICATED automation statuses
 * rather than the manual ones, because the reference UI reports the two
 * separately — folding CI passes into "Passed" would make the manual/automation
 * split in every summary meaningless.
 */
const STATUS_KEY_BY_PARSED: Record<ParsedStatus, string> = {
  Passed: "automation_passed",
  Failed: "automation_failed",
  Blocked: "blocked",
  Skipped: "skipped",
};

async function resolveStatusIds(
  orgId: string,
): Promise<Map<string, string>> {
  const rows = await db.qtTestStatus.findMany({
    where: { orgId, isDeleted: false },
    select: { id: true, key: true },
  });
  return new Map(rows.map((r) => [r.key, r.id]));
}

/**
 * Appends automated results to a run.
 *
 * `allowMaterialise` controls what happens when CI reports a case that exists in
 * the project but has no test in this run: either add one (the usual choice for
 * an automated run, whose membership is defined by what CI actually ran) or
 * treat it as unmatched. Closed runs are rejected outright.
 */
export async function ingestResults(
  orgId: string,
  userId: string,
  runId: string,
  items: IngestItem[],
  options: { allowMaterialise?: boolean } = {},
): Promise<IngestSummary> {
  const allowMaterialise = options.allowMaterialise ?? true;

  const run = await db.qtTestRun.findFirst({
    where: { id: runId, orgId, isDeleted: false },
    select: {
      id: true,
      projectId: true,
      state: true,
      build: true,
      source: true,
    },
  });
  if (!run) throw new IngestError("Run not found.", 404, "RUN_NOT_FOUND");

  // A closed run is frozen for BOTH write paths. Enforced here as well as in
  // the manual recorder — the plan flags that this is an application-level
  // invariant, so every caller has to check it.
  if (run.state === "closed") {
    throw new IngestError(
      "This run is closed. Reopen it before reporting more results.",
      409,
      "RUN_CLOSED",
    );
  }

  if (items.length === 0) {
    return { inserted: 0, unmatched: [], materialised: 0, duplicates: [] };
  }

  const statusIds = await resolveStatusIds(orgId);
  const defaultStatusId = statusIds.get("untested");
  if (!defaultStatusId) {
    throw new IngestError(
      "No default test status is configured for this organisation.",
      500,
      "NO_DEFAULT_STATUS",
    );
  }

  // Collapse duplicates within one payload, keeping the LAST occurrence. A
  // framework that retries a flaky test in-process reports it twice; the final
  // outcome is the one that matters.
  const seen = new Map<string, IngestItem>();
  const duplicates = new Set<string>();
  for (const item of items) {
    if (seen.has(item.automationId)) duplicates.add(item.automationId);
    seen.set(item.automationId, item);
  }
  const unique = Array.from(seen.values());

  const automationIds = unique.map((i) => i.automationId);

  const cases = await db.qtTestCase.findMany({
    where: {
      orgId,
      projectId: run.projectId,
      isDeleted: false,
      automationId: { in: automationIds },
    },
    select: { id: true, automationId: true, currentVersion: true },
  });
  const caseByAutomationId = new Map(
    cases
      .filter((c): c is typeof c & { automationId: string } => c.automationId !== null)
      .map((c) => [c.automationId, c]),
  );

  const existingTests = await db.qtTest.findMany({
    where: { orgId, runId, caseId: { in: cases.map((c) => c.id) } },
    select: { id: true, caseId: true, configId: true },
  });
  // Only the null-config test is a valid automation target: with a config
  // matrix, CI cannot say which configuration it ran, so a matrix run needs an
  // explicit per-config report rather than a guess.
  const testByCaseId = new Map(
    existingTests.filter((t) => t.configId === null).map((t) => [t.caseId, t.id]),
  );

  const unmatchedCounts = new Map<string, number>();
  for (const item of items) {
    if (!caseByAutomationId.has(item.automationId)) {
      unmatchedCounts.set(
        item.automationId,
        (unmatchedCounts.get(item.automationId) ?? 0) + 1,
      );
    }
  }

  let materialised = 0;
  let inserted = 0;

  await db.$transaction(async (tx) => {
    // Materialise tests for matched cases that aren't in the run yet.
    if (allowMaterialise) {
      const missing = cases.filter((c) => !testByCaseId.has(c.id));
      if (missing.length > 0) {
        const maxRef = await tx.qtTest.aggregate({
          where: { runId },
          _max: { refId: true },
        });
        let seq = maxRef._max.refId ?? 0;

        for (const c of missing) {
          seq += 1;
          const created = await tx.qtTest.create({
            data: {
              orgId,
              runId,
              caseId: c.id,
              configId: null,
              refId: seq,
              caseVersion: c.currentVersion,
              currentStatusId: defaultStatusId,
            },
            select: { id: true },
          });
          testByCaseId.set(c.id, created.id);
          materialised += 1;
        }
      }
    }

    for (const item of unique) {
      const matchedCase = caseByAutomationId.get(item.automationId);
      if (!matchedCase) continue;

      const testId = testByCaseId.get(matchedCase.id);
      if (!testId) continue; // not in run and materialising is off

      const statusKey = STATUS_KEY_BY_PARSED[item.status];
      const statusId = statusIds.get(statusKey);
      if (!statusId) {
        throw new IngestError(
          `Status "${statusKey}" is missing from this organisation's catalogue.`,
          500,
          "MISSING_STATUS",
        );
      }

      await tx.qtTestResult.create({
        data: {
          orgId,
          testId,
          runId,
          statusId,
          source: "automated",
          executedBy: userId,
          elapsedMs: item.elapsedMs ?? null,
          failureMessage: item.failureMessage ?? null,
          stackTrace: item.stackTrace ?? null,
          build: item.build ?? run.build,
          ciUrl: item.ciUrl ?? null,
        },
      });

      // Same cache-refresh contract as the manual path.
      await tx.qtTest.update({
        where: { id: testId },
        data: { currentStatusId: statusId },
      });

      inserted += 1;
    }

    // Persist unmatched ids so QA can fix the mapping. Never dropped silently.
    for (const [automationId, count] of unmatchedCounts) {
      await tx.qtTestUnmatchedAutomationId.upsert({
        where: { runId_automationId: { runId, automationId } },
        create: { orgId, runId, automationId, count },
        update: { count: { increment: count } },
      });
    }

    // A run that receives both manual and automated results is "mixed" — the
    // reference UI reports the two separately, and the run's own label should
    // reflect that it carries both.
    //
    // Guarded by a conditional updateMany rather than a plain update for two
    // reasons: (1) `run.source` was read outside this transaction and a
    // concurrent batch may already have promoted it, and (2) promoting
    // manual→mixed moves the row INTO the scope of the partial unique index on
    // (projectId, build), so if a separate automated run already owns this
    // build the promotion would raise — failing an otherwise valid ingest over
    // a cosmetic label. `updateMany` matching on the current value makes the
    // promotion a no-op in both cases instead of an error.
    if (inserted > 0) {
      try {
        await tx.qtTestRun.updateMany({
          where: { id: runId, source: "manual" },
          data: { source: "mixed" },
        });
      } catch (error: unknown) {
        // A build-label collision must not discard real results. The run keeps
        // its label; the results are already written.
        if (!isUniqueViolation(error)) throw error;
      }
    }
  });

  return {
    inserted,
    unmatched: Array.from(unmatchedCounts, ([automationId, count]) => ({
      automationId,
      count,
    })),
    materialised,
    duplicates: Array.from(duplicates),
  };
}

/** Converts parser output into ingest items, carrying build/ciUrl through. */
export function fromParsed(
  parsed: ParsedResult[],
  context: { build?: string | null; ciUrl?: string | null },
): IngestItem[] {
  return parsed.map((p) => ({
    automationId: p.automationId,
    status: p.status,
    elapsedMs: p.elapsedMs,
    failureMessage: p.failureMessage,
    stackTrace: p.stackTrace,
    build: context.build ?? null,
    ciUrl: context.ciUrl ?? null,
  }));
}

/** Unmatched-id report for a run. */
export async function unmatchedForRun(orgId: string, runId: string) {
  return db.qtTestUnmatchedAutomationId.findMany({
    where: { orgId, runId },
    select: {
      id: true,
      automationId: true,
      count: true,
      firstSeenAt: true,
      lastSeenAt: true,
    },
    orderBy: { count: "desc" },
  });
}

/** Narrows a Prisma unique-violation for callers that need to special-case it. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}
