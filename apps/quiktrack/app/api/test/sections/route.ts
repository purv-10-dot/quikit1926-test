import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { badRequest, gateProject, serverError } from "@/lib/test/gate";
import { createSectionSchema } from "@/lib/validation/testCase";

/** POST /api/test/sections — add a folder to a suite's tree. */
export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  try {
    const parsed = createSectionSchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message ?? "Invalid body");
    }
    const { suiteId, parentId, name } = parsed.data;

    const suite = await db.qtTestSuite.findFirst({
      where: { id: suiteId, orgId, isDeleted: false },
      select: { projectId: true },
    });
    if (!suite) {
      return NextResponse.json(
        { success: false, error: "Suite not found" },
        { status: 404 },
      );
    }

    const denied = await gateProject(
      orgId,
      userId,
      suite.projectId,
      "TestSuite",
      "create",
    );
    if (denied) return denied;

    // The parent must live in the same suite — otherwise the new folder would
    // appear under a tree it doesn't belong to.
    if (parentId) {
      const parent = await db.qtTestSection.findFirst({
        where: { id: parentId, orgId, suiteId, isDeleted: false },
        select: { id: true },
      });
      if (!parent) return badRequest("Parent section not found in this suite");
    }

    // Append to the end of the sibling list.
    const last = await db.qtTestSection.findFirst({
      where: { orgId, suiteId, parentId: parentId ?? null, isDeleted: false },
      select: { orderNo: true },
      orderBy: { orderNo: "desc" },
    });

    const created = await db.qtTestSection.create({
      data: {
        orgId,
        suiteId,
        parentId: parentId ?? null,
        name,
        orderNo: (last?.orderNo ?? -1) + 1,
      },
      select: { id: true, name: true, parentId: true, orderNo: true },
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: unknown) {
    return serverError(error);
  }
});
