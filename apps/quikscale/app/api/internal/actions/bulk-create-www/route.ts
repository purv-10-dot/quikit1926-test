import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/actions/bulk-create-www — service-to-service only.
 *
 * Called by QuikFlow's `www.bulk.import` executor (e.g. turning AI-extracted
 * meeting to-dos into WWW action items). Creates many WWW rows in one call.
 * Same INTERNAL_SECRET convention; org + actor supplied in the body.
 */
const itemSchema = z.object({
  who: z.string().min(1),
  what: z.string().min(1).max(500),
  when: z.string().datetime(),
  category: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const bodySchema = z.object({
  orgId: z.string().min(1),
  actorId: z.string().min(1),
  items: z.array(itemSchema).min(1).max(200),
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
    const { count } = await db.wWWItem.createMany({
      data: b.items.map((it) => ({
        orgId: b.orgId,
        who: it.who,
        whoIds: [it.who],
        what: it.what,
        when: new Date(it.when),
        status: "not-started",
        category: it.category ?? null,
        notes: it.notes ?? null,
        createdBy: b.actorId,
      })),
    });
    return NextResponse.json({ success: true, data: { count } }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to bulk-create WWW items";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
