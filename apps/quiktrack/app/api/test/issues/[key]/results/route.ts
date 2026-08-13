import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { badRequest, gateProject, serverError } from "@/lib/test/gate";

/**
 * GET /api/test/issues/{key}/results?tab=&page=
 *
 * Powers the "QuikTest: Results" panel on a work item. One endpoint serves all
 * six tabs, because they are all views over the same relationship set and
 * splitting them would mean six round trips for a panel that opens as a unit.
 *
 * A work item connects to test data two ways, and BOTH belong here:
 *   • coverage — cases linked to this issue as a requirement (case → issue)
 *   • defects  — results that raised this issue as a bug (result → issue)
 * A panel showing only one would answer "what verifies this?" without
 * "what did this break?", or the reverse.
 */

type Params = { key: string };

const querySchema = z.object({
  tab: z
    .enum(["all", "tests", "cases", "runs", "plans", "milestones"])
    .default("all"),
  page: z.coerce.number().int().min(1).default(1),
  /** 5 matches the reference UI's pagination. */
  pageSize: z.coerce.number().int().min(1).max(50).default(5),
});

export const GET = withOrgAuth<Params>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    try {
      const parsed = querySchema.safeParse(
        Object.fromEntries(new URL(req.url).searchParams),
      );
      if (!parsed.success) {
        return badRequest(parsed.error.issues[0]?.message ?? "Invalid query");
      }
      const { tab, page, pageSize } = parsed.data;

      // The route takes an issue KEY (QT-123) because that is what the work-item
      // view has to hand.
      const issue = await db.qtIssue.findFirst({
        where: { key: params.key, orgId, isDeleted: false },
        select: { id: true, key: true, projectId: true },
      });
      if (!issue) {
        return NextResponse.json(
          { success: false, error: "Work item not found" },
          { status: 404 },
        );
      }

      const denied = await gateProject(
        orgId,
        userId,
        issue.projectId,
        "TestCase",
        "view",
      );
      if (denied) return denied;

      // ── the two relationship sets ────────────────────────────────────────
      const [coverageLinks, defectLinks] = await Promise.all([
        db.qtTestCaseIssueLink.findMany({
          where: { orgId, issueId: issue.id },
          select: { type: true, caseId: true },
        }),
        db.qtTestDefectLink.findMany({
          where: { orgId, issueId: issue.id },
          select: { resultId: true },
        }),
      ]);

      const coveredCaseIds = coverageLinks.map((l) => l.caseId);
      const defectResultIds = defectLinks.map((l) => l.resultId);

      // Tests reachable from either side: a test of a covering case, or a test
      // whose result raised this issue.
      const [coveredTests, defectResults] = await Promise.all([
        coveredCaseIds.length > 0
          ? db.qtTest.findMany({
              where: { orgId, caseId: { in: coveredCaseIds } },
              select: { id: true },
            })
          : Promise.resolve([]),
        defectResultIds.length > 0
          ? db.qtTestResult.findMany({
              where: { orgId, id: { in: defectResultIds } },
              select: { testId: true },
            })
          : Promise.resolve([]),
      ]);

      const testIds = Array.from(
        new Set([
          ...coveredTests.map((t) => t.id),
          ...defectResults.map((r) => r.testId),
        ]),
      );

      if (testIds.length === 0) {
        return NextResponse.json({
          success: true,
          data: {
            issueKey: issue.key,
            tab,
            items: [],
            total: 0,
            page,
            pageSize,
            counts: {},
            coverage: { cases: coveredCaseIds.length, defects: defectResultIds.length },
          },
        });
      }

      // Status counts across every related test — feeds the donut. Computed over
      // the WHOLE set, not the current page, so the summary doesn't change as
      // the user paginates.
      const [grouped, statuses] = await Promise.all([
        db.qtTest.groupBy({
          by: ["currentStatusId"],
          where: { orgId, id: { in: testIds } },
          _count: { _all: true },
        }),
        db.qtTestStatus.findMany({
          where: { orgId, isDeleted: false },
          select: { id: true, key: true },
        }),
      ]);
      const keyById = new Map(statuses.map((s) => [s.id, s.key]));
      const counts: Record<string, number> = {};
      for (const row of grouped) {
        const k = keyById.get(row.currentStatusId) ?? "unknown";
        counts[k] = (counts[k] ?? 0) + row._count._all;
      }

      // ── tab payloads ────────────────────────────────────────────────────
      const skip = (page - 1) * pageSize;

      if (tab === "cases") {
        const where = { orgId, id: { in: coveredCaseIds }, isDeleted: false };
        const [total, items] = await Promise.all([
          db.qtTestCase.count({ where }),
          db.qtTestCase.findMany({
            where,
            select: {
              id: true,
              refId: true,
              title: true,
              priority: true,
              type: true,
              approvalState: true,
              automationId: true,
            },
            orderBy: { refId: "asc" },
            skip,
            take: pageSize,
          }),
        ]);
        return NextResponse.json({
          success: true,
          data: { issueKey: issue.key, tab, items, total, page, pageSize, counts },
        });
      }

      if (tab === "runs" || tab === "plans" || tab === "milestones") {
        const runWhere = { orgId, isDeleted: false, tests: { some: { id: { in: testIds } } } };

        if (tab === "runs") {
          const [total, items] = await Promise.all([
            db.qtTestRun.count({ where: runWhere }),
            db.qtTestRun.findMany({
              where: runWhere,
              select: {
                id: true,
                refId: true,
                name: true,
                state: true,
                source: true,
                build: true,
                createdAt: true,
                milestone: { select: { id: true, name: true } },
                plan: { select: { id: true, name: true } },
              },
              orderBy: { createdAt: "desc" },
              skip,
              take: pageSize,
            }),
          ]);
          return NextResponse.json({
            success: true,
            data: { issueKey: issue.key, tab, items, total, page, pageSize, counts },
          });
        }

        // Plans and milestones are rollups of the related runs — distinct, so a
        // milestone with ten related runs appears once.
        const runs = await db.qtTestRun.findMany({
          where: runWhere,
          select: {
            plan: { select: { id: true, name: true } },
            milestone: { select: { id: true, name: true, dueDate: true, state: true } },
          },
        });

        const seen = new Map<string, { id: string; name: string; dueDate?: Date | null; state?: string }>();
        for (const r of runs) {
          const entity = tab === "plans" ? r.plan : r.milestone;
          if (entity && !seen.has(entity.id)) seen.set(entity.id, entity);
        }
        const all = Array.from(seen.values());
        return NextResponse.json({
          success: true,
          data: {
            issueKey: issue.key,
            tab,
            items: all.slice(skip, skip + pageSize),
            total: all.length,
            page,
            pageSize,
            counts,
          },
        });
      }

      // "all" and "tests" both list tests. `all` is the default landing view in
      // the reference UI and shows the same rows, so they share this branch.
      const where = { orgId, id: { in: testIds } };
      const [total, items] = await Promise.all([
        db.qtTest.count({ where }),
        db.qtTest.findMany({
          where,
          select: {
            id: true,
            refId: true,
            caseVersion: true,
            currentStatus: { select: { key: true, label: true, color: true } },
            case: { select: { id: true, refId: true, title: true } },
            config: { select: { name: true } },
            run: {
              select: {
                id: true,
                refId: true,
                name: true,
                state: true,
                projectId: true,
                project: { select: { id: true, name: true } },
                milestone: { select: { id: true, name: true } },
              },
            },
            // Latest result supplies the "By X · timestamp" line on the
            // expanded row. Take 1 — the panel shows the most recent execution.
            results: {
              select: {
                id: true,
                source: true,
                executedBy: true,
                executedAt: true,
                elapsedMs: true,
              },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: 1,
            },
          },
          orderBy: { refId: "desc" },
          skip,
          take: pageSize,
        }),
      ]);

      return NextResponse.json({
        success: true,
        data: {
          issueKey: issue.key,
          tab,
          items: items.map((t) => ({
            ...t,
            latestResult: t.results[0] ?? null,
            results: undefined,
          })),
          total,
          page,
          pageSize,
          counts,
        },
      });
    } catch (error: unknown) {
      return serverError(error);
    }
  },
);
