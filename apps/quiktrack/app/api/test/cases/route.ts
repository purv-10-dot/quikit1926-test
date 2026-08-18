import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { createTestCase, TestCaseError } from "@/lib/services/testCases";
import { badRequest, gateProjectResolved, serverError } from "@/lib/test/gate";
import {
  createTestCaseSchema,
  listTestCasesSchema,
} from "@/lib/validation/testCase";

/**
 * GET  /api/test/cases?projectId=&sectionId=&query=… — list cases
 * POST /api/test/cases                              — create a case (v1)
 *
 * Project scope comes from the body/query rather than the path, so access is
 * resolved imperatively via `gateProject` (the `withProjectAccess` HOF expects
 * a route param).
 */

export const GET = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  try {
    const url = new URL(req.url);
    // May be a cuid or a projectKey (readable URLs like /spaces/QUIKTR/test).
    const idOrKey = url.searchParams.get("projectId");
    if (!idOrKey) {
      return NextResponse.json(
        { success: false, error: "projectId is required" },
        { status: 400 },
      );
    }

    const { denied, projectId } = await gateProjectResolved(
      orgId,
      userId,
      idOrKey,
      "TestCase",
      "view",
    );
    if (denied) return denied;

    const parsed = listTestCasesSchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message ?? "Invalid query");
    }
    const q = parsed.data;

    const where = {
      orgId,
      projectId,
      isDeleted: false,
      ...(q.sectionId ? { sectionId: q.sectionId } : {}),
      ...(q.suiteId ? { section: { suiteId: q.suiteId } } : {}),
      ...(q.priority ? { priority: q.priority } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.automationStatus ? { automationStatus: q.automationStatus } : {}),
      ...(q.approvalState ? { approvalState: q.approvalState } : {}),
      ...(q.query
        ? {
            OR: [
              { title: { contains: q.query, mode: "insensitive" as const } },
              { automationId: { contains: q.query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      db.qtTestCase.count({ where }),
      db.qtTestCase.findMany({
        where,
        // `select` (not include) per the repo's Prisma standard for lists.
        select: {
          id: true,
          refId: true,
          title: true,
          priority: true,
          type: true,
          automationStatus: true,
          automationId: true,
          approvalState: true,
          currentVersion: true,
          ownerId: true,
          sectionId: true,
          updatedAt: true,
          // QUIKTR-335 — optional list columns. Returned always rather than
          // behind a `?fields=` param: they are three scalars and a small join,
          // and the column customiser is a client-side preference, so gating the
          // payload on it would mean a refetch every time a column is toggled.
          estimateMs: true,
          refTickets: true,
          tags: {
            select: { tag: { select: { id: true, name: true, color: true } } },
          },
        },
        orderBy: [{ sectionId: "asc" }, { refId: "asc" }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);

    // Flatten the tag join-rows to a plain label list — the table renders
    // labels, and leaving `{ tag: {...} }` nesting in the payload would push that
    // unwrapping into every consumer.
    const items = rows.map(({ tags, ...rest }) => ({
      ...rest,
      labels: tags.map((t) => t.tag),
    }));

    return NextResponse.json({
      success: true,
      data: { items, total, page: q.page, pageSize: q.pageSize },
    });
  } catch (error: unknown) {
    return serverError(error);
  }
});

export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  try {
    const body: unknown = await req.json();
    const idOrKey =
      typeof body === "object" && body !== null && "projectId" in body
        ? String((body as { projectId: unknown }).projectId)
        : "";
    if (!idOrKey) {
      return NextResponse.json(
        { success: false, error: "projectId is required" },
        { status: 400 },
      );
    }

    // Resolve BEFORE creating: the case row stores projectId, and the
    // automationId uniqueness index is scoped by it. A persisted key would
    // silently escape that constraint.
    const { denied, projectId } = await gateProjectResolved(
      orgId,
      userId,
      idOrKey,
      "TestCase",
      "create",
    );
    if (denied) return denied;

    const parsed = createTestCaseSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message ?? "Invalid body");
    }

    const created = await createTestCase(orgId, projectId, userId, parsed.data);
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof TestCaseError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      );
    }
    return serverError(error);
  }
});
