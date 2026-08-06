/**
 * POST /api/integrations/github/backfill  { repoId }
 *
 * Kicks a bounded historical backfill for one linked repo. Admin-only. Runs
 * synchronously and returns per-type counts; for very large repos a later phase
 * will move this to a queued job with cursor resumption.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { backfillRepo } from "@/lib/services/github/backfill-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Backfill fans out several GitHub calls; give it headroom over the default.
export const maxDuration = 60;

const bodySchema = z.object({ repoId: z.string().trim().min(1) });

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as { orgId: string };

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const result = await backfillRepo(orgId, parsed.data.repoId);
    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Backfill failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
