import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { notifyPriorityAssignment } from "@/lib/services/priorityNotifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/actions/create-priority  — service-to-service only.
 *
 * Called by QuikFlow's `create_priority` action executor to create a real
 * Priority on behalf of an automation. There is no user session here, so this
 * mirrors the `/api/internal/provision-roles` convention: shared INTERNAL_SECRET
 * via `x-internal-secret`, with an explicit `orgId` + `actorId` in the body
 * (the org's automation principal). Never widens the user-facing
 * `POST /api/priority` route's auth.
 */
const bodySchema = z.object({
  orgId: z.string().min(1),
  actorId: z.string().min(1),
  name: z.string().min(1).max(200),
  owner: z.string().min(1),
  quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]),
  year: z.number().int().min(2020).max(2099),
  teamId: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  relatedKpiId: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_SECRET;
  const provided = req.headers.get("x-internal-secret");
  if (!secret || !provided || provided !== secret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const b = parsed.data;

  try {
    const created = await db.priority.create({
      data: {
        orgId: b.orgId,
        name: b.name,
        description: b.description ?? null,
        owner: b.owner,
        teamId: b.teamId ?? null,
        quarter: b.quarter,
        year: b.year,
        overallStatus: "not-yet-started",
        createdBy: b.actorId,
      },
      select: { id: true },
    });

    // Notify the owner (fire-and-forget — never fail the action on notify error).
    void notifyPriorityAssignment({
      orgId: b.orgId,
      priorityId: created.id,
      priorityName: b.name,
      quarter: b.quarter,
      year: b.year,
      creatorUserId: b.actorId,
      ownerUserId: b.owner,
    }).catch(() => {});

    return NextResponse.json({ success: true, data: { id: created.id } }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create priority";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
