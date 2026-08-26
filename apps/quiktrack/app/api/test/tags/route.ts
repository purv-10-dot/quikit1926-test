import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { badRequest, gateProjectResolved, serverError } from "@/lib/test/gate";
import { createTestTagSchema } from "@/lib/validation/testCase";

/**
 * GET  /api/test/tags?projectId= — the project's labels (+ org-wide ones)
 * POST /api/test/tags            — create a label
 *
 * Labels are the spec's "Add Labels" field. `QtTestTag` and `QtTestCaseTag` have
 * existed since the first migration but nothing could author one, so the Labels
 * column rendered empty for every case. These two routes plus
 * /api/test/cases/[id]/tags close that.
 *
 * A tag with `projectId = NULL` is an org-wide label. We never create those here
 * (create always requires a project), but we DO return them, so a label seeded
 * org-wide by an import remains usable.
 */

export const GET = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  try {
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

    const tags = await db.qtTestTag.findMany({
      where: { orgId, OR: [{ projectId }, { projectId: null }] },
      select: { id: true, name: true, color: true, projectId: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: tags });
  } catch (error: unknown) {
    return serverError(error);
  }
});

export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  try {
    const parsed = createTestTagSchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message ?? "Invalid body");
    }
    const { projectId: idOrKey, name, color } = parsed.data;

    // Resolve BEFORE writing — persisting a projectKey would create a label that
    // no id-based query finds, and would sidestep the (orgId, projectId, name)
    // uniqueness.
    const { denied, projectId } = await gateProjectResolved(
      orgId,
      userId,
      idOrKey,
      "TestCase",
      "update",
    );
    if (denied) return denied;

    const created = await db.qtTestTag.create({
      data: { orgId, projectId, name, color: color ?? null },
      select: { id: true, name: true, color: true, projectId: true },
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: unknown) {
    // (orgId, projectId, name) is unique. Duplicate labels are a normal race
    // (two testers adding "smoke" at once), so answer 409 with a usable message
    // rather than a 500.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { success: false, error: "A label with that name already exists." },
        { status: 409 },
      );
    }
    return serverError(error);
  }
});
