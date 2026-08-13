import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { saveApiKeyConnection, FATHOM_PROVIDER_ID } from "@/lib/connectors";
import { validateKey } from "@/lib/connectors/fathom";

export const runtime = "nodejs";

const bodySchema = z.object({
  apiKey: z.string().min(10, "Enter a valid Fathom API key."),
  label: z.string().min(1).max(120).optional(),
  // Optional Standard-Webhooks signing secret (whsec_…) for the real-time
  // webhook path. Stored encrypted; not needed for the poll path.
  webhookSecret: z.string().min(1).max(200).optional(),
});

/**
 * POST /api/connections/fathom — connect a Fathom.ai account by API key.
 * Validates the key against Fathom, then stores it encrypted on a WfConnection.
 * Any org member may connect (org-scoped), mirroring the mail-connection policy.
 */
export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const check = await validateKey(parsed.data.apiKey);
  if (!check.ok) {
    return NextResponse.json({ success: false, error: check.error ?? "Invalid Fathom API key." }, { status: 400 });
  }

  const label = parsed.data.label?.trim() || check.label || "Fathom account";
  const row = await saveApiKeyConnection(orgId, userId, FATHOM_PROVIDER_ID, label, parsed.data.apiKey, {
    webhookSecret: parsed.data.webhookSecret?.trim() || undefined,
  });
  return NextResponse.json({ success: true, data: { id: row.id, label: row.label } }, { status: 201 });
});
