import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { badRequest, gateProjectResolved, serverError } from "@/lib/test/gate";
import { createSuiteSchema } from "@/lib/validation/testCase";
import { createTestSuite } from "@/lib/services/testSuites";

/**
 * GET  /api/test/suites?projectId= — suites with their full section tree
 * POST /api/test/suites            — create a suite (+ a default root section)
 *
 * The GET returns the whole tree in one call. Sections per suite are bounded by
 * how a human organises tests (tens, not thousands), so one query beats N+1
 * lazy-loading per node — and the sidebar tree needs all of it to render anyway.
 */

export const GET = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  try {
    // May be a cuid or a projectKey (readable URLs like /spaces/QUIKTR/test).
    const idOrKey = new URL(req.url).searchParams.get("projectId");
    if (!idOrKey) return badRequest("projectId is required");

    const { denied, projectId } = await gateProjectResolved(
      orgId,
      userId,
      idOrKey,
      "TestCase",
      "view",
    );
    if (denied) return denied;

    const suites = await db.qtTestSuite.findMany({
      where: { orgId, projectId, isDeleted: false },
      select: {
        id: true,
        name: true,
        description: true,
        archivedAt: true,
        sections: {
          where: { isDeleted: false },
          select: { id: true, name: true, parentId: true, orderNo: true },
          orderBy: [{ orderNo: "asc" }, { name: "asc" }],
        },
      },
      orderBy: { name: "asc" },
    });

    // Case counts per section in ONE grouped query rather than per-node — the
    // tree shows a count on every folder, so the naive version is an N+1.
    const counts = await db.qtTestCase.groupBy({
      by: ["sectionId"],
      where: { orgId, projectId, isDeleted: false },
      _count: { _all: true },
    });
    const countBySection = new Map(counts.map((c) => [c.sectionId, c._count._all]));

    const data = suites.map((s) => ({
      ...s,
      sections: s.sections.map((sec) => ({
        ...sec,
        caseCount: countBySection.get(sec.id) ?? 0,
      })),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    return serverError(error);
  }
});

export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  try {
    const parsed = createSuiteSchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message ?? "Invalid body");
    }
    const { projectId: idOrKey, name, description } = parsed.data;

    // Resolve BEFORE writing: the suite stores projectId, so persisting a key
    // would create a row nothing can ever find again.
    const { denied, projectId } = await gateProjectResolved(
      orgId,
      userId,
      idOrKey,
      "TestSuite",
      "create",
    );
    if (denied) return denied;

    // A suite with no section has nowhere to put a case, so seed one root
    // folder — the user can rename it. Same transaction so the suite is never
    // left unusable. Shared with the create_test_suite MCP tool — see
    // lib/services/testSuites.ts.
    const created = await createTestSuite(orgId, projectId, userId, { name, description });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: unknown) {
    return serverError(error);
  }
});
