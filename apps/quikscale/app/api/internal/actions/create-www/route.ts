import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/actions/create-www — service-to-service only.
 *
 * Called by QuikFlow's `create_www` action executor to create a real WWW
 * action item on behalf of an automation. No user session: shared
 * INTERNAL_SECRET via `x-internal-secret`, explicit orgId/actorId in the body
 * (the org's automation principal). Mirrors create-priority / provision-roles.
 */
const bodySchema = z.object({
  orgId: z.string().min(1),
  actorId: z.string().min(1),
  who: z.string().min(1), // owner userId
  what: z.string().min(1).max(500),
  when: z.string().datetime(), // ISO date-time (relative tokens are resolved upstream)
  category: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
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
    const created = await db.wWWItem.create({
      data: {
        orgId: b.orgId,
        who: b.who,
        whoIds: [b.who],
        what: b.what,
        when: new Date(b.when),
        // "not-yet-started", not "not-started". The latter appears in no enum
        // in this repo, so the status <select> matched no option and silently
        // fell back to its first — displaying every workflow-created item as
        // "Not Applicable" — and wwwStats.ts dropped it from every bucket.
        status: "not-yet-started",
        category: b.category ?? null,
        notes: b.notes ?? null,
        createdBy: b.actorId,
      },
      select: { id: true },
    });
    return NextResponse.json({ success: true, data: { id: created.id } }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create WWW item";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
