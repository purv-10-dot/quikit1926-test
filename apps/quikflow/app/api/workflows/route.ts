import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@quikit/database";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { triggerLabel, actionLabel, resolveOwnerNames } from "@/lib/api/serialize";
import type { WorkflowDTO } from "@/types";

const STATUS_VALUES = ["Draft", "Active", "Paused", "Archived"] as const;

/**
 * GET /api/workflows?status=Active
 *
 * Lists workflows visible to the caller in the active org: every org-wide
 * workflow plus the caller's own personal workflows (PRD FR-E2/FR-E3).
 */
export const GET = withOrgAuth(async ({ orgId, userId }, req) => {
  const statusParam = req.nextUrl.searchParams.get("status");
  const status = STATUS_VALUES.find((s) => s === statusParam);

  const rows = await db.wfWorkflow.findMany({
    where: {
      orgId,
      ...(status ? { status } : {}),
      OR: [{ scope: "org" }, { scope: "personal", ownerId: userId }],
    },
    select: {
      id: true,
      name: true,
      app: true,
      scope: true,
      status: true,
      ownerId: true,
      trigger: true,
      graphNodes: true,
      lastRunAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const owners = await resolveOwnerNames(rows.map((r) => r.ownerId));

  const data: WorkflowDTO[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    app: r.app,
    scope: r.scope,
    status: r.status,
    ownerId: r.ownerId,
    ownerName: owners.get(r.ownerId) ?? null,
    triggerLabel: triggerLabel(r.trigger),
    actionLabel: actionLabel(r.graphNodes),
    lastRunAt: r.lastRunAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
  }));

  return NextResponse.json({ success: true, data });
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  app: z.string().min(1).max(64),
  scope: z.enum(["org", "personal"]).default("personal"),
  trigger: z.record(z.unknown()).default({ type: "event" }),
  graphNodes: z.array(z.unknown()).default([]),
  graphEdges: z.array(z.unknown()).default([]),
});

/**
 * POST /api/workflows — create a workflow (Draft). Org-wide workflows require
 * App Admin; members may only create personal ones (PRD FR-E1/FR-E4).
 */
export const POST = withOrgAuth(async ({ orgId, userId, isAdmin }, req) => {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const input = parsed.data;

  if (input.scope === "org" && !isAdmin) {
    return NextResponse.json(
      { success: false, error: "Only App Admins can create org-wide workflows" },
      { status: 403 },
    );
  }

  const created = await db.wfWorkflow.create({
    data: {
      orgId,
      app: input.app,
      name: input.name,
      scope: input.scope,
      ownerId: userId,
      createdBy: userId,
      status: "Draft",
      trigger: input.trigger as Prisma.InputJsonValue,
      graphNodes: input.graphNodes as Prisma.InputJsonValue,
      graphEdges: input.graphEdges as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  return NextResponse.json({ success: true, data: { id: created.id } }, { status: 201 });
});
