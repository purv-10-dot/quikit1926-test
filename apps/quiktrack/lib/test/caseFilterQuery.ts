import type { Prisma } from "@prisma/client";
import { UNASSIGNED } from "./caseFilters";
import type { ListTestCasesQuery } from "@/lib/validation/testCase";

/**
 * Translates validated filter params into a Prisma `where` for QtTestCase.
 *
 * Split from the route so the mapping is unit-testable without constructing a
 * NextRequest, and so the route keeps to auth + response shaping.
 *
 * Two rules hold throughout:
 *
 *  1. Multi-value filters match ANY of the chosen values (`in`). Confirmed with the
 *     owner: consistent across Priority, Type, Labels and the rest, so every filter
 *     reads the same way rather than some being OR and some AND.
 *
 *  2. Filters combine with AND. Narrowing is the point — "Critical AND failed" is the
 *     question people actually ask.
 */

/** Splits a person filter into real user ids and the "unassigned" sentinel. */
function splitPeople(values: string[]): { ids: string[]; wantsNull: boolean } {
  const wantsNull = values.includes(UNASSIGNED);
  return { ids: values.filter((v) => v !== UNASSIGNED), wantsNull };
}

/**
 * `ownerId in [...] OR ownerId is null`, built as an OR only when the sentinel is
 * present — `{ in: [] }` matches nothing, so a sentinel-only selection must not
 * become an empty `in`.
 */
function personClause(
  column: "ownerId" | "createdBy",
  values: string[],
): Prisma.QtTestCaseWhereInput | null {
  const { ids, wantsNull } = splitPeople(values);
  if (ids.length === 0 && !wantsNull) return null;
  if (!wantsNull) return { [column]: { in: ids } };
  if (ids.length === 0) return { [column]: null };
  return { OR: [{ [column]: { in: ids } }, { [column]: null }] };
}

/**
 * An inclusive date range. `to` is pushed to the END of the chosen day: a user
 * picking "before 19 Aug" means the whole of the 19th, and comparing against
 * midnight would silently drop everything created that day.
 */
function dateClause(from?: Date, to?: Date): Prisma.DateTimeFilter | null {
  if (!from && !to) return null;
  const out: Prisma.DateTimeFilter = {};
  if (from) out.gte = from;
  if (to) {
    // `to` arrives as UTC midnight (see dateParam in lib/validation/testCase.ts).
    // The end-of-day boundary must be set in UTC too — `setHours` operates in the
    // SERVER's local timezone, which would shift the cutoff by that offset and
    // silently drop or include the wrong hours depending on where the app runs.
    const end = new Date(to);
    end.setUTCHours(23, 59, 59, 999);
    out.lte = end;
  }
  return out;
}

export function buildCaseWhere(
  orgId: string,
  projectId: string,
  q: ListTestCasesQuery,
): Prisma.QtTestCaseWhereInput {
  const and: Prisma.QtTestCaseWhereInput[] = [];

  // ── Plain columns ───────────────────────────────────────────────────────────
  if (q.ref !== undefined) and.push({ refId: q.ref });
  if (q.title) and.push({ title: { contains: q.title, mode: "insensitive" } });
  if (q.priority?.length) and.push({ priority: { in: q.priority } });
  if (q.type?.length) and.push({ type: { in: q.type } });
  if (q.automation?.length) and.push({ automationStatus: { in: q.automation } });
  if (q.approval?.length) and.push({ approvalState: { in: q.approval } });

  // automationCandidate is nullable, so "Never set" is a distinct choice from NONE.
  if (q.candidate?.length) {
    const { ids, wantsNull } = splitPeople(q.candidate);
    if (wantsNull && ids.length > 0) {
      and.push({ OR: [{ automationCandidate: { in: ids } }, { automationCandidate: null }] });
    } else if (wantsNull) {
      and.push({ automationCandidate: null });
    } else {
      and.push({ automationCandidate: { in: ids } });
    }
  }

  if (q.assignee?.length) {
    const clause = personClause("ownerId", q.assignee);
    if (clause) and.push(clause);
  }
  if (q.createdBy?.length) {
    const clause = personClause("createdBy", q.createdBy);
    if (clause) and.push(clause);
  }

  if (q.reference) {
    and.push({ refTickets: { contains: q.reference, mode: "insensitive" } });
  }

  const created = dateClause(q.createdFrom, q.createdTo);
  if (created) and.push({ createdAt: created });
  const updated = dateClause(q.updatedFrom, q.updatedTo);
  if (updated) and.push({ updatedAt: updated });

  // ── Relations ───────────────────────────────────────────────────────────────
  // Labels: ANY of the chosen ones (owner-confirmed).
  if (q.label?.length) {
    and.push({ tags: { some: { tagId: { in: q.label } } } });
  }

  // Coverage is a yes/no question about QtTestCaseIssueLink, not a value match.
  if (q.coverage === "yes") and.push({ issueLinks: { some: {} } });
  if (q.coverage === "no") and.push({ issueLinks: { none: {} } });

  /**
   * Execution status and run both reach through QtTest (the run↔case join row).
   *
   * They are pushed as SEPARATE `some` clauses only when one of them is absent. When
   * both are set they must share ONE `some`, or the query would mean "appears in run
   * R13, and failed in some possibly-different run" — which is not what selecting
   * both reads as.
   */
  const testWhere: Prisma.QtTestWhereInput = {};
  if (q.execution?.length) testWhere.currentStatusId = { in: q.execution };
  if (q.run?.length) testWhere.runId = { in: q.run };
  if (Object.keys(testWhere).length > 0) {
    // Deleted runs are excluded: a case whose only failure lives in a run someone
    // deleted should not still be reported as failing.
    and.push({ tests: { some: { ...testWhere, run: { isDeleted: false } } } });
  }

  /**
   * Defects hang off RESULTS, not off the case: case → tests → results →
   * defectLinks. Prisma has no `some` across three levels in one filter, so this
   * nests.
   *
   * "no" uses `none` at the TOP level rather than negating the innermost condition.
   * `tests: { some: { results: { none: ... } } }` would match a case that has any one
   * result without a defect — nearly every case — instead of a case with no defects
   * anywhere.
   */
  const defectPath = {
    results: { some: { defectLinks: { some: {} } } },
  } satisfies Prisma.QtTestWhereInput;
  if (q.defect === "yes") and.push({ tests: { some: defectPath } });
  if (q.defect === "no") and.push({ tests: { none: defectPath } });

  return {
    orgId,
    projectId,
    // A switch, not an include — the deleted view is how restore is reached, and
    // deleted rows never appear in the normal list.
    isDeleted: q.deleted === "true",
    ...(q.sectionId ? { sectionId: q.sectionId } : {}),
    ...(q.suiteId ? { section: { suiteId: q.suiteId } } : {}),
    // Kept for the existing quick-search box, which searches title OR automationId.
    ...(q.query
      ? {
          OR: [
            { title: { contains: q.query, mode: "insensitive" as const } },
            { automationId: { contains: q.query, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(and.length > 0 ? { AND: and } : {}),
  };
}
