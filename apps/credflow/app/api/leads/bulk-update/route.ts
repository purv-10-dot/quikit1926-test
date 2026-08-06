import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { filterPayloadSchema } from "@/lib/validators/lead-filter";
import {
  bulkUpdateLeads,
  type BulkScope,
  type BulkFieldUpdate,
} from "@/lib/services/leads/bulk-update";

export const runtime = "nodejs";

/**
 * v1 ALLOWLIST: bulk-update may only write these dynamicFields keys. Tagging is
 * the only shipped use case; the engine underneath is general, but the API
 * refuses any other field so this endpoint can't be used to mass-edit arbitrary
 * columns until that is explicitly designed + permissioned.
 */
const ALLOWED_FIELDS = new Set<string>(["lead_tagging"]);

/** Hard ceiling on a synchronous bulk update. Above this we should enqueue a
 *  background job (not yet wired — UAT Redis down). Until then, refuse rather
 *  than risk a request timeout mid-write. */
const SYNC_MAX = 20_000;

const scopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("matching"), filter: filterPayloadSchema }),
  z.object({ kind: z.literal("ids"), ids: z.array(z.string().min(1)).min(1).max(SYNC_MAX) }),
  z.object({
    kind: z.literal("count"),
    filter: filterPayloadSchema,
    count: z.number().int().min(1).max(SYNC_MAX),
  }),
]);

const bodySchema = z.object({
  scope: scopeSchema,
  updates: z
    .array(
      z.object({
        field: z.string().min(1),
        value: z.string(),
        mode: z.enum(["replace", "append"]).default("replace"),
      }),
    )
    .min(1)
    .max(10),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    // Bulk field-write is an edit action.
    await assertModule(user, "leads", "edit");

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // v1 field allowlist — reject any field not explicitly permitted.
    const badField = parsed.data.updates.find((u) => !ALLOWED_FIELDS.has(u.field));
    if (badField) {
      return NextResponse.json(
        { error: `Field "${badField.field}" is not permitted for bulk update.` },
        { status: 403 },
      );
    }

    const result = await bulkUpdateLeads({
      user,
      scope: parsed.data.scope as BulkScope,
      updates: parsed.data.updates as BulkFieldUpdate[],
    });

    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    return errorResponse(e);
  }
}