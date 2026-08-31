/**
 * The shared body of the two Export WWW endpoints.
 *
 * The week-level route and the per-meeting route differ only in how they decide
 * which meetings a candidate may come from. Everything that matters — the dual
 * permission gate, the batch cap, the validation, the per-item outcome — is
 * identical, and duplicating it would let the two drift until one of them
 * quietly lost a guard.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { userCan } from "@/lib/api/permissions";
import {
  exportWwwCandidates,
  MAX_EXPORT_BATCH,
  type ExportOutcome,
} from "@/lib/reports/wwwExport";

const draftSchema = z.object({
  factId: z.string().min(1),
  who: z.string().min(1),
  whoIds: z.array(z.string().min(1)).optional(),
  what: z.string().min(1).max(1000),
  when: z.string().optional(),
  dueDateTBD: z.boolean().optional(),
  category: z.string().max(120).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export const exportBodySchema = z.object({
  items: z.array(draftSchema).min(1).max(MAX_EXPORT_BATCH),
});

export interface ExportHandlerArgs {
  orgId: string;
  userId: string;
  req: Request;
  /** Restrict candidates to one meeting, or to a week's worth of them. */
  scope: { transcriptId: string } | { transcriptIds: string[] };
}

/**
 * Validate, authorise and run one export batch.
 *
 * Returns **200 even on partial success**, with a per-item breakdown. A batch
 * where nine items were created and one was a duplicate is not a failed
 * request, and returning an error status would make the UI discard nine real
 * results.
 */
export async function handleWwwExport({
  orgId,
  userId,
  req,
  scope,
}: ExportHandlerArgs): Promise<NextResponse> {
  const body = await req.json().catch(() => null);
  const parsed = exportBodySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        success: false,
        error:
          issue?.code === "too_big"
            ? `Export at most ${MAX_EXPORT_BATCH} items at a time.`
            : (issue?.message ?? "Invalid request"),
      },
      { status: 400 },
    );
  }

  // Dual gate (doc 17 D13): editing a report and creating a WWW item are
  // different permissions, and holding one must not confer the other.
  if (!(await userCan(userId, orgId, "WWW", "create"))) {
    return NextResponse.json(
      { success: false, error: "You do not have permission to create WWW items" },
      { status: 403 },
    );
  }

  const outcome: ExportOutcome = await exportWwwCandidates(
    {
      orgId,
      origin: new URL(req.url).origin,
      // Forwarded so each item is created AS THE CALLER — never as a service
      // identity, which would break ownership, audit and notifications.
      cookie: req.headers.get("cookie") ?? "",
      ...scope,
    },
    parsed.data.items,
  );

  return NextResponse.json({ success: true, data: outcome });
}
