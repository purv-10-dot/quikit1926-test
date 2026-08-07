import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { createTestCase, TestCaseError } from "@/lib/services/testCases";
import { badRequest, gateProject, serverError } from "@/lib/test/gate";
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
    const projectId = url.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "projectId is required" },
        { status: 400 },
      );
    }

    const denied = await gateProject(orgId, userId, projectId, "TestCase", "view");
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
        },
        orderBy: [{ sectionId: "asc" }, { refId: "asc" }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: { items: rows, total, page: q.page, pageSize: q.pageSize },
    });
  } catch (error: unknown) {
    return serverError(error);
  }
});

export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  try {
    const body: unknown = await req.json();
    const projectId =
      typeof body === "object" && body !== null && "projectId" in body
        ? String((body as { projectId: unknown }).projectId)
        : "";
    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "projectId is required" },
        { status: 400 },
      );
    }

    const denied = await gateProject(orgId, userId, projectId, "TestCase", "create");
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
