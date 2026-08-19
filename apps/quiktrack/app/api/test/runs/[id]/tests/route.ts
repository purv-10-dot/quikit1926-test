import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { badRequest, gateProject, serverError } from "@/lib/test/gate";
import { listRunTestsSchema } from "@/lib/validation/testRun";

/**
 * GET /api/test/runs/{id}/tests — the runner's work list.
 *
 * Returns each test with its case title and CURRENT status, plus the pinned
 * `caseVersion`. The runner shows the steps from the pinned version, not the
 * live case, so a mid-run case edit cannot change what a tester is executing.
 *
 * QUIKTR-341 — also carries the grid's Sort + Filter bar and the case's folder
 * (for section grouping). Filters here are a NARROWER vocabulary than the case
 * repository's filter bar (lib/test/caseFilters.ts): a run's tests already belong
 * to one run, so "Test Run" as a filter would be meaningless here, and only
 * Status/Assignee/Priority/Labels are offered.
 */

type Params = { id: string };

/** `orderBy` for each sort option. Section groups by the case's folder name;
 *  a secondary `refId` keeps ties stable and matches the test's natural order. */
const ORDER_BY: Record<string, Prisma.QtTestOrderByWithRelationInput[]> = {
  section: [{ case: { section: { name: "asc" } } }, { refId: "asc" }],
  title: [{ case: { title: "asc" } }],
  priority: [{ case: { priority: "asc" } }, { refId: "asc" }],
  status: [{ currentStatus: { orderNo: "asc" } }, { refId: "asc" }],
};

export const GET = withOrgAuth<Params>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    try {
      const run = await db.qtTestRun.findFirst({
        where: { id: params.id, orgId, isDeleted: false },
        select: { id: true, projectId: true, name: true, refId: true, state: true },
      });
      if (!run) {
        return NextResponse.json(
          { success: false, error: "Run not found" },
          { status: 404 },
        );
      }

      const denied = await gateProject(orgId, userId, run.projectId, "TestRun", "view");
      if (denied) return denied;

      const parsed = listRunTestsSchema.safeParse(
        Object.fromEntries(new URL(req.url).searchParams),
      );
      if (!parsed.success) {
        return badRequest(parsed.error.issues[0]?.message ?? "Invalid query");
      }
      const q = parsed.data;

      const where: Prisma.QtTestWhereInput = {
        orgId,
        runId: params.id,
        ...(q.status ? { currentStatus: { key: q.status } } : {}),
        ...(q.mine ? { assigneeId: userId } : {}),
        ...(q.statusId ? { currentStatusId: { in: q.statusId } } : {}),
        ...(q.assignee ? { assigneeId: { in: q.assignee } } : {}),
        ...(q.priority || q.label
          ? {
              case: {
                ...(q.priority ? { priority: { in: q.priority } } : {}),
                ...(q.label ? { tags: { some: { tagId: { in: q.label } } } } : {}),
              },
            }
          : {}),
      };

      const [total, tests] = await Promise.all([
        db.qtTest.count({ where }),
        db.qtTest.findMany({
          where,
          select: {
            id: true,
            refId: true,
            caseVersion: true,
            assigneeId: true,
            currentStatus: { select: { id: true, key: true, label: true, color: true } },
            case: {
              select: {
                id: true,
                refId: true,
                title: true,
                priority: true,
                type: true,
                // The folder this case lives in — QUIKTR-341's section grouping.
                // A case belongs to one section regardless of which suite the
                // run pulled from, so this groups correctly even for a run built
                // from a hand-picked, cross-folder case list.
                section: { select: { id: true, name: true } },
                // QUIKTR-341 — the runner grid shows/edits Labels per row, like
                // the case repository grid; loaded here so the grid doesn't
                // fire one /tags request per visible row.
                tags: {
                  select: { tag: { select: { id: true, name: true, color: true } } },
                },
              },
            },
            config: { select: { id: true, name: true } },
          },
          orderBy: ORDER_BY[q.sort],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
      ]);

      // Flatten the tag join-rows to a plain label list, matching GET
      // /api/test/cases — the grid renders labels, and leaving the `{ tag:
      // {...} } }` nesting in the payload would push unwrapping onto the client.
      const items = tests.map((t) => {
        const { tags, ...caseRest } = t.case;
        return { ...t, case: { ...caseRest, labels: tags.map((tt) => tt.tag) } };
      });

      return NextResponse.json({
        success: true,
        data: { run, items, total, page: q.page, pageSize: q.pageSize },
      });
    } catch (error: unknown) {
      return serverError(error);
    }
  },
);
